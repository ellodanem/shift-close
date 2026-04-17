import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/session'
import { redactStaffRecord } from '@/lib/staff-redact'
import {
  allocateNextDeviceUserId,
  findStaffOccupyingSlot,
  parseExplicitDeviceUserIdInput
} from '@/lib/device-user-id'

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    const role = session?.role ?? ''
    const staff = await prisma.staff.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { staffRole: true }
    })
    const out = session ? staff.map((s) => redactStaffRecord(s, role)) : staff
    return NextResponse.json(out)
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

class HttpError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

function isSerializationFailure(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      name,
      firstName,
      lastName,
      dateOfBirth,
      startDate,
      status,
      role,
      roleId,
      nicNumber,
      bankName,
      accountNumber,
      mobileNumber,
      notes,
      punchExempt,
      deviceUserId: deviceUserIdBody
    } = body

    const first = (firstName ?? name ?? '').toString().trim()
    const last = (lastName ?? '').toString().trim()
    const displayName = fullNameFromFirstLast(first, last)
    if (!displayName) {
      return NextResponse.json({ error: 'First name or last name is required' }, { status: 400 })
    }

    const explicitRaw =
      deviceUserIdBody !== undefined && deviceUserIdBody !== null && String(deviceUserIdBody).trim() !== ''
        ? deviceUserIdBody
        : null

    if (explicitRaw != null) {
      const parsed = parseExplicitDeviceUserIdInput(explicitRaw)
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 })
      }
    }

    const maxAttempts = 5
    let lastSerializationError: unknown = null

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const staff = await prisma.$transaction(
          async (tx) => {
            const maxOrderRow = await tx.staff.aggregate({ _max: { sortOrder: true } })
            const nextSort = (maxOrderRow._max.sortOrder ?? -1) + 1

            let deviceUserId: string
            if (explicitRaw != null) {
              const parsed = parseExplicitDeviceUserIdInput(explicitRaw)
              if (!parsed.ok) {
                throw new HttpError(parsed.error, 400)
              }
              const other = await findStaffOccupyingSlot(tx, parsed.slot)
              if (other) {
                throw new HttpError('Device ID already in use by another staff member.', 400)
              }
              deviceUserId = parsed.normalized
            } else {
              const next = await allocateNextDeviceUserId(tx)
              if (!next) {
                throw new HttpError(
                  'All device IDs (1–999) are in use. Remove or reassign a device ID before adding staff.',
                  409
                )
              }
              deviceUserId = next
            }

            return tx.staff.create({
              data: {
                name: displayName,
                firstName: first || '',
                lastName: last || '',
                sortOrder: nextSort,
                deviceUserId,
                dateOfBirth: dateOfBirth && dateOfBirth.trim() !== '' ? dateOfBirth : null,
                startDate: startDate && startDate.trim() !== '' ? startDate : null,
                status: status || 'active',
                role: role || 'cashier',
                roleId: roleId && roleId.trim() !== '' ? roleId.trim() : null,
                nicNumber: nicNumber && nicNumber.trim() !== '' ? nicNumber.trim() : null,
                bankName: bankName && bankName.trim() !== '' ? bankName.trim() : null,
                accountNumber: accountNumber && accountNumber.trim() !== '' ? accountNumber.trim() : null,
                mobileNumber: mobileNumber && mobileNumber.trim() !== '' ? mobileNumber.trim() : null,
                notes: notes || '',
                punchExempt: punchExempt === true
              }
            })
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5000,
            timeout: 15000
          }
        )

        return NextResponse.json(staff, { status: 201 })
      } catch (error) {
        if (isSerializationFailure(error)) {
          lastSerializationError = error
          continue
        }
        if (error instanceof HttpError) {
          return NextResponse.json({ error: error.message }, { status: error.statusCode })
        }
        throw error
      }
    }

    console.error('Staff create: exhausted retries after serialization conflicts', lastSerializationError)
    return NextResponse.json(
      { error: 'Could not assign a device ID right now. Please try again in a moment.' },
      { status: 503 }
    )
  } catch (error) {
    console.error('Error creating staff:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorDetails = error instanceof Error ? error.stack : String(error)
    console.error('Error details:', errorDetails)
    return NextResponse.json(
      {
        error: 'Failed to create staff',
        details: errorMessage
      },
      { status: 500 }
    )
  }
}
