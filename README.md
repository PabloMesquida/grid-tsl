# Grid Material with Three.js TSL

Procedural **grid + plus-pattern shader** built with [Three.js WebGPU +
TSL](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)

---

## Features

- Two layered grids (A & B) + a plus-pattern layer (C).
- Adjustable size, thickness, colors and background.
- Smooth anti-aliased lines via derivatives (`dFdx` / `dFdy`).
- Camera controls with **OrbitControls**.
- **Material presets** that can be switched from the GUI.

---

## Presets

Available presets for the material:

- `default`
- `contrast`
- `dark`
- `light`
- `blueprint`
- `retro`
- `neon`
- `funky`

> ⚠️ Presets cannot be modified from the GUI. You can only switch between them.  
> To change individual parameters, you must edit the material directly in the code.

## Parameter customization

Although presets are fixed, you can still customize **any material parameter directly in your code**.

Example:

```javascript
import { GridNodeMaterial } from './materials/GridNodeMaterial.js'

const mat = GridNodeMaterial.fromPreset('default')

// Override some parameters
mat.cellSizeB = 1.5
mat.colorA.set(0xff0000)
mat.colorB.set(0x00ff00)
mat.gridThickness = 0.05
```

### Common parameters

| Parameter    | Description                          |
|--------------|--------------------------------------|
| `cellSizeA`  | Size of the primary grid layer        |
| `lineWidthA` | Line width of the primary grid layer  |
| `colorA`     | Color of the primary grid layer       |
| `cellSizeB`  | Size of the secondary grid layer      |
| `lineWidthB` | Line width of the secondary grid layer|
| `colorB`     | Color of the secondary grid layer     |
| `cellSizeC`  | Size of the plus-pattern layer        |
| `lineWidthC` | Line width of the plus-pattern layer  |
| `colorC`     | Color of the plus-pattern layer       |
| `segmentLen` | Segment length for the plus pattern   |
| `bgColor`    | Background color                     |


> You can experiment with any property exposed by `GridNodeMaterial` to fine-tune the visuals.


## Triplanar option for geometries

 **Triplanar projection (GridTriplanarNodeMaterial)** — creates
   projected UVs from world position along the three axes (X/Y/Z) and
   blends them using the surface normal. Great for procedurally
   texturing objects without reliable UVs (rocks, terrains, primitives).
   It's slightly heavier in shader cost but removes seams.

---

## References

- Bruno Simon Devlog (YouTube): [Procedural Grid with TSL](https://www.youtube.com/watch?v=OBZtVz6IM18&t=594s)
- Ben Golus — [The Best Darn Grid Shader (Yet)](https://bgolus.medium.com/the-best-darn-grid-shader-yet-727f9278b9d8)
