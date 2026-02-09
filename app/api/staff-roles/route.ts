import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// List all staff roles
export async function GET() {
  try {
    const roles = await prisma.staffRole.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
    })
    return NextResponse.json(roles)
  } catch (error) {
    console.error('Error fetching staff roles:', error)
    return NextResponse.json({ error: 'Failed to fetch staff roles' }, { status: 500 })
  }
}

// Create a new staff role
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, badgeColor, sortOrder } = body as {
      name?: string
      badgeColor?: string
      sortOrder?: number
    }

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const role = await prisma.staffRole.create({
      data: {
        name: name.trim(),
        badgeColor: badgeColor?.trim() || null,
        sortOrder: typeof sortOrder === 'number' ? sortOrder : 0
      }
    })

    return NextResponse.json(role, { status: 201 })
  } catch (error: any) {
    console.error('Error creating staff role:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to create staff role' },
      { status: 500 }
    )
  }
}

