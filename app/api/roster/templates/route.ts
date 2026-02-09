import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Roster shift templates (presets like "6-1", "1-9", "7:30 - 2")
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const templates = await prisma.shiftTemplate.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
    })
    return NextResponse.json(templates)
  } catch (error) {
    console.error('Error fetching shift templates:', error)
    return NextResponse.json({ error: 'Failed to fetch shift templates' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, startTime, endTime, color, sortOrder } = body as {
      name?: string
      startTime?: string
      endTime?: string
      color?: string
      sortOrder?: number
    }

    if (!name || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'name, startTime, and endTime are required' },
        { status: 400 }
      )
    }

    const template = await prisma.shiftTemplate.create({
      data: {
        name: name.trim(),
        startTime: startTime.trim(),
        endTime: endTime.trim(),
        color: color?.trim() || null,
        sortOrder: typeof sortOrder === 'number' ? sortOrder : 0
      }
    })

    return NextResponse.json(template, { status: 201 })
  } catch (error) {
    console.error('Error creating shift template:', error)
    return NextResponse.json({ error: 'Failed to create shift template' }, { status: 500 })
  }
}

