import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
const builtAt = new Date().toISOString()
let id = process.env.PACKET_LOSS_BUILD_ID || process.env.GITHUB_SHA
if (!id) {
  try { id = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() }
  catch { id = builtAt }
}
const release = { id, version, builtAt }

export default defineConfig({
  base: '/packet-loss/',
  define: { __APP_RELEASE__: JSON.stringify(release) },
  plugins: [{
    name: 'release-info',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n    <meta name="packet-loss-build" content="${id.replace(/[^a-zA-Z0-9._:-]/g, '')}" />`)
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(release) })
    },
  }],
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
