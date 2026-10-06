// Renderer-only dev server (no Electron) for quick UI previews in a browser.
// Progress falls back to localStorage when window.fretwise is absent.
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  resolve: { alias: { '@': resolve(__dirname, 'src/renderer/src') } },
  plugins: [react()],
  server: { port: 5199, strictPort: true }
})
