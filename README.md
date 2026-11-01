# Grid TSL v2

Procedural floor grid material built with **Three.js WebGPU + TSL**: primary lines, secondary lines and
crosses, with filtering designed to avoid moiré and shimmering, even far away or at grazing angles.
Every color and size is configurable.

Requires a browser with WebGPU support.

## What's new in v2

Version 2 is a rewrite from scratch. v1 is still available under the
[`v1.0.0`](https://github.com/PabloMesquida/grid-tsl/tree/v1.0.0) tag.

- **No moiré on the crosses**: in v1 the crosses had no distance filtering; now every layer converges to a
  flat tone once its details get smaller than a pixel.
- **A single floor material** (`GridMaterial`): the triplanar and UV variants and the fixed presets are
  gone. Every parameter can be edited live.
- **Optional circular fade** to blend the floor into its surroundings.
- **Reusable package**: install it with npm and import it as `grid-tsl`.
- **Debug panel** in the three.js Inspector that copies the current parameters as JS or JSON.
- **Cheaper shader**: derivatives computed once, derived values precomputed on the CPU, and a fade that
  is only compiled in when enabled.

> **Breaking changes**: parameters were renamed (`cellSizeA` → `primarySpacing`, `lineWidthA` →
> `primaryThickness`, `colorA` → `primaryColor`, `bgColor` → `backgroundColor`, etc.), and `fromPreset`,
> `GridTriplanarNodeMaterial` and `GridGeoUVNodeMaterial` no longer exist.

### Changelog

- **2.1.1**: debug panel labels in English; the export buttons now live in an **Export** folder.
- **2.1.0**: the debug panel uses the built-in three.js Inspector instead of lil-gui, so lil-gui is no
  longer needed. `createGridDebug` now takes the renderer: `createGridDebug(material, { renderer })`.
- **2.0.0**: rewrite.

## Installing in another project

`three` (≥ 0.180) is a *peer dependency*: the package uses your project's copy of three.
There are no other dependencies: the debug panel uses the Inspector that ships with three
(`three/addons/inspector`).

```bash
npm install github:PabloMesquida/grid-tsl#v2.1.1
```

Or from a local copy of the repository, by packing it:

```bash
npm pack
```

```bash
npm install path/to/grid-tsl-2.1.1.tgz
```

> Avoid `npm link` or `file:../grid`: they create a symlink and the package would end up using its own
> copy of three (two three instances break TSL). If you use them anyway, add
> `resolve: { dedupe: ['three'] }` to your `vite.config.js`.

## Usage

```js
import { GridMaterial } from 'grid-tsl'

const material = new GridMaterial({
  primaryColor: '#5c6370',
  secondarySpacing: 0.5,
  fadeRadius: 80,
})
const floor = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), material)
floor.rotation.x = -Math.PI / 2

material.crossSize = 0.3        // every parameter can be changed live
material.fade = false
```

The grid is projected onto the world XZ plane, so it only works on horizontal surfaces.

## Debug mode: edit and export parameters

`grid-tsl/debug` adds a panel to the **Parameters** tab of the
[three.js Inspector](https://github.com/mrdoob/three.js/tree/dev/examples/jsm/inspector), the tools
panel that comes with `WebGPURenderer` (performance, memory, console…). The panel edits the material
live, and its **Export** folder has:

- **Copy as JS**: copies `new GridMaterial({ ... })` with the current values, ready to paste.
- **Copy as JSON**: the same object as JSON (to keep it in a config file).
- **Log to console** and **Reset** (back to the defaults).

Import it dynamically so the Inspector stays out of your production bundle:

```js
const debug = location.hash === '#debug'

if (debug) {
  const { createGridDebug } = await import('grid-tsl/debug')
  createGridDebug(material, { renderer })
}
```

`createGridDebug(material, options)` options:

| Option | Description |
|---|---|
| `renderer` | The `WebGPURenderer`. If `renderer.inspector` is not an `Inspector` yet, one is assigned |
| `parent` | An existing parameters group (e.g. `renderer.inspector.createParameters('Scene')`); the panel is added as a folder inside it. Replaces `renderer` |
| `title` | Panel title (defaults to `'Grid'`) |
| `onChange(params)` | Called after every change with the current parameters (useful to save them) |

Returns `{ group, refresh, dispose }`; `group` is the Inspector parameters group, in case you want to add
your own controls. Call `refresh()` if you change the material from code while the panel is open.

You can also read and apply the parameters without the panel:

```js
const params = material.getParameters()   // plain object, JSON-serializable
material.setParameters(params)            // or new GridMaterial(params)
```

## Demo

```bash
npm install
```

```bash
npm run dev
```

In development the Inspector is always on; in the build (`npm run build`), only with `#debug` in the URL.
The controls live in the Inspector's **Parameters** tab.

## Parameters

All distances are in world units. Colors accept `'#hex'`, a number or a `THREE.Color`.

| Parameter | Description |
|---|---|
| `backgroundColor` | Background color |
| `primaryColor` / `primarySpacing` / `primaryThickness` | Primary lines: color, spacing, thickness |
| `secondaryColor` / `secondarySpacing` / `secondaryThickness` | Secondary lines: color, spacing, thickness |
| `crossColor` / `crossSpacing` / `crossSize` / `crossThickness` | Crosses (centered in each cell): color, spacing, tip-to-tip size, thickness |
| `fade` | Enables the circular fade (alpha) |
| `fadeRadius` / `fadeSoftness` | Radius where the material fully disappears; fraction of the radius taken by the transition (0–1) |
| `fadeCenter` | Fade center in world XZ coordinates (`Vector2`, `{ x, y }` or `[x, z]`) |

A thickness of `0` disables that layer. Draw order: background → secondary → crosses → primary.

## Antialiasing and filtering

- **Anisotropic footprint**: position derivatives are computed once and per axis, so at grazing angles
  each direction is filtered according to what it actually covers on screen.
- **Lines** ([Ben Golus' pristine grid](https://bgolus.medium.com/the-best-darn-grid-shader-yet-727f9278b9d8)):
  the drawn width never drops below 1 pixel, but its intensity is scaled down to match, so thin lines don't
  flicker. Once a cell is smaller than ~2 pixels, the layer converges to its average coverage: in the
  distance you see a flat tone instead of moiré.
- **Crosses**: each arm is a filtered line multiplied by a band with an analytic box filter
  (energy-preserving). Thickness and length also converge to their average, which v1 didn't do.
- **Compositing** in linear space using coverage, with no color clamping.

## Performance

- Derived values (1/spacing, thickness and size relative to the cell, fade radii) are computed on the CPU
  when a parameter changes; the shader only multiplies.
- The fade is a compile-time switch: when disabled, the material is opaque and contains neither that code
  nor blending.
- No branches, no textures and no triplanar variants.

## Structure

| Import | File | Contents |
|---|---|---|
| `grid-tsl` | `src/index.js` | `GridMaterial`, `GRID_DEFAULTS` |
| `grid-tsl/debug` | `src/debug.js` | `createGridDebug` (Inspector panel + export) |
| `grid-tsl/nodes` | `src/gridNodes.js` | Standalone TSL functions (`pixelFootprint`, `gridLines`, `filteredBand`, `crossPattern`, `radialFade`) to build your own material |

`demo/` is the test scene; it is not part of the package.

## References

- Ben Golus — [The Best Darn Grid Shader (Yet)](https://bgolus.medium.com/the-best-darn-grid-shader-yet-727f9278b9d8)
- Inigo Quilez — [Filtering procedurals](https://iquilezles.org/articles/filtering/)
- [Three.js Shading Language (TSL)](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)
