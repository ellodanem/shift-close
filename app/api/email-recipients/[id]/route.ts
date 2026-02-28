import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { label, email, mobileNumber } = body as { label?: string; email?: string; mobileNumber?: string | null }
    const data: { label?: string; email?: string; mobileNumber?: string | null } = {}
    if (label !== undefined) data.label = label.trim() || undefined
    if (email !== undefined) data.email = email.trim().toLowerCase() || undefined
    if (mobileNumber !== undefined) data.mobileNumber = mobileNumber?.trim() || null
    const recipient = await prisma.emailRecipient.update({
      where: { id },
      data
    })
    return NextResponse.json(recipient)
  } catch (error) {
    console.error('Error updating recipient:', error)
    return NextResponse.json({ error: 'Failed to update recipient' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await prisma.emailRecipient.delete({
      where: { id }
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting email recipient:', error)
    return NextResponse.json({ error: 'Failed to delete recipient' }, { status: 500 })
  }
}
