import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  base: '/packet-loss/',
  build: {
    target: 'es2022',
    rollupOptions: {
      input: { game: resolve('index.html'), lab: resolve('lab.html') },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
