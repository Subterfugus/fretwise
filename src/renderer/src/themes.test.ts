import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { afterAll, describe, expect, it } from 'vitest'
import { applyCachedTheme, applyTheme, DEFAULT_THEME, isThemeId, normalizeTheme, THEMES } from './themes'
import { mergeProgress } from './state/progress'

const SRC = resolve(__dirname)
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

// ---------- parse themes.css ----------
type Vars = Record<string, string>
function parseThemes(): Record<string, Vars> {
  const css = strip(readFileSync(join(SRC, 'themes.css'), 'utf8'))
  const out: Record<string, Vars> = {}
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim()
    const ids = [...sel.matchAll(/\[data-theme="([a-z-]+)"\]/g)].map((x) => x[1])
    expect(ids.length, `selector without data-theme: ${sel}`).toBe(1)
    const vars: Vars = {}
    for (const d of m[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) vars[d[1]] = d[2].trim()
    const scheme = /color-scheme\s*:\s*(\w+)/.exec(m[2])
    if (scheme) vars['color-scheme'] = scheme[1]
    expect(out[ids[0]], `duplicate theme block ${ids[0]}`).toBeUndefined()
    out[ids[0]] = vars
  }
  return out
}
const themes = parseThemes()
const ids = Object.keys(themes)

// ---------- colour maths ----------
type RGB = [number, number, number]
function hex(v: string, theme: Vars, depth = 0): RGB {
  const ref = /^var\((--[a-z0-9-]+)\)$/.exec(v)
  if (ref && depth < 5) return hex(theme[ref[1]], theme, depth + 1)
  const m = /^#([0-9a-f]{6})$/i.exec(v)
  if (!m) throw new Error(`expected a #rrggbb colour, got "${v}"`)
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as RGB
}
const col = (t: Vars, name: string) => hex(t[`--${name}`], t)
const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lum = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
function lab([r, g, b]: RGB): [number, number, number] {
  const [R, G, B] = [r, g, b].map(lin)
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}
const deltaE = (a: RGB, b: RGB) => {
  const [p, q] = [lab(a), lab(b)]
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}

describe('theme registry', () => {
  it('themes.css has exactly the themes listed in themes.ts, Dark first', () => {
    expect(ids.sort()).toEqual(THEMES.map((t) => t.id).sort())
    expect(THEMES[0].id).toBe('dark')
    expect(DEFAULT_THEME).toBe('dark')
    expect(THEMES.length).toBe(7)
  })
  it('the Dark block is also the :root default', () => {
    const css = strip(readFileSync(join(SRC, 'themes.css'), 'utf8'))
    expect(/:root\s*,\s*\[data-theme="dark"\]\s*\{/.test(css)).toBe(true)
  })
  it('validates ids', () => {
    expect(isThemeId('maple')).toBe(true)
    expect(isThemeId('Maple')).toBe(false)
    expect(isThemeId(3)).toBe(false)
    expect(normalizeTheme('nope')).toBe('dark')
    expect(normalizeTheme(undefined)).toBe('dark')
  })
})

describe('every theme is a complete variable set', () => {
  const dark = themes.dark
  const required = Object.keys(dark)
  it('Dark defines the baseline variables', () => {
    for (const v of ['--bg', '--panel', '--panel-2', '--border', '--text', '--muted', '--accent', '--accent-2', '--ok', '--bad', '--on-accent', '--notation-bg', '--fb-wood'])
      expect(required).toContain(v)
    expect(required.length).toBeGreaterThan(60)
  })
  for (const id of THEMES.map((t) => t.id)) {
    it(`${id} defines every Dark variable and nothing extra`, () => {
      const missing = required.filter((v) => !(v in themes[id]))
      const extra = Object.keys(themes[id]).filter((v) => !(v in dark))
      expect(missing, `missing in ${id}`).toEqual([])
      expect(extra, `extra in ${id}`).toEqual([])
    })
  }
})

// Text on a solid accent fill: Dark keeps its original white-on-red / white-on-blue marks pixel-identical,
// which are below 4.5:1, so those are held to a documented lower floor. Every other theme must reach 4.5.
const DARK_FLOORS: Record<string, number> = { 'on-bad': 3, 'fb-on-blue': 3, 'fb-on-bad': 3, 'fb-on-ok': 1.9 }

describe('contrast (WCAG 2.x)', () => {
  const report: string[] = []
  afterAll(() => { if (process.env.THEME_REPORT) console.log(report.join('\n')) })
  for (const id of THEMES.map((t) => t.id)) {
    const t = themes[id]
    const floor = (name: string, normal: number) => (id === 'dark' && DARK_FLOORS[name] !== undefined ? DARK_FLOORS[name] : normal)
    const check = (label: string, fg: string, bg: string, min: number, fgName = fg) => {
      const c = contrast(col(t, fg), col(t, bg))
      report.push(`${id.padEnd(14)} ${label.padEnd(34)} ${c.toFixed(2)}`)
      expect(c, `${id}: ${label} = ${c.toFixed(2)} (needs ${floor(fgName, min)})`).toBeGreaterThanOrEqual(floor(fgName, min))
    }
    describe(id, () => {
      it('body text', () => {
        check('text on bg', 'text', 'bg', 4.5)
        check('text on panel', 'text', 'panel', 4.5)
        check('text on panel-2', 'text', 'panel-2', 4.5)
        check('muted on panel', 'muted', 'panel', 3)
        check('muted on bg', 'muted', 'bg', 3)
        check('muted on panel-2', 'muted', 'panel-2', 3)
      })
      it('text on accent fills', () => {
        check('on-accent on accent', 'on-accent', 'accent', 4.5)
        check('on-accent-2 on accent-2', 'on-accent-2', 'accent-2', 4.5)
        check('on-ok on ok', 'on-ok', 'ok', 4.5)
        check('on-bad on bad', 'on-bad', 'bad', 4.5)
      })
      it('accent / answer colours as text and borders', () => {
        for (const c of ['accent', 'accent-2', 'ok', 'bad']) {
          check(`${c} on bg`, c, 'bg', 4.5, 'x')
          check(`${c} on panel`, c, 'panel', 4.5, 'x')
          check(`${c} on panel-2`, c, 'panel-2', 3, 'x')
        }
      })
      it('fretboard marks read against the wood and carry readable labels', () => {
        check('fretboard keyboard focus on wood', 'fb-focus', 'fb-wood', 3, 'x')
        for (const m of ['fb-root', 'fb-tone', 'fb-accent', 'fb-blue', 'fb-bad', 'fb-ok']) check(`${m} on fb-wood`, m, 'fb-wood', 3, 'x')
        for (const m of ['fb-root', 'fb-tone', 'fb-accent']) check(`fb-ink on ${m}`, 'fb-ink', m, 4.5, 'x')
        check('fb-on-blue on fb-blue', 'fb-on-blue', 'fb-blue', 4.5)
        check('fb-on-bad on fb-bad', 'fb-on-bad', 'fb-bad', 4.5)
        check('fb-on-ok on fb-ok', 'fb-on-ok', 'fb-ok', 4.5)
        check('fb-label on fb-wood', 'fb-label', 'fb-wood', 4.5)
        check('fb-mute-ink on fb-mute-fill', 'fb-mute-ink', 'fb-mute-fill', 3, 'x')
        for (const m of ['fb-fret', 'fb-string', 'fb-nut']) check(`${m} on fb-wood`, m, 'fb-wood', 3, 'x')
      })
      it('chord diagrams and dictionary strips read on panel and panel-2', () => {
        for (const bg of ['panel', 'panel-2']) {
          for (const m of ['diagram-line', 'diagram-string', 'diagram-nut', 'diagram-open-edge']) check(`${m} on ${bg}`, m, bg, 3, 'x')
        }
        check('diagram-ink on diagram-root', 'diagram-ink', 'diagram-root', 4.5, 'x')
        check('diagram-ink on diagram-disc', 'diagram-ink', 'diagram-disc', 4.5, 'x')
        check('on-accent on accent (finger numbers)', 'on-accent', 'accent', 4.5)
      })
      it('notation panel is light (VexFlow draws black)', () => {
        const c = contrast(col(t, 'notation-bg'), [0, 0, 0])
        expect(c).toBeGreaterThanOrEqual(12)
      })
    })
  }

  describe('answer colours stay distinguishable (CIE76 delta E)', () => {
    const pairs = (names: string[]) => names.flatMap((a, i) => names.slice(i + 1).map((b) => [a, b] as const))
    for (const id of THEMES.map((t) => t.id)) {
      it(`${id}: ok / bad / accent-2 / accent are distinct`, () => {
        for (const [a, b] of pairs(['ok', 'bad', 'accent-2', 'accent'])) {
          const d = deltaE(col(themes[id], a), col(themes[id], b))
          expect(d, `${id}: ${a} vs ${b} = ${d.toFixed(1)}`).toBeGreaterThanOrEqual(25)
        }
      })
      it(`${id}: fretboard mark colours are distinct from each other`, () => {
        for (const [a, b] of pairs(['fb-root', 'fb-tone', 'fb-accent', 'fb-blue', 'fb-bad', 'fb-ok'])) {
          const d = deltaE(col(themes[id], a), col(themes[id], b))
          expect(d, `${id}: ${a} vs ${b} = ${d.toFixed(1)}`).toBeGreaterThanOrEqual(25)
        }
      })
    }
  })
})

// ---------- no stray colours ----------
// Colours may only be written in themes.css. Allowlist entries are "relative/path.css: exact value" and must say why.
const ALLOWED_LITERALS: Record<string, string> = {
  // (none needed: shadows and backdrops are theme variables too)
}

function walk(dir: string, ext: string[], out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, ext, out)
    else if (ext.some((e) => name.endsWith(e))) out.push(p)
  }
  return out
}

const NAMED = 'white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|brown|cyan|magenta|gold|silver|navy|teal|maroon|olive|lime|aqua|ivory|beige'
const LITERAL = new RegExp(
  `#[0-9a-fA-F]{3,8}\\b|\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\\(|(?<![\\w-])(?:${NAMED})(?![\\w-])`,
  'g'
)

describe('no stray colours outside themes.css', () => {
  const cssFiles = walk(SRC, ['.css']).filter((f) => !f.endsWith('themes.css'))
  it('finds the stylesheets', () => {
    expect(cssFiles.length).toBeGreaterThan(8)
  })
  for (const f of cssFiles) {
    it(relative(SRC, f).replace(/\\/g, '/'), () => {
      const css = strip(readFileSync(f, 'utf8'))
      const bad: string[] = []
      // only inspect declaration values, so property names like white-space are not mistaken for colours
      for (const d of css.matchAll(/([a-z-]+)\s*:\s*([^;{}]+)(?=;|})/gi)) {
        for (const m of d[2].matchAll(LITERAL)) {
          const key = `${relative(SRC, f).replace(/\\/g, '/')}: ${m[0]}`
          if (!(key in ALLOWED_LITERALS)) bad.push(`${d[1]}: ${d[2].trim()}`)
        }
      }
      expect(bad).toEqual([])
    })
  }
  it('no colour literals in component code', () => {
    const files = walk(SRC, ['.tsx'])
    const bad: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/['"`]#[0-9a-fA-F]{3,8}['"`]|\brgba?\(|\bhsla?\(/g)) bad.push(`${relative(SRC, f)}: ${m[0]}`)
    }
    expect(bad).toEqual([])
  })
  it('every variable a stylesheet reads is defined by the themes (or is a local --dict-fb-min style override)', () => {
    const defined = new Set(Object.keys(themes.dark))
    defined.add('--radius') // styles.css :root
    const LOCAL = new Set(['--dict-fb-min'])
    const unknown: string[] = []
    for (const f of cssFiles) {
      const css = strip(readFileSync(f, 'utf8'))
      for (const m of css.matchAll(/var\((--[a-z0-9-]+)/g)) if (!defined.has(m[1]) && !LOCAL.has(m[1])) unknown.push(`${relative(SRC, f)}: ${m[1]}`)
    }
    expect([...new Set(unknown)]).toEqual([])
  })
  it('all border and focus widths use theme tokens', () => {
    for (const file of cssFiles) {
      const css = strip(readFileSync(file, 'utf8'))
      expect(css.match(/(?:^|[;{])\s*(?:border(?:-(?:top|right|bottom|left))?(?:-width)?|outline)\s*:\s*\d+(?:\.\d+)?px/g), relative(SRC, file)).toBeNull()
    }
  })
})

// ---------- settings: progress.settings.theme ----------
describe('progress.settings.theme', () => {
  it('defaults to dark, including old saves without the field', () => {
    expect(mergeProgress(null).settings.theme).toBe('dark')
    expect(mergeProgress({}).settings.theme).toBe('dark')
    expect(mergeProgress({ settings: { volume: 0.5 } }).settings.theme).toBe('dark')
    expect(mergeProgress({ version: 1, lessonsDone: { u1l1: 1 }, settings: { instrument: 'piano', unlockAll: true, volume: 0.3, leftHanded: true, noteNames: 'flats' } }).settings.theme).toBe('dark')
  })
  it('keeps every known theme id', () => {
    for (const t of THEMES) expect(mergeProgress({ settings: { theme: t.id } }).settings.theme).toBe(t.id)
  })
  it('falls back to dark for unknown or malformed values', () => {
    for (const bad of ['neon', '', 'MAPLE', ' dark', 3, null, true, {}, [], ['light']])
      expect(mergeProgress({ settings: { theme: bad } }).settings.theme).toBe('dark')
    expect(mergeProgress({ settings: 'light' }).settings.theme).toBe('dark')
  })
  it('does not disturb other settings', () => {
    const s = mergeProgress({ settings: { theme: 'stage', volume: 0.25, leftHanded: true } }).settings
    expect(s).toMatchObject({ theme: 'stage', volume: 0.25, leftHanded: true, noteNames: 'auto' })
  })
})

describe('applyTheme', () => {
  function withDom(run: (docEl: { dataset: Record<string, string> }, store: Map<string, string>, writes: string[]) => void) {
    const g = globalThis as unknown as Record<string, unknown>
    const prev = { document: g.document, localStorage: g.localStorage }
    const docEl = { dataset: {} as Record<string, string> }
    const store = new Map<string, string>()
    const writes: string[] = []
    g.document = { documentElement: docEl }
    g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { writes.push(v); store.set(k, v) } }
    try {
      run(docEl, store, writes)
    } finally {
      g.document = prev.document
      g.localStorage = prev.localStorage
    }
  }
  it('sets data-theme on <html>, remembers it, and falls back to dark for junk', () => {
    withDom((el, store) => {
      applyTheme('sunburst')
      expect(el.dataset.theme).toBe('sunburst')
      expect(store.get('fretwise-theme')).toBe('sunburst')
      applyTheme('junk')
      expect(el.dataset.theme).toBe('dark')
    })
  })
  it('applyCachedTheme restores the remembered theme synchronously', () => {
    withDom((el, store) => {
      store.set('fretwise-theme', 'maple')
      applyCachedTheme()
      expect(el.dataset.theme).toBe('maple')
      store.set('fretwise-theme', 'bogus')
      applyCachedTheme()
      expect(el.dataset.theme).toBe('dark')
    })
  })
  it('writes the cache only when its normalized theme changes', () => {
    withDom((el, store, writes) => {
      store.set('fretwise-theme', 'light')
      applyCachedTheme()
      applyTheme('light')
      applyTheme('light')
      expect(writes).toEqual([])
      applyTheme('surf-green')
      applyTheme('surf-green')
      expect(el.dataset.theme).toBe('surf-green')
      expect(writes).toEqual(['surf-green'])
    })
  })
  it('is a no-op without a DOM', () => {
    expect(() => applyTheme('light')).not.toThrow()
    expect(() => applyCachedTheme()).not.toThrow()
  })
})

describe('classic theme head script', () => {
  const source = readFileSync(resolve(SRC, '../public/theme-boot.js'), 'utf8')
  it('restores every registered theme and falls back safely for invalid or blocked storage', () => {
    for (const cached of [...THEMES.map((t) => t.id), 'invalid', null, undefined]) {
      let applied = ''
      runInNewContext(source, {
        localStorage: { getItem: () => cached },
        document: { documentElement: { setAttribute: (name: string, value: string) => { expect(name).toBe('data-theme'); applied = value } } }
      })
      expect(applied).toBe(normalizeTheme(cached))
    }
    let applied = ''
    runInNewContext(source, {
      localStorage: { getItem: () => { throw new Error('blocked') } },
      document: { documentElement: { setAttribute: (_: string, value: string) => { applied = value } } }
    })
    expect(applied).toBe('dark')
  })
  it('loads without defer or module in the head, ahead of the renderer entry', () => {
    const html = readFileSync(resolve(SRC, '../index.html'), 'utf8')
    expect(html).toContain('<script src="/theme-boot.js"></script>')
    expect(html.indexOf('/theme-boot.js')).toBeLessThan(html.indexOf('</head>'))
    expect(html.indexOf('/theme-boot.js')).toBeLessThan(html.indexOf('/src/main.tsx'))
  })
})
