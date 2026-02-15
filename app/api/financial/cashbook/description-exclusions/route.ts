import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** POST - Add a description to exclusions (hide from suggestions) */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { description, type } = body as { description?: string; type?: string }
    if (!description || !description.trim()) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 })
    }
    if (!type || !['income', 'expense'].includes(type)) {
      return NextResponse.json({ error: 'type (income|expense) is required' }, { status: 400 })
    }

    await prisma.cashbookDescriptionExclusion.upsert({
      where: {
        cashbook_description_exclusions_description_type_key: { description: description.trim(), type }
      },
      create: { description: description.trim(), type },
      update: {}
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error adding description exclusion:', error)
    return NextResponse.json({ error: 'Failed to add exclusion' }, { status: 500 })
  }
}

/** DELETE - Remove a description from exclusions (show in suggestions again) */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { description, type } = body as { description?: string; type?: string }
    if (!description || !description.trim()) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 })
    }
    if (!type || !['income', 'expense'].includes(type)) {
      return NextResponse.json({ error: 'type (income|expense) is required' }, { status: 400 })
    }

    await prisma.cashbookDescriptionExclusion.deleteMany({
      where: {
        description: description.trim(),
        type
      }
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error removing description exclusion:', error)
    return NextResponse.json({ error: 'Failed to remove exclusion' }, { status: 500 })
  }
}
