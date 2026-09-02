import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id
    const body = await request.json().catch(() => ({}))
    const data: {
      name?: string
      cstoreName?: string | null
      active?: boolean
    } = {}

    if (typeof body.name === 'string' && body.name.trim()) {
      const name = body.name.trim()
      const clash = await prisma.customerArDirectory.findFirst({
        where: {
          name: { equals: name, mode: 'insensitive' },
          NOT: { id }
        }
      })
      if (clash) {
        return NextResponse.json({ error: 'A customer with that name already exists' }, { status: 409 })
      }
      data.name = name
    }
    if (body.cstoreName !== undefined) {
      data.cstoreName =
        typeof body.cstoreName === 'string' && body.cstoreName.trim()
          ? body.cstoreName.trim()
          : null
    }
    if (typeof body.active === 'boolean') data.active = body.active

    const row = await prisma.customerArDirectory.update({
      where: { id },
      data
    })
    return NextResponse.json(row)
  } catch (error) {
    console.error('Directory update error:', error)
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 })
  }
}
