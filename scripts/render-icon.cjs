// Renders build/icon.svg to build/icon.png (512x512) using Electron's offscreen renderer.
// Usage: npx electron scripts/render-icon.cjs
// electron-builder converts build/icon.png into the Windows .ico automatically.
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')
const svg = readFileSync(join(root, 'build', 'icon.svg'), 'utf-8')

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true } })
  const html = `<html><body style="margin:0;background:transparent;overflow:hidden">${svg.replace('width="1024" height="1024"', 'width="512" height="512"')}</body></html>`
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((r) => setTimeout(r, 500))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 })
  const png = img.resize({ width: 512, height: 512, quality: 'best' }).toPNG()
  writeFileSync(join(root, 'build', 'icon.png'), png)
  writeFileSync(join(root, 'src', 'renderer', 'public', 'icon.png'), img.resize({ width: 256, height: 256, quality: 'best' }).toPNG())
  console.log('wrote build/icon.png', img.getSize())
  app.quit()
})
