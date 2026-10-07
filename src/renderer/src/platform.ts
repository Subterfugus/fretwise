/** True inside the Electron app (the preload bridge exists); false in the browser build. */
export const isDesktop = typeof window !== 'undefined' && !!window.fretwise

/** Always the newest installer: the release asset keeps the same name across versions. */
export const DESKTOP_DOWNLOAD_URL = 'https://github.com/Subterfugus/fretwise/releases/latest/download/Fretwise-Setup.exe'
