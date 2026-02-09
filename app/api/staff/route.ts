import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const staff = await prisma.staff.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
    })
    return NextResponse.json(staff)
  } catch (error) {
    console.error('Error fetching staff:', error)
    const message =
      error && typeof error === 'object' && 'message' in error
        ? (error as any).message
        : 'Failed to fetch staff'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function fullNameFromFirstLast(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(' ').trim() || ''
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, firstName, lastName, dateOfBirth, startDate, status, role, roleId, nicNumber, bankName, accountNumber, notes } = body

    const first = (firstName ?? name ?? '').toString().trim()
    const last = (lastName ?? '').toString().trim()
    const displayName = fullNameFromFirstLast(first, last)
    if (!displayName) {
      return NextResponse.json({ error: 'First name or last name is required' }, { status: 400 })
    }

    const maxOrder = await prisma.staff.aggregate({ _max: { sortOrder: true } }).then((r) => r._max.sortOrder ?? -1)
    const staff = await prisma.staff.create({
      data: {
        name: displayName,
        firstName: first || '',
        lastName: last || '',
        sortOrder: maxOrder + 1,
        dateOfBirth: dateOfBirth && dateOfBirth.trim() !== '' ? dateOfBirth : null,
        startDate: startDate && startDate.trim() !== '' ? startDate : null,
        status: status || 'active',
        role: role || 'cashier',
        roleId: roleId && roleId.trim() !== '' ? roleId.trim() : null,
        nicNumber: nicNumber && nicNumber.trim() !== '' ? nicNumber.trim() : null,
        bankName: bankName && bankName.trim() !== '' ? bankName.trim() : null,
        accountNumber: accountNumber && accountNumber.trim() !== '' ? accountNumber.trim() : null,
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

