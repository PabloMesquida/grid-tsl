import {
  Fn, vec2, float, dFdx, dFdy, length, fract, clamp, smoothstep, saturate, mix, min, max, step
} from 'three/tsl'

// Todas las funciones trabajan en "unidades de celda": coord = posición / separación,
// fp = huella del píxel (cuánto avanza coord por píxel en cada eje).
// Las distancias a la línea se miden en unidades "dobladas" (0 en la línea, 1 en el centro
// de la celda), por eso el ancho de línea y la cobertura media coinciden: ancho w ⇒ media w.

/**
 * Huella anisotrópica del píxel sobre el plano, en unidades de mundo por píxel.
 * Se calcula por eje para que en ángulos rasantes cada dirección se filtre por separado.
 * Se calcula una sola vez y se reutiliza en todas las capas.
 */
export const pixelFootprint = (p) => footprint(dFdx(p), dFdy(p))

/** Huella a partir de derivadas ya calculadas (`dx` = dFdx(p), `dy` = dFdy(p)). */
export const footprint = Fn(([dx, dy]) => {
  return max(vec2(length(vec2(dx.x, dy.x)), length(vec2(dx.y, dy.y))), 1e-6)
})

/**
 * Proyección "box": elige el plano según el eje dominante de la normal, sin mezclar planos
 * (caras ±Y → xz, ±X → zy, ±Z → xy). Devuelve una función que aplica esa misma elección a
 * cualquier vec3, para proyectar la posición y sus derivadas con una única selección.
 */
export const boxProjection = (normal) => {
  const n = normal.abs()
  const onY = step(max(n.x, n.z), n.y)
  const onX = step(n.z, n.x).mul(onY.oneMinus())
  return (v) => mix(mix(v.xy, v.zy, onX), v.xz, onY)
}

/**
 * Líneas de rejilla filtradas (técnica "pristine grid" de Ben Golus).
 * - El ancho dibujado nunca baja de 1 píxel, pero su intensidad se reduce en proporción
 *   (conservación de energía): las líneas sub-píxel no parpadean.
 * - Cuando la celda ocupa menos de ~2 píxeles, el resultado converge a la cobertura media
 *   de la rejilla: en la lejanía se ve un tono uniforme en lugar de moiré.
 * Devuelve la cobertura por eje (vec2); x = líneas verticales, y = horizontales.
 */
export const gridLines = Fn(([coord, width, fp]) => {
  const w = vec2(width)
  const drawWidth = clamp(w, fp, vec2(0.5))
  const aa = fp.mul(1.5)
  const dist = fract(coord).mul(2).sub(1).abs().oneMinus()
  const line = smoothstep(drawWidth.sub(aa), drawWidth.add(aa), dist).oneMinus()
    .mul(saturate(w.div(drawWidth)))
  return mix(line, w, saturate(fp.mul(2).sub(1)))
})

/**
 * Banda centrada en cada entero de coord, con filtro de caja analítico (exacto y sin
 * pérdida de energía). Se usa para recortar la longitud de los brazos de las cruces.
 * bandLength = longitud total de la banda en fracción de celda.
 */
export const filteredBand = Fn(([coord, bandLength, fp]) => {
  const l = vec2(bandLength)
  const s = fract(coord.add(0.5)).mul(2).sub(1)   // distancia con signo, 0 en el entero
  const filter = fp.mul(3)                          // caja de 1.5 px (igual que las líneas)
  const half = filter.mul(0.5)
  const overlap = max(min(s.add(half), l).sub(max(s.sub(half), l.negate())), 0)
  return mix(overlap.div(filter), l, saturate(fp.mul(2).sub(1)))
})

/** Une la cobertura de los dos ejes: a + b − a·b. */
export const unionAxes = (c) => mix(c.x, float(1), c.y)

/**
 * Cruces centradas en el medio de cada celda.
 * Cada brazo = línea filtrada en un eje × banda filtrada en el otro, así que tanto
 * el grosor como la longitud de los brazos convergen a su media en la distancia.
 */
export const crossPattern = Fn(([coord, width, armLength, fp]) => {
  const c = coord.add(0.5)   // centros de celda → enteros
  const line = gridLines(c, width, fp)
  const arm = filteredBand(c, armLength, fp)
  return mix(line.x.mul(arm.y), float(1), line.y.mul(arm.x))
})

/** Fundido circular: 1 dentro de `inner`, 0 a partir de `outer`. */
export const radialFade = Fn(([p, center, inner, outer]) => {
  return smoothstep(inner, outer, p.sub(center).length()).oneMinus()
})
