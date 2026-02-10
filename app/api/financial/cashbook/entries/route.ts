import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const where: any = {}
    if (startDate && endDate) {
      where.date = { gte: startDate, lte: endDate }
    } else if (startDate) {
      where.date = { gte: startDate }
    } else if (endDate) {
      where.date = { lte: endDate }
    }

    const entries = await prisma.cashbookEntry.findMany({
      where,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      include: {
        allocations: {
          include: { category: true }
        }
      }
    })

    return NextResponse.json(entries)
  } catch (error) {
    console.error('Error fetching cashbook entries:', error)
    return NextResponse.json({ error: 'Failed to fetch cashbook entries' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      date,
      ref,
      description,
      debitCash = 0,
      debitEcard = 0,
      debitDcard = 0,
      creditAmt = 0,
      bank,
      categoryId,
      amount,
      shiftId,
      paymentBatchId
    } = body as {
      date?: string
      ref?: string | null
      description?: string
      debitCash?: number
      debitEcard?: number
      debitDcard?: number
      creditAmt?: number
      bank?: string | null
      categoryId?: string
      amount?: number
      shiftId?: string | null
      paymentBatchId?: string | null
    }

    if (!date || !date.trim()) {
      return NextResponse.json({ error: 'date (YYYY-MM-DD) is required' }, { status: 400 })
    }
    if (!description || !description.trim()) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 })
    }
    if (!categoryId) {
      return NextResponse.json({ error: 'categoryId is required' }, { status: 400 })
    }
    if (typeof amount !== 'number' || Number.isNaN(amount)) {
      return NextResponse.json({ error: 'amount must be a number' }, { status: 400 })
    }

    const entry = await prisma.cashbookEntry.create({
      data: {
        date: date.trim(),
        ref: ref?.trim() || null,
        description: description.trim(),
        debitCash: Number(debitCash) || 0,
        debitEcard: Number(debitEcard) || 0,
        debitDcard: Number(debitDcard) || 0,
        creditAmt: Number(creditAmt) || 0,
        bank: bank?.trim() || null,
        shiftId: shiftId || null,
        paymentBatchId: paymentBatchId || null,
        allocations: {
          create: {
            categoryId,
            amount
          }
        }
      },
      include: {
        allocations: {
          include: { category: true }
        }
      }
    })

    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    console.error('Error creating cashbook entry:', error)
    return NextResponse.json({ error: 'Failed to create cashbook entry' }, { status: 500 })
  }
}

