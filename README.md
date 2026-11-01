# Grid TSL v2

Material de rejilla procedural para suelos, hecho con **Three.js WebGPU + TSL**: líneas principales,
líneas secundarias y cruces, con un filtrado pensado para evitar moiré y parpadeo incluso a lo lejos o en
ángulos rasantes. Todos los colores y medidas son configurables.

Requiere un navegador con WebGPU.

## Novedades respecto a v1

La versión 2 es una reescritura desde cero. La v1 sigue disponible en la etiqueta
[`v1.0.0`](https://github.com/PabloMesquida/grid-tsl/tree/v1.0.0).

- **Sin moiré en las cruces**: en v1 las cruces no tenían filtrado a distancia; ahora todas las capas
  convergen a un tono uniforme cuando sus detalles son más pequeños que un píxel.
- **Un solo material para suelos** (`GridMaterial`): se eliminan las variantes triplanar y por UV y los
  presets fijos. Todos los parámetros se editan en vivo.
- **Fundido circular** opcional para integrar el suelo con el entorno.
- **Paquete reutilizable**: se instala con npm y se importa como `grid-tsl`.
- **Panel de debug** que copia los parámetros actuales como código JS o JSON.
- **Shader más barato**: derivadas calculadas una sola vez, valores derivados precalculados en CPU y
  fundido que solo se compila si está activo.

> **Cambios que rompen compatibilidad**: los nombres de los parámetros cambian (`cellSizeA` →
> `primarySpacing`, `lineWidthA` → `primaryThickness`, `colorA` → `primaryColor`, `bgColor` →
> `backgroundColor`, etc.) y ya no existen `fromPreset`, `GridTriplanarNodeMaterial` ni
> `GridGeoUVNodeMaterial`.

## Instalación en otro proyecto

`three` (≥ 0.180) es *peer dependency*: el paquete usa la copia de three de tu proyecto.
`lil-gui` solo hace falta si usas el panel de debug.

```bash
npm install github:PabloMesquida/grid-tsl#v2.0.0
```

O desde una copia local del repositorio, generando un paquete:

```bash
npm pack
```

```bash
npm install ruta/a/grid-tsl-2.0.0.tgz
```

> Evita `npm link` o `file:../grid`: crean un enlace y el paquete acabaría usando su propia copia de
> three (dos instancias de three rompen TSL). Si aun así lo usas, añade `resolve: { dedupe: ['three'] }`
> a tu `vite.config.js`.

## Uso

```js
import { GridMaterial } from 'grid-tsl'

const material = new GridMaterial({
  primaryColor: '#5c6370',
  secondarySpacing: 0.5,
  fadeRadius: 80,
})
const floor = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), material)
floor.rotation.x = -Math.PI / 2

material.crossSize = 0.3        // todos los parámetros se pueden cambiar en vivo
material.fade = false
```

La rejilla se proyecta en el plano XZ del mundo, así que solo sirve para superficies horizontales.

## Modo debug: editar y exportar parámetros

`grid-tsl/debug` crea un panel lil-gui que edita el material en vivo. Su carpeta **Parámetros** tiene:

- **Copiar como JS**: copia `new GridMaterial({ ... })` con los valores actuales, listo para pegar.
- **Copiar como JSON**: el mismo objeto en JSON (para guardarlo en un archivo de config).
- **Mostrar en consola** y **Restablecer**.

Impórtalo de forma dinámica para que lil-gui no entre en el bundle de producción:

```js
const debug = location.hash === '#debug'

if (debug) {
  const { createGridDebug } = await import('grid-tsl/debug')
  createGridDebug(material)
}
```

Opciones de `createGridDebug(material, options)`:

| Opción | Descripción |
|---|---|
| `parent` | GUI de lil-gui existente; el panel se añade como carpeta dentro de ella |
| `title` | Título del panel (por defecto `'Grid'`) |
| `onChange(params)` | Se llama tras cada cambio con los parámetros actuales (útil para guardarlos) |

Devuelve `{ gui, refresh, dispose }`. Llama a `refresh()` si cambias el material desde código con el
panel abierto.

Fuera del panel también puedes leer y aplicar los parámetros:

```js
const params = material.getParameters()   // objeto plano, serializable a JSON
material.setParameters(params)            // o new GridMaterial(params)
```

## Demo

```bash
npm install
```

```bash
npm run dev
```

En desarrollo el panel siempre está visible; en el build (`npm run build`), solo con `#debug` en la URL.

## Parámetros

Todas las distancias están en unidades de mundo. Los colores aceptan `'#hex'`, número o `THREE.Color`.

| Parámetro | Descripción |
|---|---|
| `backgroundColor` | Color del fondo |
| `primaryColor` / `primarySpacing` / `primaryThickness` | Líneas principales: color, separación, grosor |
| `secondaryColor` / `secondarySpacing` / `secondaryThickness` | Líneas secundarias: color, separación, grosor |
| `crossColor` / `crossSpacing` / `crossSize` / `crossThickness` | Cruces (en el centro de cada celda): color, separación, tamaño de punta a punta, grosor |
| `fade` | Activa el fundido circular (alpha) |
| `fadeRadius` / `fadeSoftness` | Radio donde el material desaparece del todo; fracción del radio que ocupa la transición (0–1) |
| `fadeCenter` | Centro del fundido en coordenadas XZ de mundo (`Vector2`, `{ x, y }` o `[x, z]`) |

Un grosor de `0` desactiva la capa. Orden de dibujo: fondo → secundarias → cruces → principales.

## Antialiasing y filtrado

- **Huella anisotrópica**: las derivadas de la posición se calculan una sola vez y por eje, de modo que en
  ángulos rasantes cada dirección se filtra según lo que realmente ocupa en pantalla.
- **Líneas** ([pristine grid de Ben Golus](https://bgolus.medium.com/the-best-darn-grid-shader-yet-727f9278b9d8)):
  el ancho dibujado nunca baja de 1 píxel pero su intensidad se reduce en proporción, así las líneas finas
  no parpadean. Cuando la celda ocupa menos de ~2 píxeles, la capa converge a su cobertura media: en la
  distancia se ve un tono uniforme en lugar de moiré.
- **Cruces**: cada brazo es una línea filtrada multiplicada por una banda con filtro de caja analítico
  (conserva la energía). Grosor y longitud convergen también a su media, cosa que v1 no hacía.
- **Composición** en espacio lineal con coberturas, sin recortes de color.

## Rendimiento

- Los valores derivados (1/separación, grosor y tamaño relativos a la celda, radios del fundido) se calculan
  en CPU al cambiar un parámetro; el shader solo multiplica.
- El fundido es un interruptor de compilación: desactivado, el material es opaco y no incluye ese código
  ni el blending.
- Sin ramas, sin texturas y sin variantes triplanares.

## Estructura

| Import | Archivo | Contenido |
|---|---|---|
| `grid-tsl` | `src/index.js` | `GridMaterial`, `GRID_DEFAULTS` |
| `grid-tsl/debug` | `src/debug.js` | `createGridDebug` (panel lil-gui + exportar) |
| `grid-tsl/nodes` | `src/gridNodes.js` | Funciones TSL sueltas (`pixelFootprint`, `gridLines`, `filteredBand`, `crossPattern`, `radialFade`) para montar tu propio material |

`demo/` es la escena de prueba; no forma parte del paquete.

## Referencias

- Ben Golus — [The Best Darn Grid Shader (Yet)](https://bgolus.medium.com/the-best-darn-grid-shader-yet-727f9278b9d8)
- Inigo Quilez — [Filtering procedurals](https://iquilezles.org/articles/filtering/)
- [Three.js Shading Language (TSL)](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)
