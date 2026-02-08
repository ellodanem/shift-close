import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const list = await prisma.emailRecipient.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    })
    return NextResponse.json(list)
  } catch (error) {
    console.error('Error fetching email recipients:', error)
    return NextResponse.json({ error: 'Failed to fetch recipients' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { label, email } = body as { label?: string; email?: string }
    if (!label?.trim() || !email?.trim()) {
      return NextResponse.json(
        { error: 'Label and email are required' },
        { status: 400 }
      )
    }
    const maxOrder = await prisma.emailRecipient.aggregate({
      _max: { sortOrder: true }
    })
    const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1
    const recipient = await prisma.emailRecipient.create({
      data: {
        label: label.trim(),
        email: email.trim().toLowerCase(),
        sortOrder
      }
    })
    return NextResponse.json(recipient)
  } catch (error) {
    console.error('Error creating email recipient:', error)
    return NextResponse.json({ error: 'Failed to add recipient' }, { status: 500 })
  }
}
