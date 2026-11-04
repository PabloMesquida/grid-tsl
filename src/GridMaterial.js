import { NodeMaterial, LightingModel, Color, Vector2 } from 'three/webgpu'
import {
  uniform, float, positionWorld, positionLocal, normalLocal, normalWorld, modelScale, diffuseColor,
  mix, dFdx, dFdy, smoothstep, texture
} from 'three/tsl'
import {
  footprint, boxProjection, gridLines, crossPattern, unionAxes, radialFade
} from './gridNodes.js'
import { getNoiseTexture, NOISE_SIZE, MOTTLE_CELLS } from './noiseTexture.js'

const PROJECTIONS = ['floor', 'box']

// Valores iniciales. Ningún color está fijado en el shader: todo llega por uniforms.
export const GRID_DEFAULTS = {
  projection: 'floor',

  backgroundColor: '#101114',

  primaryColor: '#5c6370',
  primarySpacing: 10,
  primaryThickness: 0.05,

  secondaryColor: '#2a2d33',
  secondarySpacing: 1,
  secondaryThickness: 0.015,

  crossColor: '#3d424b',
  crossSpacing: 1,
  crossSize: 0.2,
  crossThickness: 0.02,

  faceShading: 0,

  receiveShadows: false,
  shadowColor: '#000000',
  shadowIntensity: 0.5,

  matte: false,
  grain: 0.35,
  grainSize: 0.02,
  mottle: 0.25,
  mottleSize: 4,
  lineWear: 0.6,
  lightPool: 3,
  lightPoolRadius: 30,

  fade: true,
  fadeRadius: 60,
  fadeSoftness: 0.7,
  fadeCenter: [0, 0],
}

const COLOR_KEYS = ['backgroundColor', 'primaryColor', 'secondaryColor', 'crossColor', 'shadowColor']
const SCALAR_KEYS = [
  'primarySpacing', 'primaryThickness',
  'secondarySpacing', 'secondaryThickness',
  'crossSpacing', 'crossSize', 'crossThickness',
  'faceShading', 'shadowIntensity',
  'grain', 'grainSize', 'mottle', 'mottleSize', 'lineWear', 'lightPool', 'lightPoolRadius',
  'fadeRadius', 'fadeSoftness',
]

/**
 * Modelo de iluminación mínimo: no ilumina, solo recoge la máscara de sombra de las luces
 * directas (como ShadowMaskModel de three) y oscurece el color de la rejilla con ella.
 */
class GridShadowModel extends LightingModel {

  constructor(color, intensity) {
    super()
    this.color = color
    this.intensity = intensity
    this.shadowMask = float(1).toVar('gridShadowMask')
  }

  direct({ lightNode }) {
    if (lightNode.shadowNode !== null) this.shadowMask.mulAssign(lightNode.shadowNode)
  }

  finish({ context }) {
    const amount = this.shadowMask.oneMinus().mul(this.intensity)
    context.outgoingLight.rgb.assign(mix(diffuseColor.rgb, this.color, amount))
  }
}

/**
 * Material de rejilla procedural. Capas, de abajo arriba: fondo → líneas secundarias → cruces → líneas principales.
 *
 * Las magnitudes derivadas (1/separación, grosor y tamaño relativos a la celda, radios de
 * fundido) se calculan en CPU al cambiar un parámetro, así el shader solo multiplica.
 */
export class GridMaterial extends NodeMaterial {

  static get type() { return 'GridMaterial' }

  constructor(params = {}) {
    super()
    this.isGridMaterial = true

    const u = this._uniforms = {
      backgroundColor: uniform(new Color()),
      primaryColor: uniform(new Color()),
      secondaryColor: uniform(new Color()),
      crossColor: uniform(new Color()),
      shadowColor: uniform(new Color()),

      primaryScale: uniform(1),     // 1 / separación
      primaryWidth: uniform(0),     // grosor / separación
      secondaryScale: uniform(1),
      secondaryWidth: uniform(0),
      crossScale: uniform(1),
      crossWidth: uniform(0),
      crossLength: uniform(0),      // tamaño / separación

      faceShading: uniform(0),
      shadowIntensity: uniform(0),

      grain: uniform(0),
      grainScale: uniform(1),       // 1 / tamaño de una repetición del grano
      mottle: uniform(0),
      mottleScale: uniform(1),      // 1 / tamaño de una repetición de las manchas
      lineWear: uniform(0),
      lightPool: uniform(0),
      lightPoolRadius: uniform(1),

      fadeCenter: uniform(new Vector2()),
      fadeInner: uniform(0),
      fadeOuter: uniform(1),
    }

    this._values = Object.fromEntries(SCALAR_KEYS.map((key) => [key, GRID_DEFAULTS[key]]))
    this._fade = false
    this._receiveShadows = false
    this._matte = false
    this._projection = null
    this._fadeNode = radialFade(positionWorld.xz, u.fadeCenter, u.fadeInner, u.fadeOuter)

    this.setParameters({ ...GRID_DEFAULTS, ...params })
  }

  // --- Grafo de nodos -----------------------------------------------------------------
  _buildColorNode() {
    const u = this._uniforms
    let p, dx, dy

    if (this._projection === 'box') {
      // Espacio local escalado: la rejilla sigue al objeto pero mantiene unidades de mundo.
      // Las derivadas se toman sobre la posición 3D (continua) y se proyectan igual que ella.
      const pos = positionLocal.mul(modelScale)
      const project = boxProjection(normalLocal)
      p = project(pos)
      dx = project(dFdx(pos))
      dy = project(dFdy(pos))
    } else {
      p = positionWorld.xz
      dx = dFdx(p)
      dy = dFdy(p)
    }

    const fp = footprint(dx, dy)   // una sola evaluación de la huella para todo el material

    let primary = unionAxes(gridLines(p.mul(u.primaryScale), u.primaryWidth, fp.mul(u.primaryScale)))
    let secondary = unionAxes(gridLines(p.mul(u.secondaryScale), u.secondaryWidth, fp.mul(u.secondaryScale)))
    let cross = crossPattern(p.mul(u.crossScale), u.crossWidth, u.crossLength, fp.mul(u.crossScale))

    let color = u.backgroundColor

    if (this._matte) {
      // Con gradientes explícitos los mipmaps tampoco saltan en las aristas de la proyección 'box'.
      const noise = getNoiseTexture()
      const sampleNoise = (scale) => texture(noise, p.mul(scale)).grad(dx.mul(scale), dy.mul(scale))
      const grain = sampleNoise(u.grainScale).r
      const mottle = sampleNoise(u.mottleScale).g

      // El desgaste reutiliza las manchas: las zonas claras y las líneas gastadas coinciden.
      const lines = mix(float(1), smoothstep(0.3, 0.7, mottle), u.lineWear)
      primary = primary.mul(lines)
      secondary = secondary.mul(lines)
      cross = cross.mul(lines)

      // Solo se modula el fondo, para que la luz no queme las líneas. Las variaciones están
      // centradas en 1: de lejos el ruido vale 0.5 y el color medio no cambia.
      const light = radialFade(positionWorld.xz, u.fadeCenter, float(0), u.lightPoolRadius)
      color = color
        .mul(grain.sub(0.5).mul(u.grain).mul(2).add(1))
        .mul(mottle.sub(0.5).mul(u.mottle).mul(2).add(1))
        .mul(light.mul(u.lightPool).add(1))
    }

    color = mix(color, u.secondaryColor, secondary)
    color = mix(color, u.crossColor, cross)
    color = mix(color, u.primaryColor, primary)

    // Sombreado por cara barato: las caras que no miran hacia arriba se oscurecen.
    return color.mul(u.faceShading.mul(normalWorld.y.max(0).oneMinus()).oneMinus())
  }

  /** Asigna varios parámetros a la vez. */
  setParameters(params) {
    for (const key in params) {
      if (key in GRID_DEFAULTS) this[key] = params[key]
    }
    return this
  }

  /**
   * Parámetros actuales como objeto plano (colores en '#hex' sRGB, números redondeados).
   * Es serializable a JSON y se puede pasar tal cual a `new GridMaterial(params)`.
   */
  getParameters() {
    const round = (n) => Math.round(n * 1e4) / 1e4
    const params = {}
    for (const key in GRID_DEFAULTS) {
      if (COLOR_KEYS.includes(key)) params[key] = `#${this[key].getHexString()}`
      else if (SCALAR_KEYS.includes(key)) params[key] = round(this[key])
      else if (key === 'fadeCenter') params[key] = [round(this.fadeCenter.x), round(this.fadeCenter.y)]
      else params[key] = this[key]
    }
    return params
  }

  // --- Proyección -----------------------------------------------------------------------
  // 'floor': plano XZ del mundo (suelos). 'box': cada cara usa el plano de su eje dominante,
  // en el espacio del objeto (cubos, paredes). Cambiarla recompila el material.
  get projection() { return this._projection }
  set projection(value) {
    if (!PROJECTIONS.includes(value)) throw new Error(`GridMaterial: unknown projection '${value}'`)
    if (value === this._projection) return
    this._projection = value
    this.colorNode = this._buildColorNode()
    this.needsUpdate = true
  }

  // --- Superficie mate ---------------------------------------------------------------------
  // Interruptor de compilación: añade grano, manchas, desgaste de líneas y una zona de luz.
  // Desactivado, el shader no incluye nada de esto ni usa la textura de ruido.
  get matte() { return this._matte }
  set matte(value) {
    value = Boolean(value)
    if (value === this._matte) return
    this._matte = value
    this.colorNode = this._buildColorNode()
    this.needsUpdate = true
  }

  // --- Sombras -------------------------------------------------------------------------
  // Interruptor de compilación: activa `lights` con un modelo que solo aplica la máscara de
  // sombra, sin iluminar. La malla también necesita `receiveShadow = true`.
  get receiveShadows() { return this._receiveShadows }
  set receiveShadows(value) {
    value = Boolean(value)
    if (value === this._receiveShadows) return
    this._receiveShadows = value
    this.lights = value
    this.needsUpdate = true
  }

  setupLightingModel() {
    const u = this._uniforms
    return new GridShadowModel(u.shadowColor, u.shadowIntensity)
  }

  // Con `lights` activo y sin luces en la escena, NodeMaterial devolvería negro.
  setupOutgoingLight() {
    return diffuseColor.rgb
  }

  // --- Fundido circular -----------------------------------------------------------------
  // Es un interruptor de compilación: desactivado, el material es opaco y el shader no
  // incluye el cálculo del fundido ni el blending.
  get fade() { return this._fade }
  set fade(value) {
    value = Boolean(value)
    if (value === this._fade) return
    this._fade = value
    this.transparent = value
    this.opacityNode = value ? this._fadeNode : null
    this.needsUpdate = true
  }

  get fadeCenter() { return this._uniforms.fadeCenter.value }
  /** Acepta `Vector2`, `{ x, y }` o `[x, z]`. */
  set fadeCenter(v) {
    const center = this._uniforms.fadeCenter.value
    if (Array.isArray(v)) center.set(v[0], v[1])
    else center.copy(v)
  }

  // --- Derivados en CPU -----------------------------------------------------------------
  _updateDerived() {
    const v = this._values
    const u = this._uniforms

    u.primaryScale.value = 1 / Math.max(v.primarySpacing, 1e-4)
    u.primaryWidth.value = Math.min(v.primaryThickness * u.primaryScale.value, 0.5)

    u.secondaryScale.value = 1 / Math.max(v.secondarySpacing, 1e-4)
    u.secondaryWidth.value = Math.min(v.secondaryThickness * u.secondaryScale.value, 0.5)

    u.crossScale.value = 1 / Math.max(v.crossSpacing, 1e-4)
    u.crossWidth.value = Math.min(v.crossThickness * u.crossScale.value, 0.5)
    u.crossLength.value = Math.min(Math.max(v.crossSize, v.crossThickness) * u.crossScale.value, 1)

    u.faceShading.value = Math.min(Math.max(v.faceShading, 0), 1)
    u.shadowIntensity.value = Math.min(Math.max(v.shadowIntensity, 0), 1)

    u.grain.value = Math.min(Math.max(v.grain, 0), 1)
    u.grainScale.value = 1 / (Math.max(v.grainSize, 1e-4) * NOISE_SIZE)
    u.mottle.value = Math.min(Math.max(v.mottle, 0), 1)
    u.mottleScale.value = 1 / (Math.max(v.mottleSize, 1e-4) * MOTTLE_CELLS)
    u.lineWear.value = Math.min(Math.max(v.lineWear, 0), 1)
    u.lightPool.value = Math.max(v.lightPool, 0)
    u.lightPoolRadius.value = Math.max(v.lightPoolRadius, 1e-3)

    const outer = Math.max(v.fadeRadius, 1e-3)
    u.fadeOuter.value = outer
    u.fadeInner.value = outer * (1 - Math.min(Math.max(v.fadeSoftness, 1e-3), 1))
  }
}

// Getters/setters generados para colores (aceptan '#hex', número o THREE.Color)…
for (const key of COLOR_KEYS) {
  Object.defineProperty(GridMaterial.prototype, key, {
    get() { return this._uniforms[key].value },
    set(v) { this._uniforms[key].value.set(v) },
  })
}

// …y para magnitudes escalares (actualizan los uniforms derivados).
for (const key of SCALAR_KEYS) {
  Object.defineProperty(GridMaterial.prototype, key, {
    get() { return this._values[key] },
    set(v) {
      this._values[key] = v
      this._updateDerived()
    },
  })
}
