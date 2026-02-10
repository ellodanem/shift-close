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

    const category = await prisma.cashbookCategory.create({
      data: {
        name: name.trim(),
        code: code?.trim() || null,
        type: type?.trim() || 'expense',
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

