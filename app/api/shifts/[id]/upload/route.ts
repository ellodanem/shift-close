import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const formData = await request.formData()
    const file = formData.get('file') as File
    const type = formData.get('type') as string // 'deposit' or 'debit'
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    
    if (!type || (type !== 'deposit' && type !== 'debit')) {
      return NextResponse.json({ error: 'Invalid type. Must be "deposit" or "debit"' }, { status: 400 })
    }
    
    // Verify shift exists
    const shift = await prisma.shiftClose.findUnique({
      where: { id }
    })
    
    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
    }
    
    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), 'public', 'uploads', id)
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true })
    }
    
    // Generate unique filename
    const timestamp = Date.now()
    const extension = file.name.split('.').pop()
    const filename = `${type}-${timestamp}.${extension}`
    const filepath = join(uploadsDir, filename)
    
    // Save file
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filepath, buffer)
    
    // Generate URL path
    const url = `/uploads/${id}/${filename}`
    
    // Get current URLs and add new one
    const currentUrls = type === 'deposit' 
      ? (shift.depositScanUrls ? JSON.parse(shift.depositScanUrls) : [])
      : (shift.debitScanUrls ? JSON.parse(shift.debitScanUrls) : [])
    
    const updatedUrls = [...currentUrls, url]
    
    // Update shift with file URLs array
    const updateData = type === 'deposit' 
      ? { depositScanUrls: JSON.stringify(updatedUrls) }
      : { debitScanUrls: JSON.stringify(updatedUrls) }
    
    const updatedShift = await prisma.shiftClose.update({
      where: { id },
      data: updateData
    })
    
    return NextResponse.json({ 
      success: true, 
      url,
      shift: updatedShift
    })
  } catch (error) {
    console.error('Error uploading file:', error)
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
  }
}

