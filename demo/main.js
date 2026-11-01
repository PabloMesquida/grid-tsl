import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GridMaterial } from 'grid-tsl'

// Panel de edición: siempre en desarrollo; en el build, solo con #debug en la URL
const debug = import.meta.env.DEV || location.hash === '#debug'

const canvas = document.querySelector('canvas.webgpu')

function showNotice(text) {
  const el = document.createElement('div')
  el.className = 'notice'
  el.textContent = text
  document.body.append(el)
}

if (!navigator.gpu) {
  showNotice('Este navegador no soporta WebGPU.')
  throw new Error('WebGPU no disponible')
}

const renderer = new THREE.WebGPURenderer({ canvas })
await renderer.init()
if (!renderer.backend.isWebGPUBackend) {
  showNotice('No se pudo inicializar WebGPU en este dispositivo.')
  throw new Error('WebGPU no disponible')
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)

const scene = new THREE.Scene()
scene.background = new THREE.Color('#0b0c0f')

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 2000)
camera.position.set(12, 4, 12)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.maxPolarAngle = Math.PI * 0.495

// Suelo
const material = new GridMaterial()
const floor = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), material)
floor.rotation.x = -Math.PI / 2
scene.add(floor)

// Cubo con proyección 'box': cada cara recibe su propia rejilla y la rejilla sigue al objeto.
// Oculto por defecto; se muestra desde el panel (Scene → show box).
const boxMaterial = new GridMaterial({
  projection: 'box',
  backgroundColor: '#1a1c21',
  primarySpacing: 1,
  secondarySpacing: 0.25,
  secondaryThickness: 0.006,
  crossSpacing: 0.5,
  crossSize: 0.08,
  crossThickness: 0.008,
  primaryThickness: 0.02,
})
const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), boxMaterial)
box.position.set(0, 1, 0)
box.visible = false
scene.add(box)

if (debug) {
  // Import dinámico: el Inspector y el panel no se cargan fuera del modo debug
  const { createGridDebug } = await import('grid-tsl/debug')
  createGridDebug(material, { renderer, title: 'Floor grid' })
  createGridDebug(boxMaterial, { renderer, title: 'Box grid' })

  const sceneParams = renderer.inspector.createParameters('Scene')
  sceneParams.addColor(scene, 'background').name('background')
  sceneParams.add(box, 'visible').name('show box')
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

renderer.setAnimationLoop(() => {
  controls.update()
  renderer.render(scene, camera)
})
