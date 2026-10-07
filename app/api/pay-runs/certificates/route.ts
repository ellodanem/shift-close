import { NextRequest, NextResponse } from 'next/server'
import { buildPayeCertificates, incomeYearOf } from '@/lib/paye-certificate'
import { parseExtraLines } from '@/lib/pay-run'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** GET /api/pay-runs/certificates?startDate=&endDate= — TD5 / TD4 totals for approved pay in one income year. */
export async function GET(request: NextRequest) {
  try {
    const startDate = request.nextUrl.searchParams.get('startDate')?.trim() ?? ''
    const endDate = request.nextUrl.searchParams.get('endDate')?.trim() ?? ''
    if (!YMD.test(startDate) || !YMD.test(endDate)) {
      return NextResponse.json({ error: 'Choose a start date and an end date.' }, { status: 400 })
    }
    if (startDate > endDate) {
      return NextResponse.json({ error: 'The end date has to be on or after the start.' }, { status: 400 })
    }
    const incomeYear = incomeYearOf(startDate, endDate)
    if (incomeYear == null) {
      return NextResponse.json(
        { error: 'A TD5 or TD4 covers one income year. Choose dates inside a single calendar year.' },
        { status: 400 }
      )
    }

    const runs = await prisma.payRun.findMany({
      where: { status: 'processed', payDate: { gte: startDate, lte: endDate } },
      orderBy: { payDate: 'asc' },
      include: {
        lines: {
          select: {
            staffId: true,
            staffName: true,
            staffNo: true,
            taxCode: true,
            basicPay: true,
            otPay: true,
            vacationPay: true,
            extraPay: true,
            extraLines: true,
            extraDeductions: true,
            nisEmployee: true,
            paye: true
          }
        }
      }
    })

    const staffIds = [...new Set(runs.flatMap((run) => run.lines.map((line) => line.staffId).filter((id): id is string => Boolean(id))))]
    const staff = staffIds.length
      ? await prisma.staff.findMany({
          where: { id: { in: staffIds } },
          select: {
            id: true,
            name: true,
            address: true,
            startDate: true,
            status: true,
            nicNumber: true,
            taxCode: true,
            taxNumber: true
          }
        })
      : []

    const certificates = buildPayeCertificates(
      incomeYear,
      runs.flatMap((run) =>
        run.lines.map((line) => ({
          payDate: run.payDate,
          staffId: line.staffId,
          staffName: line.staffName,
          staffNo: line.staffNo,
          taxCode: line.taxCode,
          basicPay: line.basicPay,
          otPay: line.otPay,
          vacationPay: line.vacationPay,
          extraPay: line.extraPay,
          extraLines: parseExtraLines(line.extraLines),
          extraDeductions: parseExtraLines(line.extraDeductions),
          nisEmployee: line.nisEmployee,
          paye: line.paye
        }))
      ),
      staff.map((person) => ({
        ...person,
        nicNumber: person.nicNumber,
        taxNumber: person.taxNumber
      }))
    )

    return NextResponse.json({
      startDate,
      endDate,
      incomeYear,
      certificates
    })
  } catch (error) {
    console.error('PAYE certificate error:', error)
    return NextResponse.json({ error: 'Failed to build TD5 / TD4 certificates' }, { status: 500 })
  }
}
