import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const vendor = await prisma.vendor.findUnique({
      where: { id },
      include: {
        invoices: { orderBy: { invoiceDate: 'desc' } },
        batches: { orderBy: { paymentDate: 'desc' }, take: 10 }
      }
    })
    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }
    return NextResponse.json(vendor)
  } catch (error) {
    console.error('Error fetching vendor:', error)
    return NextResponse.json({ error: 'Failed to fetch vendor' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, notificationEmail, notes } = body

    const vendor = await prisma.vendor.findUnique({ where: { id } })
    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (name !== undefined) data.name = String(name).trim()
    if (notificationEmail !== undefined) data.notificationEmail = String(notificationEmail).trim()
    if (notes !== undefined) data.notes = String(notes).trim()

    const updated = await prisma.vendor.update({
      where: { id },
      data
    })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating vendor:', error)
    return NextResponse.json({ error: 'Failed to update vendor' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const vendor = await prisma.vendor.findUnique({
      where: { id },
      include: { _count: { select: { invoices: true } } }
    })
    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }
    if (vendor._count.invoices > 0) {
      return NextResponse.json(
        { error: `Cannot delete vendor with ${vendor._count.invoices} invoice(s). Delete invoices first.` },
        { status: 400 }
      )
    }
    await prisma.vendor.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting vendor:', error)
    return NextResponse.json({ error: 'Failed to delete vendor' }, { status: 500 })
  }
}
