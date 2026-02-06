import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir, unlink } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const { date } = await params
    const formData = await request.formData()
    const file = formData.get('file') as File
    const type = formData.get('type') as string // 'deposit' or 'debit'
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    
    if (!type || (type !== 'deposit' && type !== 'debit')) {
      return NextResponse.json({ error: 'Invalid type. Must be "deposit" or "debit"' }, { status: 400 })
    }
    
    // Find all shifts for this date
    const shifts = await prisma.shiftClose.findMany({
      where: { date }
    })
    
    if (shifts.length === 0) {
      return NextResponse.json({ error: 'No shifts found for this date' }, { status: 404 })
    }
    
    // Use the first shift's ID to create a common upload directory
    // We'll store files in a day-specific directory structure
    const dayUploadsDir = join(process.cwd(), 'public', 'uploads', 'days', date)
    if (!existsSync(dayUploadsDir)) {
      await mkdir(dayUploadsDir, { recursive: true })
    }
    
    // Generate unique filename
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(7)
    const extension = file.name.split('.').pop()
    const filename = `${type}-${timestamp}-${random}.${extension}`
    const filepath = join(dayUploadsDir, filename)
    
    // Save file
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filepath, buffer)
    
    // Generate URL path
    const url = `/uploads/days/${date}/${filename}`
    
    // Add this URL to all shifts for this date
    const updatePromises = shifts.map(async (shift) => {
      let currentUrls: string[] = []
      try {
        currentUrls = type === 'deposit'
          ? (shift.depositScanUrls ? JSON.parse(shift.depositScanUrls) : [])
          : (shift.debitScanUrls ? JSON.parse(shift.debitScanUrls) : [])
      } catch {
        // If existing JSON is invalid, start fresh for this shift
        currentUrls = []
      }
      
      // Check if URL already exists (avoid duplicates)
      if (!currentUrls.includes(url)) {
        const updatedUrls = [...currentUrls, url]
        
        const updateData = type === 'deposit'
          ? { depositScanUrls: JSON.stringify(updatedUrls) }
          : { debitScanUrls: JSON.stringify(updatedUrls) }
        
        await prisma.shiftClose.update({
          where: { id: shift.id },
          data: updateData
        })
      }
    })
    
    await Promise.all(updatePromises)
    
    return NextResponse.json({ success: true, url })
  } catch (error) {
    console.error('Error uploading day file:', error)
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const { date } = await params
    const { url, type } = await request.json()

    if (!url || (type !== 'deposit' && type !== 'debit')) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    // Find all shifts for this date
    const shifts = await prisma.shiftClose.findMany({
      where: { date }
    })

    if (shifts.length === 0) {
      return NextResponse.json({ error: 'No shifts found for this date' }, { status: 404 })
    }

    // Remove URL from all shifts for this date
    await Promise.all(
      shifts.map(async (shift) => {
        const currentUrls = type === 'deposit'
          ? (shift.depositScanUrls ? JSON.parse(shift.depositScanUrls) : [])
          : (shift.debitScanUrls ? JSON.parse(shift.debitScanUrls) : [])

        if (!Array.isArray(currentUrls) || !currentUrls.includes(url)) return

        const updatedUrls = currentUrls.filter((u: string) => u !== url)
        const updateData =
          type === 'deposit'
            ? { depositScanUrls: JSON.stringify(updatedUrls) }
            : { debitScanUrls: JSON.stringify(updatedUrls) }

        await prisma.shiftClose.update({
          where: { id: shift.id },
          data: updateData
        })
      })
    )

    // Best-effort physical file delete
    try {
      const filePath = join(process.cwd(), 'public', url.replace(/^\/+/, ''))
      if (existsSync(filePath)) {
        await unlink(filePath)
      }
    } catch {
      // Ignore file system delete errors
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting day file:', error)
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 })
  }
}

