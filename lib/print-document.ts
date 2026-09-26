import jsPDF from 'jspdf'

/** Print the same HTML shown in the preview, without a popup window. */
export function printHtmlDocument(html: string): boolean {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;left:-12000px;top:0;width:8.5in;height:11in;border:0;'
  document.body.appendChild(iframe)
  const win = iframe.contentWindow
  const doc = win?.document
  if (!win || !doc) {
    iframe.remove()
    return false
  }
  const cleanup = () => {
    win.removeEventListener('afterprint', cleanup)
    iframe.remove()
  }
  win.addEventListener('afterprint', cleanup)
  doc.open()
  doc.write(html)
  doc.close()
  win.focus()
  win.print()
  return true
}

function paintCanvas(pdf: jsPDF, canvas: HTMLCanvasElement, startNewPage: boolean) {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const renderedHeight = (canvas.height * pageWidth) / canvas.width
  const image = canvas.toDataURL('image/jpeg', 0.95)
  if (renderedHeight <= pageHeight + 2) {
    if (startNewPage) pdf.addPage()
    pdf.addImage(image, 'JPEG', 0, 0, pageWidth, renderedHeight)
    return
  }
  let offset = 0
  let pageIndex = 0
  while (offset < renderedHeight - 1) {
    if (startNewPage || pageIndex > 0) pdf.addPage()
    pdf.addImage(image, 'JPEG', 0, -offset, pageWidth, renderedHeight)
    offset += pageHeight
    pageIndex += 1
  }
}

/** Save the preview HTML as a letter PDF. */
export async function downloadHtmlPdf(html: string, filename: string) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;left:-12000px;top:0;width:8.5in;height:11in;border:0;background:#fff;'
  document.body.appendChild(iframe)
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('Could not build the download.')), 8000)
      iframe.onload = () => {
        window.clearTimeout(timer)
        resolve()
      }
      iframe.srcdoc = html
    })
    const view = iframe.contentDocument
    if (!view?.body) throw new Error('Could not build the download.')
    const pages = Array.from(view.querySelectorAll<HTMLElement>('.page'))
    const targets = pages.length > 0 ? pages : [view.body]
    const html2canvas = (await import('html2canvas')).default
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
    let started = false
    for (const target of targets) {
      const width = Math.max(target.scrollWidth, target.offsetWidth, 1)
      const height = Math.max(target.scrollHeight, target.offsetHeight, 1)
      const canvas = await html2canvas(target, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        width,
        height,
        windowWidth: width
      })
      if (canvas.width < 2 || canvas.height < 2) throw new Error('Could not build the download.')
      paintCanvas(pdf, canvas, started)
      started = true
    }
    pdf.save(filename)
  } finally {
    iframe.remove()
  }
}
