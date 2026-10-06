import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { resolveRendererPath } from './rendererPath'

const ROOT_WIN = 'C:\\app\\out\\renderer'
const ROOT_POSIX = '/app/out/renderer'

describe('app:// path resolution', () => {
  it('serves index.html for / and files below the renderer dir', () => {
    expect(resolveRendererPath('/', ROOT_POSIX, 'linux')).toBe(join(ROOT_POSIX, 'index.html'))
    expect(resolveRendererPath('/assets/a.js', ROOT_POSIX, 'linux')).toBe(join(ROOT_POSIX, 'assets', 'a.js'))
    expect(resolveRendererPath('/samples/guitar%20x/A2.mp3', ROOT_POSIX, 'linux')).toBe(join(ROOT_POSIX, 'samples', 'guitar x', 'A2.mp3'))
  })

  it('rejects traversal out of the renderer dir, including encoded and backslash forms', () => {
    for (const p of ['/../main/index.js', '/..%2fmain/index.js', '/%2e%2e/%2e%2e/etc/passwd', '/assets/../../secret', '/a/..%2F..%2Fsecret']) {
      expect(resolveRendererPath(p, ROOT_POSIX, 'linux'), p).toBeNull()
    }
    expect(resolveRendererPath('/..\\..\\secret.txt', ROOT_WIN, 'win32')).toBeNull()
    expect(resolveRendererPath('/%5c..%5c..%5csecret.txt', ROOT_WIN, 'win32')).toBeNull()
  })

  it('rejects a sibling directory that merely shares the renderer prefix', () => {
    expect(resolveRendererPath('/../renderer-evil/x.js', ROOT_POSIX, 'linux')).toBeNull()
  })

  it('rejects malformed escapes and NUL bytes instead of throwing', () => {
    expect(resolveRendererPath('/%E0%A4%A', ROOT_POSIX, 'linux')).toBeNull()
    expect(resolveRendererPath('/a%00b', ROOT_POSIX, 'linux')).toBeNull()
  })

  it('compares case-insensitively on Windows only', () => {
    expect(resolveRendererPath('/index.html', 'C:\\App\\Renderer', 'win32')?.toLowerCase()).toBe('c:\\app\\renderer\\index.html')
  })
})
