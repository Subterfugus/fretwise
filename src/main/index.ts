import { app, BrowserWindow, ipcMain, net, protocol, session, shell } from 'electron'
import { join, normalize } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveRendererPath } from './rendererPath'
import { readFile, writeFile, rename, copyFile } from 'node:fs/promises'
import { writeFileSync, renameSync } from 'node:fs'

// The built renderer is served from app://fretwise/ rather than file:// so that
// fetch() (used for the sample manifest and by Tone.js to load audio) works.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])
const RENDERER_DIR = normalize(join(__dirname, '../renderer'))

function serveRenderer(): void {
  protocol.handle('app', (req) => {
    const file = resolveRendererPath(new URL(req.url).pathname, RENDERER_DIR)
    if (!file) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
}

// Testing hook: FRETWISE_USER_DATA=<dir> runs the app against an isolated profile so automated
// checks never touch the owner's real progress (%APPDATA%\Fretwise\progress.json).
if (process.env.FRETWISE_USER_DATA) app.setPath('userData', process.env.FRETWISE_USER_DATA)

const progressFile = () => join(app.getPath('userData'), 'progress.json')

async function loadProgress(): Promise<unknown> {
  let text: string
  try {
    text = await readFile(progressFile(), 'utf-8')
  } catch {
    return null // first run
  }
  try {
    return JSON.parse(text)
  } catch {
    // Corrupt file: keep a copy instead of silently overwriting it with the next save.
    await copyFile(progressFile(), progressFile() + '.corrupt').catch(() => undefined)
    return null
  }
}

// Saves are serialised: two overlapping writes to the same temp file would make the
// second rename fail (the first already moved it).
let saveChain: Promise<void> = Promise.resolve()

let tmpCounter = 0
const tmpName = () => `${progressFile()}.${process.pid}.${tmpCounter++}.tmp`

function saveProgress(data: unknown): Promise<void> {
  const run = async () => {
    // Write to a temp file then rename so a crash mid-write can't corrupt progress.
    const tmp = tmpName()
    await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
    await rename(tmp, progressFile())
  }
  const next = saveChain.then(run, run)
  saveChain = next.catch(() => undefined)
  return next
}

function saveProgressSync(data: unknown): void {
  const tmp = tmpName()
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(tmp, progressFile())
}

const isAppUrl = (url: string) => {
  try {
    const u = new URL(url)
    if (u.protocol === 'app:') return true
    const dev = process.env['ELECTRON_RENDERER_URL']
    return !!dev && u.origin === new URL(dev).origin
  } catch {
    return false
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1000,
    minHeight: 680,
    show: false,
    backgroundColor: '#14161a',
    title: 'Fretwise',
    icon: join(RENDERER_DIR, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Only hand web links to the OS; never file:, custom schemes, etc.
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // The app is a single page: never let the window navigate to some other site.
  win.webContents.on('will-navigate', (e, url) => {
    if (!isAppUrl(url)) {
      e.preventDefault()
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    }
  })
  if (!app.isPackaged) {
    // Surface renderer warnings/errors in the terminal during development.
    win.webContents.on('console-message', (e) => {
      if (e.level === 'warning' || e.level === 'error') console.log(`[renderer ${e.level}] ${e.message}`)
    })
  }
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadURL('app://fretwise/index.html')
  }
}

// One instance only: two copies would overwrite each other's progress file.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    serveRenderer()
    // Microphone (tuner / play-along) is allowed for the app's own pages only; everything else is denied.
    const allowMedia = (permission: string, origin: string) =>
      (permission === 'media' || permission === 'audioCapture') && isAppUrl(origin)
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(allowMedia(permission, wc.getURL())))
    session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) => allowMedia(permission, origin))
    ipcMain.handle('progress:load', () => loadProgress())
    ipcMain.handle('progress:save', (_e, data: unknown) => saveProgress(data))
    ipcMain.on('progress:saveSync', (e, data: unknown) => {
      try {
        saveProgressSync(data)
      } catch (err) {
        console.error('progress save failed', err)
      }
      e.returnValue = true
    })
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
