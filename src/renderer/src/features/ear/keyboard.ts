/** Focused controls own activation keys, including SVG frets with role="button". */
export function controlOwnsDrillKey(e: Pick<KeyboardEvent, 'key' | 'target' | 'defaultPrevented'>): boolean {
  if (e.defaultPrevented) return true
  const target = e.target as Element | null
  if (!target?.closest) return false
  if (target.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"])')) return true
  return (e.key === ' ' || e.key === 'Enter') && !!target.closest('button, a[href], summary, [role="button"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"]')
}
