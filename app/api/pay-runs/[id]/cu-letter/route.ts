import { NextRequest, NextResponse } from 'next/server'
import { sendMail } from '@/lib/email'
import { parseExtraLines, presentPayRunLine } from '@/lib/pay-run'
import { attachBankingToLines } from '@/lib/pay-run-build'
import { buildBankingPack } from '@/lib/pay-run-banking'
import {
  creditUnionLetterPdfBuffer,
  creditUnionLetters,
  cuLetterEmailBody,
  cuLetterFilename,
  cuLetterSubject
} from '@/lib/pay-run-cu-letter'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** POST /api/pay-runs/:id/cu-letter — email the CU allocation PDF */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const to = typeof body.to === 'string' ? body.to.trim() : ''
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : 'NFGWCCU'
    if (!to) {
      return NextResponse.json({ error: 'Recipient (to) is required' }, { status: 400 })
    }

    const run = await prisma.payRun.findUnique({
      where: { id },
      include: { lines: { orderBy: { sortOrder: 'asc' } } }
    })
    if (!run) return NextResponse.json({ error: 'Pay run not found' }, { status: 404 })

    const staffIds = run.lines.map((line) => line.staffId).filter((staffId): staffId is string => Boolean(staffId))
    const staff = staffIds.length
      ? await prisma.staff.findMany({
          where: { id: { in: staffIds } },
          select: { id: true, bankName: true, accountNumber: true }
        })
      : []
    const pack = buildBankingPack(
      attachBankingToLines(run.lines.map((line) => presentPayRunLine(line)), new Map(staff.map((s) => [s.id, s]))),
      parseExtraLines(run.extraDisbursements)
    )
    const letter = creditUnionLetters(pack).find((item) => item.code === code)
    if (!letter) {
      return NextResponse.json({ error: `No ${code} members on this pay run` }, { status: 400 })
    }

    const subject = typeof body.subject === 'string' && body.subject.trim() ? body.subject.trim() : cuLetterSubject(letter, run.payDate)
    const html = typeof body.html === 'string' && body.html.trim() ? body.html.trim() : `<p>${cuLetterEmailBody(letter)}</p>`
    const letterText = typeof body.letterText === 'string' ? body.letterText.slice(0, 12000) : ''

    await sendMail({
      to,
      subject,
      html,
      attachments: [
        {
          filename: cuLetterFilename(letter, run.payDate),
          content: creditUnionLetterPdfBuffer(letter, run.payDate, letterText),
          contentType: 'application/pdf'
        }
      ]
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('CU letter email error:', error)
    const err = error as { message?: string }
    return NextResponse.json({ error: err?.message || 'Failed to email CU letter' }, { status: 500 })
  }
}
