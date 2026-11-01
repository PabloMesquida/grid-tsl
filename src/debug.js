import GUI from 'lil-gui'
import { GRID_DEFAULTS } from './GridMaterial.js'

// Panel de edición para GridMaterial. Se importa aparte ('grid-tsl/debug') para que
// lil-gui no entre en el bundle de producción.

const toJS = (params) => {
  const value = (v) => (typeof v === 'string' ? `'${v}'` : Array.isArray(v) ? `[${v.join(', ')}]` : String(v))
  const lines = Object.entries(params).map(([key, v]) => `  ${key}: ${value(v)},`)
  return `new GridMaterial({\n${lines.join('\n')}\n})`
}

const toJSON = (params) => JSON.stringify(params, null, 2).replace(/\[\s+([^\]]*?)\s+\]/g, (_, items) => `[${items.replace(/\s+/g, ' ')}]`)

/**
 * Crea un panel lil-gui que edita el material en vivo y permite copiar los parámetros
 * resultantes para pegarlos en el código.
 *
 * @param {GridMaterial} material
 * @param {object} [options]
 * @param {GUI} [options.parent]   GUI existente donde añadir el panel como carpeta.
 * @param {string} [options.title]
 * @param {(params: object) => void} [options.onChange]  Recibe los parámetros tras cada cambio.
 * @returns {{ gui: GUI, refresh: () => void, dispose: () => void }}
 */
export function createGridDebug(material, { parent, title = 'Grid', onChange } = {}) {
  const gui = parent ? parent.addFolder(title) : new GUI({ title, width: 280 })

  // lil-gui edita los colores como '#hex' (sRGB), igual que se escriben en el código
  const colors = {}
  const syncColors = () => {
    for (const key of ['backgroundColor', 'primaryColor', 'secondaryColor', 'crossColor']) {
      colors[key] = `#${material[key].getHexString()}`
    }
  }
  syncColors()

  const changed = () => onChange?.(material.getParameters())
  const color = (folder, key) =>
    folder.addColor(colors, key).name('color').onChange((v) => { material[key] = v; changed() })
  const number = (folder, key, name, min, max, step) =>
    folder.add(material, key, min, max, step).name(name).onChange(changed)

  const primary = gui.addFolder('Líneas principales')
  color(primary, 'primaryColor')
  number(primary, 'primarySpacing', 'separación', 0.5, 50, 0.5)
  number(primary, 'primaryThickness', 'grosor', 0, 0.5, 0.001)

  const secondary = gui.addFolder('Líneas secundarias')
  color(secondary, 'secondaryColor')
  number(secondary, 'secondarySpacing', 'separación', 0.1, 10, 0.1)
  number(secondary, 'secondaryThickness', 'grosor', 0, 0.2, 0.001)

  const cross = gui.addFolder('Cruces')
  color(cross, 'crossColor')
  number(cross, 'crossSpacing', 'separación', 0.1, 10, 0.1)
  number(cross, 'crossSize', 'tamaño', 0, 2, 0.01)
  number(cross, 'crossThickness', 'grosor', 0, 0.2, 0.001)

  const base = gui.addFolder('Fondo y fundido')
  color(base, 'backgroundColor').name('fondo')
  base.add(material, 'fade').name('fundido circular').onChange(changed)
  number(base, 'fadeRadius', 'radio', 1, 500, 1)
  number(base, 'fadeSoftness', 'suavidad', 0, 1, 0.01)

  // --- Exportar ---------------------------------------------------------------------
  const flash = (controller, text) => {
    const name = controller._name
    controller.name(text)
    setTimeout(() => controller.name(name), 1200)
  }
  const copy = (text, controller) => {
    const fallback = () => {
      console.log(text)
      flash(controller, 'Ver consola')
    }
    if (!navigator.clipboard) return fallback()
    navigator.clipboard.writeText(text).then(() => flash(controller, '¡Copiado!'), fallback)
  }

  const actions = {
    copyJS: () => copy(toJS(material.getParameters()), jsButton),
    copyJSON: () => copy(toJSON(material.getParameters()), jsonButton),
    log: () => console.log(material.getParameters()),
    reset: () => {
      material.setParameters(GRID_DEFAULTS)
      refresh()
      changed()
    },
  }

  const output = gui.addFolder('Parámetros')
  const jsButton = output.add(actions, 'copyJS').name('Copiar como JS')
  const jsonButton = output.add(actions, 'copyJSON').name('Copiar como JSON')
  output.add(actions, 'log').name('Mostrar en consola')
  output.add(actions, 'reset').name('Restablecer')

  /** Sincroniza el panel si el material se modifica desde código. */
  function refresh() {
    syncColors()
    for (const controller of gui.controllersRecursive()) controller.updateDisplay()
  }

  return { gui, refresh, dispose: () => gui.destroy() }
}
