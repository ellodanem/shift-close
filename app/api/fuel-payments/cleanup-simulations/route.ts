import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// DELETE old simulations (older than 24 hours)
// This should be called periodically (cron job or scheduled task)
export async function DELETE() {
  try {
    const twentyFourHoursAgo = new Date()
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24)

    // Delete old simulations (invoices remain pending - no status change needed)
    const result = await prisma.paymentSimulation.deleteMany({
      where: {
        createdAt: {
          lt: twentyFourHoursAgo
        }
      }
    })

    return NextResponse.json({
      success: true,
      deleted: result.count
    })
  } catch (error) {
    console.error('Error cleaning up simulations:', error)
    return NextResponse.json(
      { error: 'Failed to cleanup simulations' },
      { status: 500 }
    )
  }
}

