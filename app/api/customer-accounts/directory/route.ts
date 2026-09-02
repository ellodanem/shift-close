import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  listDirectory,
  seedDirectoryFromHistory,
  upsertDirectoryNames
} from '@/lib/customer-ar-directory'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const customers = await listDirectory(true)
    return NextResponse.json({ customers })
  } catch (error) {
    console.error('Directory list error:', error)
    return NextResponse.json({ error: 'Failed to load customer list' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    if (body?.seed === true) {
      const created = await seedDirectoryFromHistory()
      const customers = await listDirectory(true)
      return NextResponse.json({ created, customers })
    }

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const existing = await prisma.customerArDirectory.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } }
    })
    if (existing) {
      return NextResponse.json({ error: 'A customer with that name already exists' }, { status: 409 })
    }

    const cstoreName =
      typeof body.cstoreName === 'string' && body.cstoreName.trim()
        ? body.cstoreName.trim()
        : null

    const row = await prisma.customerArDirectory.create({
      data: {
        name,
        cstoreName,
        active: body.active === false ? false : true
      }
    })
    return NextResponse.json(row, { status: 201 })
  } catch (error) {
    console.error('Directory create error:', error)
    return NextResponse.json({ error: 'Failed to save customer' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    if (Array.isArray(body.names)) {
      await upsertDirectoryNames(body.names)
      const customers = await listDirectory(true)
      return NextResponse.json({ customers })
    }
    return NextResponse.json({ error: 'names[] is required' }, { status: 400 })
  } catch (error) {
    console.error('Directory bulk error:', error)
    return NextResponse.json({ error: 'Failed to update customer list' }, { status: 500 })
  }
}
