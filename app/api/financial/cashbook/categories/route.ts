import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const categories = await prisma.cashbookCategory.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
    })
    return NextResponse.json(categories)
  } catch (error) {
    console.error('Error fetching cashbook categories:', error)
    return NextResponse.json({ error: 'Failed to fetch cashbook categories' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      name,
      code,
      type,
      sortOrder,
      active = true
    } = body as {
      name?: string
      code?: string | null
      type?: string | null
      sortOrder?: number | null
      active?: boolean
    }

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 })
    }

    const nameTrimmed = name.trim()
    const typeVal = type?.trim() || 'expense'

    // Prevent duplicate category names (case-insensitive)
    const existing = await prisma.cashbookCategory.findFirst({
      where: {
        name: { equals: nameTrimmed, mode: 'insensitive' },
        type: typeVal
      }
    })
    if (existing) {
      return NextResponse.json(
        { error: `Category "${existing.name}" already exists` },
        { status: 409 }
      )
    }

    const category = await prisma.cashbookCategory.create({
      data: {
        name: nameTrimmed,
        code: code?.trim() || null,
        type: typeVal,
        sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
        active
      }
    })

    return NextResponse.json(category, { status: 201 })
  } catch (error) {
    console.error('Error creating cashbook category:', error)
    return NextResponse.json({ error: 'Failed to create cashbook category' }, { status: 500 })
  }
}

