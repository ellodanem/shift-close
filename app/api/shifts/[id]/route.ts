import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const shift = await prisma.shiftClose.findUnique({
      where: { id },
      include: { 
        corrections: true,
        noteHistory: {
          orderBy: { createdAt: 'desc' }
        }
      }
    })
    
    if (!shift) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    
    // Recalculate totalDeposits from deposits field if it's 0 or null
    let recalculatedTotalDeposits = shift.totalDeposits
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
    
    return NextResponse.json({
      ...shift,
      totalDeposits: recalculatedTotalDeposits
    })
  } catch (error) {
    console.error('Error fetching shift:', error)
    return NextResponse.json({ error: 'Failed to fetch shift' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    
    // Check if shift is a draft - if so, allow full updates
    const existingShift = await prisma.shiftClose.findUnique({ where: { id } })
    if (!existingShift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
    }
    
    const isDraft = existingShift.status === 'draft'
    
    const updateData: any = {}

    // Prevent changing date/shift once a shift is no longer a draft
    if (!isDraft && ('date' in body || 'shift' in body)) {
      return NextResponse.json(
        { error: 'Date and Shift cannot be changed after a shift is closed/reopened. Create a new shift instead.' },
        { status: 400 }
      )
    }

    // If draft is changing date/shift, enforce uniqueness on (date, shift)
    if (isDraft && ('date' in body || 'shift' in body)) {
      const nextDate = 'date' in body ? String(body.date) : existingShift.date
      const nextShift = 'shift' in body ? String(body.shift) : existingShift.shift
      const conflict = await prisma.shiftClose.findFirst({
        where: {
          date: nextDate,
          shift: nextShift,
          NOT: { id }
        },
        select: { id: true }
      })
      if (conflict) {
        return NextResponse.json(
          { error: `A ${nextShift} shift already exists for ${nextDate}.` },
          { status: 409 }
        )
      }
    }
    
    // Always allow updating checkboxes
    if ('hasMissingHardCopyData' in body) {
      updateData.hasMissingHardCopyData = Boolean(body.hasMissingHardCopyData)
    }
    if ('missingDataNotes' in body) {
      updateData.missingDataNotes = String(body.missingDataNotes || '')
    }
    if ('overShortExplained' in body) {
      updateData.overShortExplained = Boolean(body.overShortExplained)
    }
    if ('overShortExplanation' in body) {
      updateData.overShortExplanation = String(body.overShortExplanation || '')
    }
    // Allow updating status (for reviewed status)
    if ('status' in body) {
      updateData.status = String(body.status)
    }
    
    // Track changes for closed shifts (not drafts)
    const changes: Array<{ field: string; oldValue: string; newValue: string }> = []
    const changedBy = 'admin' // Default for now, can be updated later with auth
    
    // For drafts, allow updating all fields
    if (isDraft) {
      const validFields = [
        'date', 'shift', 'supervisor', 'supervisorId',
        'systemCash', 'systemChecks', 'systemCredit', 'systemDebit', 'otherCredit',
        'systemInhouse', 'systemFleet', 'systemMassyCoupons',
        'countCash', 'countChecks', 'countCredit', 'countInhouse', 'countFleet', 'countMassyCoupons',
        'unleaded', 'diesel', 'deposits', 'notes',
        'overShortExplanation'
      ]
      
      for (const field of validFields) {
        if (field in body) {
          if (field === 'deposits') {
            updateData.deposits = typeof body.deposits === 'string' ? body.deposits : JSON.stringify(body.deposits)
          } else if (['systemCash', 'systemChecks', 'systemCredit', 'systemDebit', 'otherCredit', 
                       'systemInhouse', 'systemFleet', 'systemMassyCoupons',
                       'countCash', 'countChecks', 'countCredit', 'countInhouse', 'countFleet', 'countMassyCoupons',
                       'unleaded', 'diesel'].includes(field)) {
            updateData[field] = Number(body[field]) || 0
          } else if (field === 'supervisorId') {
            updateData.supervisorId = body[field] || null
          } else {
            updateData[field] = String(body[field] || '')
          }
        }
      }
      
      // Recalculate derived fields
      const { calculateShiftClose } = await import('@/lib/calculations')
      const calculated = calculateShiftClose({
        ...existingShift,
        ...updateData,
        deposits: typeof updateData.deposits === 'string' ? JSON.parse(updateData.deposits) : updateData.deposits || []
      } as any)
      updateData.overShortCash = calculated.overShortCash
      updateData.overShortTotal = calculated.overShortTotal
      updateData.totalDeposits = calculated.totalDeposits
    } else {
      // For closed shifts, track changes and allow editing
      const validFields = [
        'supervisor', 'supervisorId',
        'systemCash', 'systemChecks', 'systemCredit', 'systemDebit', 'otherCredit',
        'systemInhouse', 'systemFleet', 'systemMassyCoupons',
        'countCash', 'countChecks', 'countCredit', 'countInhouse', 'countFleet', 'countMassyCoupons',
        'unleaded', 'diesel', 'deposits', 'notes',
        'overShortExplanation'
      ]
      
      for (const field of validFields) {
        if (field in body) {
          const oldValue = existingShift[field as keyof typeof existingShift]
          let newValue: any
          
          if (field === 'deposits') {
            newValue = typeof body.deposits === 'string' ? body.deposits : JSON.stringify(body.deposits)
            updateData.deposits = newValue
            const oldDeposits = typeof oldValue === 'string' ? oldValue : JSON.stringify(oldValue || [])
            if (oldDeposits !== newValue) {
              changes.push({ field, oldValue: oldDeposits, newValue })
            }
          } else if (['systemCash', 'systemChecks', 'systemCredit', 'systemDebit', 'otherCredit', 
                       'systemInhouse', 'systemFleet', 'systemMassyCoupons',
                       'countCash', 'countChecks', 'countCredit', 'countInhouse', 'countFleet', 'countMassyCoupons',
                       'unleaded', 'diesel'].includes(field)) {
            newValue = Number(body[field]) || 0
            updateData[field] = newValue
            const oldNum = Number(oldValue) || 0
            if (oldNum !== newValue) {
              changes.push({ field, oldValue: String(oldNum), newValue: String(newValue) })
            }
          } else {
            newValue = String(body[field] || '')
            if (field === 'supervisorId') {
              updateData.supervisorId = newValue || null
              const oldId = String(oldValue || '')
              if (oldId !== String(newValue || '')) {
                changes.push({ field, oldValue: oldId, newValue: String(newValue || '') })
              }
            } else {
              updateData[field] = newValue
              const oldStr = String(oldValue || '')
              if (oldStr !== newValue) {
                changes.push({ field, oldValue: oldStr, newValue })
              }
            }
          }
        }
      }
      
      // Track note history separately - only if notes actually changed
      // IMPORTANT: Only create history when notes are explicitly being updated (not on every field change)
      if ('notes' in body && !isDraft) {
        // Only create history for closed shifts (not drafts)
        const oldNotes = String(existingShift.notes || '').trim()
        const newNotes = String(body.notes || '').trim()
        
        // Only create history entry if notes actually changed (not just whitespace)
        if (oldNotes !== newNotes) {
          // Check if the most recent history entry already has this newNote value
          // This prevents duplicate entries if the API is called multiple times
          const recentHistory = await prisma.noteHistory.findFirst({
            where: { shiftId: id },
            orderBy: { createdAt: 'desc' }
          })
          
          // Only create if this is a new change (not a duplicate of the most recent entry)
          if (!recentHistory || recentHistory.newNote.trim() !== newNotes) {
            await prisma.noteHistory.create({
              data: {
                shiftId: id,
                oldNote: existingShift.notes || '',
                newNote: String(body.notes || ''),
                changedBy
              }
            })
          }
        }
      }
      
      // Recalculate derived fields only if we're updating fields that affect them
      // Don't recalculate if we're only updating checkboxes/status
      const fieldsThatAffectCalculations = ['systemCash', 'systemChecks', 'countCash', 'countChecks', 
                                            'systemCredit', 'countCredit', 'systemInhouse', 'countInhouse',
                                            'systemFleet', 'countFleet', 'systemMassyCoupons', 'countMassyCoupons',
                                            'systemDebit', 'otherCredit', 'deposits']
      const isUpdatingCalculationFields = Object.keys(updateData).some(key => fieldsThatAffectCalculations.includes(key))
      
      if (isUpdatingCalculationFields) {
        const { calculateShiftClose } = await import('@/lib/calculations')
        // Use existing deposits if not being updated
        const depositsForCalc = 'deposits' in updateData 
          ? (typeof updateData.deposits === 'string' ? JSON.parse(updateData.deposits) : updateData.deposits || [])
          : (typeof existingShift.deposits === 'string' ? JSON.parse(existingShift.deposits || '[]') : existingShift.deposits || [])
        
        const calculated = calculateShiftClose({
          ...existingShift,
          ...updateData,
          deposits: depositsForCalc
        } as any)
        updateData.overShortCash = calculated.overShortCash
        updateData.overShortTotal = calculated.overShortTotal
        updateData.totalDeposits = calculated.totalDeposits
      }
    }
    
    // Create correction records for all changes (except notes, which are tracked separately)
    if (changes.length > 0 && !isDraft) {
      await Promise.all(
        changes
          .filter(c => c.field !== 'notes') // Notes are tracked in NoteHistory
          .map(change =>
            prisma.correction.create({
              data: {
                shiftId: id,
                field: change.field,
                oldValue: change.oldValue,
                newValue: change.newValue,
                reason: null, // Optional reason field
                changedBy
              }
            })
          )
      )
    }
    
    const shift = await prisma.shiftClose.update({
      where: { id },
      data: updateData,
      include: {
        corrections: {
          orderBy: { createdAt: 'desc' }
        },
        noteHistory: {
          orderBy: { createdAt: 'desc' }
        }
      }
    })
    
    // Recalculate totalDeposits from deposits field if it's 0 or null (for display)
    let recalculatedTotalDeposits = shift.totalDeposits
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
    
    return NextResponse.json({
      ...shift,
      totalDeposits: recalculatedTotalDeposits
    })
  } catch (error) {
    console.error('Error updating shift:', error)
    return NextResponse.json({ error: 'Failed to update shift' }, { status: 500 })
  }
}
