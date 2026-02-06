import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateShiftClose } from '@/lib/calculations'
import { rename, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export async function GET() {
  try {
    const shifts = await prisma.shiftClose.findMany({
      orderBy: { date: 'desc' },
      include: { corrections: true }
    })
    
    // Group shifts by date to check document status per day
    const shiftsByDate = new Map<string, typeof shifts>()
    shifts.forEach(shift => {
      if (!shiftsByDate.has(shift.date)) {
        shiftsByDate.set(shift.date, [])
      }
      shiftsByDate.get(shift.date)!.push(shift)
    })
    
    // Check document status for each day - separate deposit and debit scans
    const dayDepositScanStatus = new Map<string, boolean>()
    const dayDebitScanStatus = new Map<string, boolean>()
    shiftsByDate.forEach((dayShifts, date) => {
      let hasDepositScans = false
      let hasDebitScans = false
      dayShifts.forEach(shift => {
        try {
          const depositUrls = shift.depositScanUrls ? JSON.parse(shift.depositScanUrls) : []
          const debitUrls = shift.debitScanUrls ? JSON.parse(shift.debitScanUrls) : []
          if (Array.isArray(depositUrls) && depositUrls.length > 0) {
            hasDepositScans = true
          }
          if (Array.isArray(debitUrls) && debitUrls.length > 0) {
            hasDebitScans = true
          }
        } catch {
          // Ignore parse errors
        }
      })
      dayDepositScanStatus.set(date, hasDepositScans)
      dayDebitScanStatus.set(date, hasDebitScans)
    })
    
    // Recalculate totalDeposits from deposits field for each shift
    const shiftsWithRecalculatedDeposits = shifts.map(shift => {
      let recalculatedTotalDeposits = shift.totalDeposits
      
      // If totalDeposits is 0 or null, recalculate from deposits field
      if (!shift.totalDeposits || shift.totalDeposits === 0) {
        try {
          const depositsArray = typeof shift.deposits === 'string' 
            ? JSON.parse(shift.deposits || '[]') 
            : (Array.isArray(shift.deposits) ? shift.deposits : [])
          
          recalculatedTotalDeposits = depositsArray
            .filter((d: any) => d !== null && d !== undefined && !Number.isNaN(d) && d > 0)
            .reduce((sum: number, d: number) => sum + (Number(d) || 0), 0)
        } catch (err) {
          console.error('Error recalculating deposits for shift', shift.id, err)
          // Keep original value if parsing fails
        }
      }
      
      return {
        ...shift,
        totalDeposits: recalculatedTotalDeposits,
        hasDayDepositScans: dayDepositScanStatus.get(shift.date) || false,
        hasDayDebitScans: dayDebitScanStatus.get(shift.date) || false
      }
    })
    
    return NextResponse.json(shiftsWithRecalculatedDeposits)
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
    
    return NextResponse.json(updatedShift)
  } catch (error: any) {
    console.error('Error creating shift:', error)
    const errorMessage = error?.message || error?.toString() || 'Failed to create shift'
    console.error('Full error details:', JSON.stringify(error, null, 2))
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

