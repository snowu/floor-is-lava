import { defineConfig } from 'vite'

export default defineConfig({
  base: '/packet-loss/',
  build: {
    target: 'es2022',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
