import { NextRequest, NextResponse } from 'next/server'
import { extractStatementText } from '@/lib/bank-statement-pdf'
import { findPosCommissions, findStatementChecks, parseStatementText } from '@/lib/bank-statement'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_BYTES = 8 * 1024 * 1024
const WESTLINE_ACCOUNT_NUMBER = '200000316928'

// POST a bank statement PDF and get its transactions back. Nothing is saved.
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Choose a statement PDF to import.' }, { status: 400 })
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'The PDF must be under 8 MB.' }, { status: 400 })
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') {
      return NextResponse.json({ error: 'That file is not a PDF.' }, { status: 400 })
    }

    const text = await extractStatementText(bytes)
    if (!text.trim()) {
      return NextResponse.json(
        { error: 'No text found in this PDF. It may be a scan or photo of a statement.' },
        { status: 422 }
      )
    }

    const parsed = parseStatementText(text)
    return NextResponse.json({
      fileName: file.name,
      transactions: parsed.transactions,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      skippedLines: parsed.skippedLines,
      checkCount: findStatementChecks(parsed.transactions).length,
      commissionCount: findPosCommissions(parsed.transactions).length,
      westlineNumberFound: text.replace(/\s+/g, '').includes(WESTLINE_ACCOUNT_NUMBER),
      textPreview: text.slice(0, 6000)
    })
  } catch (error) {
    console.error('Error reading bank statement:', error)
    return NextResponse.json({ error: 'Could not read that PDF.' }, { status: 500 })
  }
}
