import * as THREE from 'three/webgpu'
import GUI from 'lil-gui';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GridNodeMaterial } from './materials/GridNodeMaterial.js'
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
const renderer = new THREE.WebGPURenderer({ canvas: canvas, antialias: true })
renderer.toneMapping = THREE.NoToneMapping
renderer.toneMappingExposure = 1.0
renderer.setClearColor(0x000000)
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setAnimationLoop(tick)

// Material
let mat = GridNodeMaterial.fromPreset('default')

// Test Mesh
const testGeometry = new THREE.PlaneGeometry(500, 500)
const testMesh = new THREE.Mesh(testGeometry, mat)
testMesh.rotateX(-Math.PI / 2)
testMesh.position.y = -0.5
scene.add(testMesh)

// GUI
const gui = new GUI({ width: 200 })
const params = {
    preset: 'default',
}

gui.add(params, 'preset', ['default', 'contrast', 'dark', 'light', 'blueprint', 'retro', 'neon', 'funky'])
    .name('Material Preset')
    .onChange(value => {
        // Actualizamos el material con el preset seleccionado
        const newMat = GridNodeMaterial.fromPreset(value)
        testMesh.material.dispose()  // liberamos el material anterior
        testMesh.material = newMat
        mat = newMat
    })

// Resize
window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
})

// Tick
function tick() {
    controls.update()
    renderer.render(scene, camera)
}
