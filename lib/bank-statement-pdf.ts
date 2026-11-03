/**
 * Reads a bank statement PDF into text lines.
 * Words are grouped into rows by their vertical position, so table columns
 * (date, description, amounts) stay on one line.
 */

type TextItem = { str: string; x: number; y: number; width: number }

const ROW_TOLERANCE = 3

export function rowsFromItems(items: TextItem[]): string[] {
  const sorted = [...items]
    .filter((item) => item.str.trim() !== '')
    .sort((a, b) => b.y - a.y || a.x - b.x)

  const rows: TextItem[][] = []
  for (const item of sorted) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(row[0].y - item.y) <= ROW_TOLERANCE) row.push(item)
    else rows.push([item])
  }

  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x)
    let line = ''
    let prevEnd: number | null = null
    for (const item of row) {
      if (prevEnd != null && item.x - prevEnd > 1) line += ' '
      line += item.str.trim()
      prevEnd = item.x + item.width
    }
    return line
  })
}

export async function extractStatementText(data: Uint8Array): Promise<string> {
  const { getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(data)
  const pages: string[] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const items: TextItem[] = []
    for (const raw of content.items) {
      const item = raw as { str?: string; transform?: number[]; width?: number }
      if (typeof item.str !== 'string' || !item.transform) continue
      items.push({ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width ?? 0 })
    }
    pages.push(rowsFromItems(items).join('\n'))
  }
  return pages.join('\n')
}
