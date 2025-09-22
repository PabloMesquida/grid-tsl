import * as THREE from 'three/webgpu'
import GUI from 'lil-gui';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GridNodeMaterial, GridTriplanarNodeMaterial } from './materials/GridNodeMaterial.js'
import './style.css'

const sizes = { width: innerWidth, height: innerHeight }
const canvas = document.querySelector('canvas.webgpu')

// Three scene
const scene = new THREE.Scene()

// Camera
const camera = new THREE.PerspectiveCamera(25, sizes.width / sizes.height, 0.1, 1000)
camera.position.set(10, 5, 10)
scene.add(camera)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true

// Renderer
const renderer = new THREE.WebGPURenderer({ canvas: canvas })
renderer.toneMapping = THREE.NoToneMapping
renderer.toneMappingExposure = 1.0
renderer.setClearColor(0x000000)
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setAnimationLoop(tick)

// Floor (siempre activo con GridNodeMaterial)
const geoFloor = new THREE.PlaneGeometry(500, 500)
let matFloor = GridNodeMaterial.fromPreset()
const floor = new THREE.Mesh(geoFloor, matFloor)
floor.rotateX(-Math.PI / 2)
scene.add(floor)

// Box
const geoBox = new THREE.BoxGeometry(2, 2, 2)
let matBox = GridTriplanarNodeMaterial.fromPreset()
const box = new THREE.Mesh(geoBox, matBox)

// Configuración opcional
box.material.lineWidthA = 0
box.material.cellSizeB = 2.0
box.material.cellSizeC = 2.0
box.material.segmentLen = 0.5
box.material.lineWidthC = 0.02
box.position.set(-2, 1, 0)
box.rotateY(-Math.PI / 4)

// Sphere
const geoSphere = new THREE.SphereGeometry()
let matSphere = GridTriplanarNodeMaterial.fromPreset()
const sphere = new THREE.Mesh(geoSphere, matSphere)
// Configuración opcional
sphere.material.lineWidthA = 0
sphere.material.cellSizeB = 1.0
sphere.material.cellSizeC = 0
sphere.material.segmentLen = 0
sphere.material.lineWidthC = 0.02
sphere.position.set(2, 1, 0)

// Por defecto las dos están activas
scene.add(box)
scene.add(sphere)

// GUI
const gui = new GUI({ width: 240 })
const params = {
  floorPreset: 'default',
  geoPreset: 'default',
  showBoxAndSphere: true,
}

// Selector de preset del Floor
gui.add(params, 'floorPreset', ['default','contrast','dark','light','blueprint','retro','neon','funky'])
   .name('GridNodeMaterial')
   .onChange(value => {
      const newMat = GridNodeMaterial.fromPreset(value)
      floor.material.dispose()
      floor.material = newMat
      matFloor = newMat
   })

// Selector de preset de Box + Sphere
gui.add(params, 'geoPreset', ['default','contrast','dark','light','blueprint','retro','neon','funky'])
   .name('GridTriplanarNodeMaterial')
   .onChange(value => {
      const newMat = GridTriplanarNodeMaterial.fromPreset(value)
      box.material.dispose()
      box.material = newMat
      matBox = newMat

      sphere.material.dispose()
      sphere.material = newMat
      matSphere = newMat
   })

// Checkbox para mostrar/ocultar Box+Sphere
gui.add(params, 'showBoxAndSphere')
   .name('Show Box+Sphere')
   .onChange(value => {
      if(value){
         scene.add(box)
         scene.add(sphere)
      } else {
         scene.remove(box)
         scene.remove(sphere)
      }
   })
// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// Tick
function tick() {
  controls.update()
  renderer.render(scene, camera)
}
