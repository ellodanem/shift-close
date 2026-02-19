import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const staff = await prisma.staff.findUnique({
      where: { id: params.id },
      include: {
        _count: {
          select: { shifts: true }
        }
      }
    })

    if (!staff) {
      return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
    }

    return NextResponse.json(staff)
  } catch (error) {
    console.error('Error fetching staff:', error)
    return NextResponse.json({ error: 'Failed to fetch staff' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { name, firstName, lastName, dateOfBirth, startDate, status, role, roleId, nicNumber, deviceUserId, bankName, accountNumber, mobileNumber, notes, vacationStart, vacationEnd } = body

    const data: Record<string, unknown> = {
      ...(dateOfBirth !== undefined && { dateOfBirth: dateOfBirth || null }),
      ...(startDate !== undefined && { startDate: startDate || null }),
      ...(status !== undefined && { status }),
      ...(role !== undefined && { role }),
      ...(roleId !== undefined && { roleId: roleId || null }),
      ...(nicNumber !== undefined && { nicNumber: nicNumber || null }),
      ...(deviceUserId !== undefined && { deviceUserId: deviceUserId && String(deviceUserId).trim() ? String(deviceUserId).trim() : null }),
      ...(bankName !== undefined && { bankName: bankName || null }),
      ...(accountNumber !== undefined && { accountNumber: accountNumber || null }),
      ...(mobileNumber !== undefined && { mobileNumber: mobileNumber || null }),
      ...(notes !== undefined && { notes: notes || '' }),
      ...(vacationStart !== undefined && { vacationStart: vacationStart && String(vacationStart).trim() ? String(vacationStart).trim() : null }),
      ...(vacationEnd !== undefined && { vacationEnd: vacationEnd && String(vacationEnd).trim() ? String(vacationEnd).trim() : null })
    }

    if (firstName !== undefined || lastName !== undefined) {
      const current = await prisma.staff.findUnique({ where: { id: params.id }, select: { firstName: true, lastName: true } })
      const first = (firstName !== undefined ? firstName : current?.firstName ?? '').toString().trim()
      const last = (lastName !== undefined ? lastName : current?.lastName ?? '').toString().trim()
      const displayName = [first, last].filter(Boolean).join(' ').trim()
      if (!displayName) {
        return NextResponse.json({ error: 'First name or last name is required' }, { status: 400 })
      }
      data.firstName = first || ''
      data.lastName = last || ''
      data.name = displayName
    } else if (name !== undefined) {
      if (name.trim() === '') {
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
      }
      data.name = name.trim()
    }

    const staff = await prisma.staff.update({
      where: { id: params.id },
      data: data as any
    })

    return NextResponse.json(staff)
  } catch (error) {
    console.error('Error updating staff:', error)
    return NextResponse.json({ error: 'Failed to update staff' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check if staff has any shifts
    const shiftCount = await prisma.shiftClose.count({
      where: { supervisorId: params.id }
    })

    if (shiftCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete staff member. They are referenced by ${shiftCount} shift(s).` },
        { status: 400 }
      )
    }

    await prisma.staff.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting staff:', error)
    return NextResponse.json({ error: 'Failed to delete staff' }, { status: 500 })
  }
}

