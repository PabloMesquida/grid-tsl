import * as THREE from 'three/webgpu'
import { smoothstep, Fn, fract, vec3,  vec2, length, positionWorld, uniform, mix, float, clamp, saturate, dFdx, dFdy, select } from 'three/tsl'
import GUI from 'lil-gui'; 
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import './style.css'

const sizes = { width: innerWidth, height: innerHeight}

// ---------- Uniforms ----------
const cellSizeA  = uniform(10.0, 'float');
const lineWidthA = uniform(0.05, 'float');
const colorA     = uniform(new THREE.Color( 0xeeff00 )); // example yellow
const opacityA    = uniform(1.0, 'float');

const cellSizeB  = uniform(1.0, 'float');
const lineWidthB = uniform(0.002, 'float');
const colorB     = uniform(new THREE.Color( 0x0055ff )); // example blue
const opacityB    = uniform(0.45, 'float');

const cellSizeC   = uniform(1.0, 'float'); // grid size for "+" layer (can be same as A)
const lineWidthC  = uniform(0.0275, 'float'); // width of plus lines
const colorC      = uniform(new THREE.Color( 0xff0000)); // color of the "+"
const segmentLen  = uniform(0.9, 'float'); // length of plus arms
const opacityC    = uniform(0.25, 'float');

const bgColor = uniform(new THREE.Color(0x000000));

const params = {
  // Grid A
  cellSizeA:  cellSizeA.value,
  lineWidthA: lineWidthA.value,
  colorA:     `#${colorA.value.getHexString()}`, // lil-gui uses hex strings
  opacityA:   opacityA.value,

  // Grid B
  cellSizeB:  cellSizeB.value,
  lineWidthB: lineWidthB.value,
  colorB:     `#${colorB.value.getHexString()}`,
  opacityB:   opacityB.value,

  // Plus layer C
  cellSizeC:  cellSizeC.value,
  lineWidthC: lineWidthC.value,
  colorC:     `#${colorC.value.getHexString()}`,
  segmentLen: segmentLen.value,
  opacityC:   opacityC.value,

  // Background
  bgColor:    `#${bgColor.value.getHexString()}`
};

const canvas = document.querySelector('canvas.webgpu')

// Three.js scene
const scene = new THREE.Scene()

// Camera
const camera = new THREE.PerspectiveCamera(25, sizes.width / sizes.height, 0.1, 1000)
camera.position.set(10, 5, 10)
scene.add(camera)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true

// Renderer
const renderer = new THREE.WebGPURenderer({ canvas: canvas, antialias: true})
renderer.toneMapping = THREE.NoToneMapping
renderer.toneMappingExposure = 1.0
renderer.setClearColor(params.bgColor)
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setAnimationLoop(tick)

// Test mesh
const testGeometry = new THREE.PlaneGeometry(500, 500)
const testMaterial = new THREE.NodeMaterial()

const gui = new GUI({ width: 300 });

// Folder Grid A
const fA = gui.addFolder('Grid A');
fA.add(params, 'cellSizeA', 1.0, 20, 1.0).onChange(v => cellSizeA.value = v);
fA.add(params, 'lineWidthA', 0.01, 0.5, 0.001).onChange(v => lineWidthA.value = v);
fA.addColor(params, 'colorA').onChange(v => colorA.value.set(v));
fA.add(params, 'opacityA', 0, 1, 0.01).onChange(v => opacityA.value = v);
fA.open();

// Folder Grid B
const fB = gui.addFolder('Grid B');
fB.add(params, 'cellSizeB', 0.5, 10, 0.5).onChange(v => cellSizeB.value = v);
fB.add(params, 'lineWidthB', 0.0001, 0.05, 0.0001).onChange(v => lineWidthB.value = v);
fB.addColor(params, 'colorB').onChange(v => colorB.value.set(v));
fB.add(params, 'opacityB', 0, 1, 0.01).onChange(v => opacityB.value = v);
fB.open();

// Folder Plus layer C
const fC = gui.addFolder('Plus (+) Layer');
fC.add(params, 'cellSizeC', 0.1, 10.0, 0.1).onChange(v => cellSizeC.value = v);
fC.add(params, 'lineWidthC', 0.0001, 0.05, 0.0001).onChange(v => lineWidthC.value = v);
fC.addColor(params, 'colorC').onChange(v => colorC.value.set(v));
fC.add(params, 'segmentLen', 0.0, 1.0, 0.01).onChange(v => segmentLen.value = v);
fC.add(params, 'opacityC', 0, 1, 0.01).onChange(v => {
  renderer.setClearColor(v);
  opacityC.value = v
});
fC.open();

// Background
gui.addColor(params, 'bgColor').onChange(v => {
  // v comes as "#rrggbb" string
  renderer.setClearColor(new THREE.Color(v));
  bgColor.value.set(v);
});

// ---------- Helper: compute grid mask using precomputed uvDeriv ----------
// computeMask - Option A: lineWidth in WORLD UNITS
const computeMask = Fn(({ uv, lineWidth, cellSize, uvDeriv }) => {
  // uvDeriv: vec2 (world units per pixel)
  const uvDerivGrid = uvDeriv.div( vec2(cellSize) ); // convert to CELL units (cells per pixel)

  // Convert lineWidth (world units) to fraction of a cell:
  // lwCells = lineWidth / cellSize  -> now expressed in "cells"
  const lwCells = vec2(lineWidth).div( vec2(cellSize) ); // vec2

  // invert and targetWidth are computed in CELL units
  const invertLine = lwCells.greaterThan(float(0.5)); // if width > 0.5 cells, invert
  const targetWidth = select(invertLine, vec2(1.0).sub(lwCells), lwCells); // vec2

  // drawWidth and lineAA in CELL units (so cellSize does NOT affect thickness)
  const drawWidth = clamp(targetWidth, uvDerivGrid, vec2(float(0.5))); // vec2
  const lineAA = uvDerivGrid.mul(float(1.5)); // vec2

  // gridUV repeated by cellSize (0..1 per cell -> -1..1 -> 0..1)
  let gridUV = fract( uv.div( vec2(cellSize) ) ).mul(float(2.0)).sub(float(1.0)).abs(); // vec2
  gridUV = select(invertLine, gridUV, vec2(1.0).sub(gridUV)); // vec2

  // main mask with smoothing
  let grid2 = smoothstep( drawWidth.add(lineAA), drawWidth.sub(lineAA), gridUV ); // vec2
  grid2 = vec2(grid2); // ensure vec2

  // scaling and blending
  grid2 = grid2.mul( saturate( targetWidth.div(drawWidth) ) ); // vec2
  const t = saturate( uvDerivGrid.mul(float(2.0)).sub(float(1.0)) ); // vec2
  grid2 = mix(grid2, targetWidth, t); // vec2
  grid2 = select(invertLine, vec2(1.0).sub(grid2), grid2); // vec2

  // convert to float (final mask)
  const mask = mix( grid2.x, float(1.0), grid2.y ); // float
  return mask;
});


// ---------- Helper: "+" mask (only intersections), returns float 0..1 ----------
const computePlusMask = Fn(({ uv, lineWidth, cellSize, segmentLen, uvDeriv }) => {
  // uvDeriv: vec2 in world units per pixel
  const uvDerivGrid = uvDeriv.div( vec2(cellSize) ); // CELL units

  const lwVec = vec2(lineWidth);
  const drawWidth = clamp(lwVec, uvDerivGrid, vec2(float(0.5)));
  const lineAA = uvDerivGrid.mul(float(1.5));

  // tri = 1.0 at center, 0 at edges: equivalent to 1.0 - abs(frac*2 - 1)
  const tri = vec2(1.0).sub( fract( uv.div(vec2(cellSize)) ).mul(float(2.0)).sub(float(1.0)).abs() ); // vec2

  // line mask per axis (before segmentation): 1 = line
  const gridUV = fract( uv.div( vec2(cellSize) ) ).mul(float(2.0)).sub(float(1.0)).abs(); // vec2
  const smoothEdges = smoothstep( drawWidth.sub(lineAA), drawWidth.add(lineAA), gridUV ); // vec2
  const lineMaskVec = vec2(1.0).sub( smoothEdges ); // vec2: x=vertical, y=horizontal

  // segmentLen controls arm extension (0..1)
  const seg = float(segmentLen);

  // small AA for the arm (in cell units). Can be tuned for softer arms.
  const segAA = uvDerivGrid.mul(float(0.5)).x.add( uvDerivGrid.mul(float(0.5)).y ).mul(float(0.5));
  const segEdge0 = seg.sub(segAA);
  const segEdge1 = seg.add(segAA);

  // selector: 1 near center (tri), 0 away
  const selectorY = smoothstep(segEdge0, segEdge1, tri.y); // controls vertical arm (uses tri.y)
  const selectorX = smoothstep(segEdge0, segEdge1, tri.x); // controls horizontal arm

  // apply selector to line masks
  const verticalArm   = lineMaskVec.x.mul( selectorY );   // vertical arm near center
  const horizontalArm = lineMaskVec.y.mul( selectorX );   // horizontal arm

  const plusMask = saturate( verticalArm.add(horizontalArm) ); // float 0..1
  return plusMask;
});

// ---------- fragmentMain: compute ddx/ddy once, build 3 masks and combine ----------
const fragmentMain = Fn(() => {
  const uv = positionWorld.xz; // use positionWorld as "uv" for everything

  // derivatives (once)
  const ddxUV = dFdx(uv);
  const ddyUV = dFdy(uv);
  const uvDeriv = vec2(
    length( vec2( ddxUV.x, ddyUV.x ) ),
    length( vec2( ddxUV.y, ddyUV.y ) )
  );

  // masks for each layer
  const maskA = computeMask({ uv: uv, lineWidth: lineWidthA, cellSize: cellSizeA, uvDeriv: uvDeriv });
  const maskB = computeMask({ uv: uv, lineWidth: lineWidthB, cellSize: cellSizeB, uvDeriv: uvDeriv });
  const maskC = computePlusMask({ uv: uv, lineWidth: lineWidthC, cellSize: cellSizeC, segmentLen: segmentLen, uvDeriv: uvDeriv });

  // apply opacity and compose B -> A -> C
  let out = mix(bgColor, colorB, maskB.mul(opacityB)); // draw B over background
  out = mix(out, colorA, maskA.mul(opacityA));         // draw A on top
  out = mix(out, colorC, maskC.mul(opacityC));         // draw + on top

  // clamp final output
  out = clamp(out, vec3(float(0.0)), vec3(float(1.0)));

  return out;
})

testMaterial.fragmentNode = fragmentMain()

const testMesh = new THREE.Mesh(testGeometry, testMaterial)
testMesh.rotateX(-Math.PI / 2)
testMesh.position.y = -0.5
scene.add(testMesh)

// Shader Debug
renderer.debug.getShaderAsync(scene, camera, testMesh).then((e) => { console.log(e.fragmentShader) })

// Resize
window.addEventListener('resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// Tick
function tick(){
  controls.update()
  renderer.render(scene, camera)
}
