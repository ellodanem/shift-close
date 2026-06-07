import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DEFAULT_VAT_RATE, parseVatRatePercent } from '@/lib/vendorVat'

export async function GET() {
  try {
    const vendors = await prisma.vendor.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { invoices: true }
        }
      }
    })
    return NextResponse.json(vendors)
  } catch (error) {
    console.error('Error fetching vendors:', error)
    return NextResponse.json({ error: 'Failed to fetch vendors' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, notificationEmail, notes, isVatRegistered, vatRate } = body

    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: 'Vendor name is required' }, { status: 400 })
    }
    if (!notificationEmail || !String(notificationEmail).trim()) {
      return NextResponse.json({ error: 'Notification email is required' }, { status: 400 })
    }

    const vatRegistered = Boolean(isVatRegistered)
    let rate = DEFAULT_VAT_RATE
    if (vatRate !== undefined && vatRate !== null && String(vatRate).trim() !== '') {
      const parsed = Number(vatRate)
      rate = parsed > 1 ? parseVatRatePercent(String(vatRate)) : parsed
      if (Number.isNaN(rate) || rate < 0) {
        return NextResponse.json({ error: 'Invalid VAT rate' }, { status: 400 })
      }
    }

    const vendor = await prisma.vendor.create({
      data: {
        name: String(name).trim(),
        notificationEmail: String(notificationEmail).trim(),
        notes: (notes && String(notes).trim()) || '',
        isVatRegistered: vatRegistered,
        vatRate: rate
      }
    })

    return NextResponse.json(vendor, { status: 201 })
  } catch (error) {
    console.error('Error creating vendor:', error)
    return NextResponse.json({ error: 'Failed to create vendor' }, { status: 500 })
  }
}
