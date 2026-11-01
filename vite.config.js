import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const src = (file) => fileURLToPath(new URL(`./src/${file}`, import.meta.url))

// La demo importa la librería por su nombre de paquete, igual que lo haría otro proyecto.
export default defineConfig({
  root: 'demo',
  resolve: {
    alias: [
      { find: /^grid-tsl$/, replacement: src('index.js') },
      { find: /^grid-tsl\/debug$/, replacement: src('debug.js') },
      { find: /^grid-tsl\/nodes$/, replacement: src('gridNodes.js') },
    ],
  },
  build: { target: 'esnext', outDir: '../dist', emptyOutDir: true },
})
