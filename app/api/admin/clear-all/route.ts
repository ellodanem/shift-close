// TEMPORARY: Remove before production
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { readdir, rm } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export async function DELETE(request: NextRequest) {
  try {
    // Step 1: Delete all Corrections first (due to foreign key constraint)
    await prisma.correction.deleteMany({})
    
    // Step 2: Delete all ShiftClose records
    await prisma.shiftClose.deleteMany({})
    
    // Step 3: Clean up uploaded files
    const uploadsDir = join(process.cwd(), 'public', 'uploads')
    if (existsSync(uploadsDir)) {
      try {
        const entries = await readdir(uploadsDir, { withFileTypes: true })
        
        for (const entry of entries) {
          const fullPath = join(uploadsDir, entry.name)
          
          // Skip .gitkeep file
          if (entry.name === '.gitkeep') {
            continue
          }
          
          if (entry.isDirectory()) {
            // Delete entire directory (draft, days, shift IDs, etc.)
            await rm(fullPath, { recursive: true, force: true })
          } else {
            // Delete individual files
            await rm(fullPath, { force: true })
          }
        }
      } catch (error) {
        console.error('Error cleaning up upload files:', error)
        // Don't fail the request if file cleanup fails
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'All data has been cleared successfully' 
    })
  } catch (error) {
    console.error('Error clearing all data:', error)
    return NextResponse.json(
      { error: 'Failed to clear all data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

