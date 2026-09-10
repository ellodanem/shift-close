/** Text color that stays readable on a hex (or css) background. */
export function textOnHex(bg: string | null | undefined): string {
  const raw = bg?.trim()
  if (!raw) return '#111827'
  let hex = raw
  const short = /^#?([0-9a-f]{3})$/i.exec(raw)
  const full = /^#?([0-9a-f]{6})$/i.exec(raw)
  if (short) {
    const [r, g, b] = short[1].split('')
    hex = `${r}${r}${g}${g}${b}${b}`
  } else if (full) {
    hex = full[1]
  } else {
    return '#111827'
  }
  const n = parseInt(hex, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const luminance = (r * 299 + g * 587 + b * 114) / 1000
  return luminance > 155 ? '#111827' : '#ffffff'
}

export function formatHm(t: string | null | undefined): string {
  const s = (t ?? '').trim()
  return s.length >= 5 ? s.slice(0, 5) : s
}
