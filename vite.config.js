import { defineConfig } from 'vite'

export default defineConfig({
  base: '/floor-is-lava/',
  build: {
    target: 'es2022',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
