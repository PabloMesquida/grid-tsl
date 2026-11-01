import { Inspector } from 'three/addons/inspector/Inspector.js'
import { GRID_DEFAULTS } from './GridMaterial.js'

// Panel de edición para GridMaterial sobre el Inspector de three.js (WebGPURenderer).
// Se importa aparte ('grid-tsl/debug') para que el Inspector no entre en el bundle de producción.

const toJS = (params) => {
  const value = (v) => (typeof v === 'string' ? `'${v}'` : Array.isArray(v) ? `[${v.join(', ')}]` : String(v))
  const lines = Object.entries(params).map(([key, v]) => `  ${key}: ${value(v)},`)
  return `new GridMaterial({\n${lines.join('\n')}\n})`
}

const toJSON = (params) => JSON.stringify(params, null, 2).replace(/\[\s+([^\]]*?)\s+\]/g, (_, items) => `[${items.replace(/\s+/g, ' ')}]`)

/**
 * Añade a la pestaña "Parameters" del Inspector un panel que edita el material en vivo y
 * permite copiar los parámetros resultantes para pegarlos en el código.
 *
 * @param {GridMaterial} material
 * @param {object} options
 * @param {WebGPURenderer} [options.renderer]  Si su inspector no es un `Inspector`, se le asigna uno.
 * @param {object} [options.parent]  Grupo de parámetros existente donde añadir el panel como carpeta.
 * @param {string} [options.title]
 * @param {(params: object) => void} [options.onChange]  Recibe los parámetros tras cada cambio.
 * @returns {{ group: object, refresh: () => void, dispose: () => void }}
 */
export function createGridDebug(material, { renderer, parent, title = 'Grid', onChange } = {}) {
  let group
  if (parent) {
    group = parent.addFolder(title)
  } else {
    if (!renderer) throw new Error('createGridDebug: pass `renderer` or `parent`')
    if (typeof renderer.inspector.createParameters !== 'function') renderer.inspector = new Inspector()
    group = renderer.inspector.createParameters(title)
  }

  // Los editores de color del Inspector trabajan en sRGB sobre el THREE.Color del material,
  // así que se enlazan directamente a sus propiedades.
  const editors = []
  const changed = () => onChange?.(material.getParameters())
  const bind = (editor, key) => {
    editors.push([editor, key])
    return editor.onChange(changed)
  }
  const color = (folder, key, name = 'color') => bind(folder.addColor(material, key).name(name), key)
  const number = (folder, key, name, min, max, step) =>
    bind(folder.add(material, key, min, max, step).name(name), key)

  bind(group.add(material, 'projection', ['floor', 'box']).name('projection'), 'projection')

  const primary = group.addFolder('Primary lines')
  color(primary, 'primaryColor')
  number(primary, 'primarySpacing', 'spacing', 0.5, 50, 0.5)
  number(primary, 'primaryThickness', 'thickness', 0, 0.5, 0.001)

  const secondary = group.addFolder('Secondary lines')
  color(secondary, 'secondaryColor')
  number(secondary, 'secondarySpacing', 'spacing', 0.1, 10, 0.1)
  number(secondary, 'secondaryThickness', 'thickness', 0, 0.2, 0.001)

  const cross = group.addFolder('Crosses')
  color(cross, 'crossColor')
  number(cross, 'crossSpacing', 'spacing', 0.1, 10, 0.1)
  number(cross, 'crossSize', 'size', 0, 2, 0.01)
  number(cross, 'crossThickness', 'thickness', 0, 0.2, 0.001)

  const base = group.addFolder('Background & fade')
  color(base, 'backgroundColor', 'background')
  bind(base.add(material, 'fade').name('circular fade'), 'fade')
  number(base, 'fadeRadius', 'radius', 1, 500, 1)
  number(base, 'fadeSoftness', 'softness', 0, 1, 0.01)

  // --- Exportar ---------------------------------------------------------------------
  const flash = (button, label, text) => {
    button.name(text)
    setTimeout(() => button.name(label), 1200)
  }
  const copy = (text, button, label) => {
    const fallback = () => {
      console.log(text)
      flash(button, label, 'See console')
    }
    if (!navigator.clipboard) return fallback()
    navigator.clipboard.writeText(text).then(() => flash(button, label, 'Copied!'), fallback)
  }

  const actions = {
    copyJS: () => copy(toJS(material.getParameters()), jsButton, 'Copy as JS'),
    copyJSON: () => copy(toJSON(material.getParameters()), jsonButton, 'Copy as JSON'),
    log: () => console.log(material.getParameters()),
    reset: () => {
      material.setParameters({ ...GRID_DEFAULTS, projection: material.projection })
      refresh()
    },
  }

  const output = group.addFolder('Export')
  const jsButton = output.add(actions, 'copyJS').name('Copy as JS')
  const jsonButton = output.add(actions, 'copyJSON').name('Copy as JSON')
  output.add(actions, 'log').name('Log to console')
  output.add(actions, 'reset').name('Reset')

  /** Sincroniza el panel si el material se modifica desde código. */
  function refresh() {
    for (const [editor, key] of editors) editor.setValue(material[key])
  }

  return { group, refresh, dispose: () => group.paramList.domElement.remove() }
}
