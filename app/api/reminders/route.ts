import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const where: { date?: { gte?: string; lte?: string } } = {}
    if (startDate && endDate) {
      where.date = { gte: startDate, lte: endDate }
    } else if (startDate) {
      where.date = { gte: startDate }
    } else if (endDate) {
      where.date = { lte: endDate }
    }

    const reminders = await prisma.reminder.findMany({
      where,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
    })
    return NextResponse.json(reminders)
  } catch (error) {
    console.error('Error fetching reminders:', error)
    return NextResponse.json({ error: 'Failed to fetch reminders' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      title,
      date,
      notes,
      notifyEmail = true,
      notifyWhatsApp = false,
      notifyDaysBefore = '7,3,1,0'
    } = body as {
      title?: string
      date?: string
      notes?: string | null
      notifyEmail?: boolean
      notifyWhatsApp?: boolean
      notifyDaysBefore?: string
    }

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }
    if (!date?.trim()) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 })
    }

    const reminder = await prisma.reminder.create({
      data: {
        title: title.trim(),
        date: date.trim(),
        notes: notes?.trim() || null,
        notifyEmail: !!notifyEmail,
        notifyWhatsApp: !!notifyWhatsApp,
        notifyDaysBefore: String(notifyDaysBefore || '7,3,1,0')
      }
    })
    return NextResponse.json(reminder, { status: 201 })
  } catch (error) {
    console.error('Error creating reminder:', error)
    const message = error instanceof Error ? error.message : 'Failed to create reminder'
    const hint = /does not exist|relation.*reminders/i.test(message)
      ? ' Run scripts/neon-apply-reminders.sql in Neon SQL Editor.'
      : ''
    return NextResponse.json({ error: message + hint }, { status: 500 })
}
