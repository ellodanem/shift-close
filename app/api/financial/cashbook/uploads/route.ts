import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { parseCashbookAccount } from '@/lib/cashbook-accounts'
import { parseCashbookSheet } from '@/lib/cashbook-sheet'
import { TaskError, previewUploads, saveUploads, storedSheetFrom, type StoredSheet } from '@/lib/cashbook-task-db'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 5 * 1024 * 1024

/**
 * POST multipart: one or two cash book spreadsheets (Westline and/or Service Station).
 *   ?preview=1  compare only, nothing is saved
 *   otherwise   save the upload and raise the tasks
 * Upload both accounts together so a transfer between them is recognised as one thing.
 */
export async function POST(request: NextRequest) {
  try {
    const preview = request.nextUrl.searchParams.get('preview') === '1'
    const form = await request.formData()
    const files = form.getAll('file').filter((value): value is File => value instanceof File)
    if (files.length === 0) return NextResponse.json({ error: 'Choose a cash book spreadsheet.' }, { status: 400 })
    if (files.length > 2) {
      return NextResponse.json({ error: 'Upload at most two sheets: Westline and Service Station.' }, { status: 400 })
    }

    const accountField = form.get('account')
    const forced =
      typeof accountField === 'string' && accountField && files.length === 1 ? parseCashbookAccount(accountField) : null

    const sheets: StoredSheet[] = []
    for (const file of files) {
      if (file.size === 0 || file.size > MAX_BYTES) {
        return NextResponse.json({ error: `${file.name} must be under 5 MB.` }, { status: 400 })
      }
      let rows: unknown[][]
      try {
        const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' })
        const first = workbook.Sheets[workbook.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json(first, { header: 1, raw: false, defval: '' }) as unknown[][]
      } catch {
        return NextResponse.json({ error: `${file.name} could not be read as a spreadsheet.` }, { status: 400 })
      }
      sheets.push(storedSheetFrom(parseCashbookSheet(rows), file.name, forced))
    }
    if (sheets.length === 2 && sheets[0].account === sheets[1].account) {
      return NextResponse.json(
        { error: 'Both files look like the same account. Upload one Westline and one Service Station sheet.' },
        { status: 400 }
      )
    }

    if (preview) {
      return NextResponse.json({ preview: true, sheets: await previewUploads(sheets) })
    }
    const saved = await saveUploads(sheets)
    return NextResponse.json({
      preview: false,
      sheets: saved.map((item) => ({ ...item.summary, tasksSaved: item.tasks }))
    })
  } catch (error) {
    if (error instanceof TaskError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Cashbook upload failed:', error)
    return NextResponse.json({ error: 'Failed to compare the spreadsheet' }, { status: 500 })
  }
}
