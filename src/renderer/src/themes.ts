// Theme registry + applier. The colours themselves live in themes.css as [data-theme="<id>"] blocks.
// The id list here and the blocks in themes.css are kept in sync by themes.test.ts.

export const THEMES = [
  { id: 'dark', label: 'Dark', blurb: 'The default charcoal look' },
  { id: 'light', label: 'Light', blurb: 'Clean daytime, dark text on white' },
  { id: 'high-contrast', label: 'High contrast', blurb: 'Black and white, yellow and cyan, thick borders' },
  { id: 'stage', label: 'Stage', blurb: 'Pure black for OLED, vivid accents' },
  { id: 'sunburst', label: 'Sunburst', blurb: 'Amber to red on dark brown' },
  { id: 'maple', label: 'Maple', blurb: 'Pale maple neck, black dots, cream UI' },
  { id: 'surf-green', label: 'Surf Green', blurb: 'Vintage surf green, mint and cream' }
] as const

export type ThemeId = (typeof THEMES)[number]['id']
export const DEFAULT_THEME: ThemeId = 'dark'

/** Remembered outside the progress file so the right theme is applied synchronously, before first paint. */
const CACHE_KEY = 'fretwise-theme'

export function isThemeId(x: unknown): x is ThemeId {
  return typeof x === 'string' && THEMES.some((t) => t.id === x)
}

/** Unknown / missing ids fall back to the default theme. */
export function normalizeTheme(x: unknown): ThemeId {
  return isThemeId(x) ? x : DEFAULT_THEME
}

/** Set the theme on <html> (and remember it for the next start). Safe in tests / non-DOM environments. */
export function applyTheme(id: unknown): void {
  const theme = normalizeTheme(id)
  if (typeof document === 'undefined') return
  if (document.documentElement.dataset.theme !== theme) document.documentElement.dataset.theme = theme
  try {
    if (localStorage.getItem(CACHE_KEY) !== theme) localStorage.setItem(CACHE_KEY, theme)
  } catch {
    /* storage unavailable: the progress file still decides on the next start */
  }
}

/** Apply the theme remembered from last run (called first thing at startup). */
export function applyCachedTheme(): void {
  if (typeof document === 'undefined') return
  let cached: string | null = null
  try {
    cached = localStorage.getItem(CACHE_KEY)
  } catch {
    cached = null
  }
  document.documentElement.dataset.theme = normalizeTheme(cached)
}
