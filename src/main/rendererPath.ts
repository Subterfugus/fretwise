import { join, normalize, sep } from 'node:path'

/**
 * Map an app:// request path onto a file strictly inside `rendererDir`.
 * Returns null for anything that would escape it (../, encoded ../, backslashes, NULs, bad %-escapes).
 * Pure (no electron import) so it can be unit tested.
 */
export function resolveRendererPath(pathname: string, rendererDir: string, platform: string = process.platform): string | null {
  let path: string
  try {
    path = decodeURIComponent(pathname)
  } catch {
    return null // malformed %-escape
  }
  if (path.includes('\0')) return null
  const root = normalize(rendererDir)
  const file = normalize(join(root, path === '/' || path === '' ? 'index.html' : path))
  // Windows paths are case-insensitive; compare accordingly so legitimate files are not rejected.
  const cmp = (s: string) => (platform === 'win32' ? s.toLowerCase() : s)
  if (!cmp(file).startsWith(cmp(root.endsWith(sep) ? root : root + sep))) return null
  return file
}
