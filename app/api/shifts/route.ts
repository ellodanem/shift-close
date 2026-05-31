import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateShiftClose } from '@/lib/calculations'
import { addCalendarDaysYmd, businessTodayYmd } from '@/lib/datetime-policy'
import { buildShiftsList } from '@/lib/shifts-list'
import { syncShiftDepositsToCashbook } from '@/lib/cashbook-deposit-sync'
import { rename, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export const dynamic = 'force-dynamic'

const DEFAULT_RECENT_DAYS = 120
const MIN_RECENT_DAYS = 30
const MAX_RECENT_DAYS = 365

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const all = searchParams.get('all') === '1'
    let sinceDate: string | undefined

    if (!all) {
      const raw = Number(searchParams.get('recentDays') ?? DEFAULT_RECENT_DAYS)
      const days = Number.isFinite(raw)
        ? Math.min(MAX_RECENT_DAYS, Math.max(MIN_RECENT_DAYS, Math.floor(raw)))
        : DEFAULT_RECENT_DAYS
      sinceDate = addCalendarDaysYmd(businessTodayYmd(), -days)
    }

    const shifts = await buildShiftsList(sinceDate ? { sinceDate } : undefined)
    return NextResponse.json(shifts, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        ...(sinceDate ? { 'X-Shifts-Since': sinceDate } : {})
      }
    })
  } catch (error) {
    console.error('Error fetching shifts:', error)
    return NextResponse.json({ error: 'Failed to fetch shifts' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Enforce uniqueness: date + shift must be unique
    const existing = await prisma.shiftClose.findFirst({
      where: {
        date: String(body.date),
        shift: String(body.shift)
      },
      select: { id: true }
    })
    if (existing) {
      return NextResponse.json(
        { error: `A ${String(body.shift)} shift already exists for ${String(body.date)}.` },
        { status: 409 }
      )
    }
    
    const calculated = calculateShiftClose(body)
    
    // Ensure arrays are properly formatted
    const depositUrls = Array.isArray(body.depositScanUrls) ? body.depositScanUrls : []
    const debitUrls = Array.isArray(body.debitScanUrls) ? body.debitScanUrls : []
    
    // Only include fields that exist in the schema
    const shift = await prisma.shiftClose.create({
      data: {
        date: String(body.date),
        shift: String(body.shift),
        supervisor: String(body.supervisor),
        supervisorId: body.supervisorId || null,
        status: body.status === 'draft' ? 'draft' : 'closed',
        systemCash: Number(body.systemCash) || 0,
        systemChecks: Number(body.systemChecks) || 0,
        systemCredit: Number(body.systemCredit) || 0,
        systemDebit: Number(body.systemDebit) || 0,
        otherCredit: Number(body.otherCredit) || 0,
        systemInhouse: Number(body.systemInhouse) || 0,
        systemFleet: Number(body.systemFleet) || 0,
        systemMassyCoupons: Number(body.systemMassyCoupons) || 0,
        countCash: Number(body.countCash) || 0,
        countChecks: Number(body.countChecks) || 0,
        countCredit: Number(body.countCredit) || 0,
        countInhouse: Number(body.countInhouse) || 0,
        countFleet: Number(body.countFleet) || 0,
        countMassyCoupons: Number(body.countMassyCoupons) || 0,
        unleaded: Number(body.unleaded) || 0,
        diesel: Number(body.diesel) || 0,
        deposits: JSON.stringify(Array.isArray(body.deposits) ? body.deposits : []),
        notes: String(body.notes || ''),
        depositScanUrls: JSON.stringify(depositUrls),
        debitScanUrls: JSON.stringify(debitUrls),
        hasMissingHardCopyData: Boolean(body.hasMissingHardCopyData) || false,
        missingDataNotes: String(body.missingDataNotes || ''),
        overShortExplained: Boolean(body.overShortExplained) || false,
        overShortExplanation: String(body.overShortExplanation || ''),
        overShortCash: calculated.overShortCash,
        overShortTotal: calculated.overShortTotal,
        totalDeposits: calculated.totalDeposits
      }
    })
    
    // Move files from draft to shift directory if they exist
    try {
      const shiftUploadsDir = join(process.cwd(), 'public', 'uploads', shift.id)
      if (!existsSync(shiftUploadsDir)) {
        await mkdir(shiftUploadsDir, { recursive: true })
      }
      
      const draftDir = join(process.cwd(), 'public', 'uploads', 'draft')
      const updateData: { depositScanUrls?: string; debitScanUrls?: string } = {}
      
      // Move deposit scans if they exist in draft
      if (depositUrls.length > 0) {
        const movedUrls = await Promise.all(
          depositUrls.map(async (url: string) => {
            if (url.startsWith('/uploads/draft/')) {
              const draftFilename = url.replace('/uploads/draft/', '')
              const draftPath = join(draftDir, draftFilename)
              const timestamp = Date.now()
              const random = Math.random().toString(36).substring(7)
              const extension = draftFilename.split('.').pop()
              const newFilename = `deposit-${timestamp}-${random}.${extension}`
              const newPath = join(shiftUploadsDir, newFilename)
              
              if (existsSync(draftPath)) {
                try {
                  await rename(draftPath, newPath)
                  return `/uploads/${shift.id}/${newFilename}`
                } catch (error) {
                  console.error('Error moving deposit file:', error)
                  return url // Keep original URL if move fails
                }
              }
            }
            return url // Keep URL if not from draft
          })
        )
        updateData.depositScanUrls = JSON.stringify(movedUrls)
      }
      
      // Move debit scans if they exist in draft
      if (debitUrls.length > 0) {
        const movedUrls = await Promise.all(
          debitUrls.map(async (url: string) => {
            if (url.startsWith('/uploads/draft/')) {
              const draftFilename = url.replace('/uploads/draft/', '')
              const draftPath = join(draftDir, draftFilename)
              const timestamp = Date.now()
              const random = Math.random().toString(36).substring(7)
              const extension = draftFilename.split('.').pop()
              const newFilename = `debit-${timestamp}-${random}.${extension}`
              const newPath = join(shiftUploadsDir, newFilename)
              
              if (existsSync(draftPath)) {
                try {
                  await rename(draftPath, newPath)
                  return `/uploads/${shift.id}/${newFilename}`
                } catch (error) {
                  console.error('Error moving debit file:', error)
                  return url // Keep original URL if move fails
                }
              }
            }
            return url // Keep URL if not from draft
          })
        )
        updateData.debitScanUrls = JSON.stringify(movedUrls)
      }
      
      // Update shift with moved file URLs if any
      if (Object.keys(updateData).length > 0) {
        await prisma.shiftClose.update({
          where: { id: shift.id },
          data: updateData
        })
      }
    } catch (error) {
      console.error('Error moving files from draft:', error)
      // Continue even if file move fails - shift is already created
    }
    
    // Fetch updated shift
    const updatedShift = await prisma.shiftClose.findUnique({
      where: { id: shift.id }
    })

    if (updatedShift?.status === 'closed') {
      try {
        await syncShiftDepositsToCashbook(updatedShift.id)
      } catch (cashbookErr) {
        console.error('Failed to sync shift deposits to cashbook:', cashbookErr)
      }
    }
    
    return NextResponse.json(updatedShift)
  } catch (error: any) {
    console.error('Error creating shift:', error)
    const errorMessage = error?.message || error?.toString() || 'Failed to create shift'
    console.error('Full error details:', JSON.stringify(error, null, 2))
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

