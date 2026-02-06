import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST() {
  try {
    // Get all shifts
    const shifts = await prisma.shiftClose.findMany()
    
    let fixed = 0
    let errors = 0
    
    for (const shift of shifts) {
      try {
        // Parse deposits
        const depositsArray = typeof shift.deposits === 'string' 
          ? JSON.parse(shift.deposits || '[]') 
          : (Array.isArray(shift.deposits) ? shift.deposits : [])
        
        // Calculate total from deposits
        const totalDeposits = depositsArray
          .filter((d: any) => d !== null && d !== undefined && !Number.isNaN(d) && d > 0)
          .reduce((sum: number, d: number) => sum + (Number(d) || 0), 0)
        
        // Only update if totalDeposits is different (and deposits exist)
        if (totalDeposits > 0 && shift.totalDeposits !== totalDeposits) {
          await prisma.shiftClose.update({
            where: { id: shift.id },
            data: { totalDeposits }
          })
          fixed++
        }
      } catch (err) {
        console.error(`Error fixing deposits for shift ${shift.id}:`, err)
        errors++
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      fixed, 
      errors,
      total: shifts.length 
    })
  } catch (error) {
    console.error('Error fixing deposits:', error)
    return NextResponse.json({ error: 'Failed to fix deposits' }, { status: 500 })
  }
}

