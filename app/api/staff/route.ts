import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const staff = await prisma.staff.findMany({
      orderBy: { name: 'asc' }
    })
    return NextResponse.json(staff)
  } catch (error) {
    console.error('Error fetching staff:', error)
    return NextResponse.json({ error: 'Failed to fetch staff' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, dateOfBirth, startDate, status, role, notes } = body

    // Validation
    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const staff = await prisma.staff.create({
      data: {
        name: name.trim(),
        dateOfBirth: dateOfBirth && dateOfBirth.trim() !== '' ? dateOfBirth : null,
        startDate: startDate && startDate.trim() !== '' ? startDate : null,
        status: status || 'active',
        role: role || 'cashier',
        notes: notes || ''
      }
    })

    return NextResponse.json(staff, { status: 201 })
  } catch (error) {
    console.error('Error creating staff:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorDetails = error instanceof Error ? error.stack : String(error)
    console.error('Error details:', errorDetails)
    return NextResponse.json({ 
      error: 'Failed to create staff',
      details: errorMessage 
    }, { status: 500 })
  }
}

