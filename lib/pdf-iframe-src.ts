/**
 * Chromium’s built‑in PDF viewer reads “open parameters” in the URL fragment.
 * `navpanes=0` starts with the thumbnail strip collapsed so inline iframes use width better.
 * No-op for non-PDF URLs (e.g. image scans).
 */
export function pdfIframeSrc(url: string): string {
  let pathname = url
  try {
    pathname = new URL(url, 'http://local.invalid').pathname
  } catch {
    pathname = url.split('?')[0].split('#')[0]
  }
  if (!pathname.toLowerCase().endsWith('.pdf')) return url
  if (/[#&]navpanes=/.test(url)) return url

  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    const inner = u.hash.length > 1 ? u.hash.slice(1) : ''
    u.hash = inner ? `${inner}&navpanes=0` : 'navpanes=0'
    return u.toString()
  } catch {
    const i = url.indexOf('#')
    if (i >= 0) return `${url.slice(0, i)}#${url.slice(i + 1)}&navpanes=0`
    return `${url}#navpanes=0`
  }
}
