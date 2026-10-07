/** True inside the Electron app (the preload bridge exists); false in the browser build. */
export const isDesktop = typeof window !== 'undefined' && !!window.fretwise

/** Always the newest installer: the release asset keeps the same name across versions. */
export const DESKTOP_DOWNLOAD_URL = 'https://github.com/Subterfugus/fretwise/releases/latest/download/Fretwise-Setup.exe'

/** Whether a browser on `platform` (navigator.userAgentData.platform or navigator.platform) can run the Windows installer. */
export const isWindowsPlatform = (platform: string | undefined): boolean => /^win/i.test(platform ?? '')

const browserPlatform = (): string | undefined => {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform
}

/** The installer is Windows-only, so the browser build offers it to Windows visitors only. */
export const offerDesktopDownload = !isDesktop && isWindowsPlatform(browserPlatform())
