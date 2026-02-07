import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { put, del } from '@vercel/blob'
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
    
    // Vercel serverless: request body limit ~4.5MB; larger files may fail
    if (file.size > 4.5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Max 4.5 MB for uploads on Vercel.' }, { status: 400 })
    }
    
    // Find all shifts for this date
    const shifts = await prisma.shiftClose.findMany({
      where: { date }
    })
    
    if (shifts.length === 0) {
      return NextResponse.json({ error: 'No shifts found for this date' }, { status: 404 })
    }
    
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(7)
    const extension = file.name.split('.').pop() || 'bin'
    const filename = `${type}-${timestamp}-${random}.${extension}`
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    
    let url: string
    
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      // Production (Vercel): store in Blob
      const blob = await put(`days/${date}/${filename}`, buffer, { access: 'public' })
      url = blob.url
    } else {
      // Local: store on disk
      const dayUploadsDir = join(process.cwd(), 'public', 'uploads', 'days', date)
      if (!existsSync(dayUploadsDir)) {
        await mkdir(dayUploadsDir, { recursive: true })
      }
      const filepath = join(dayUploadsDir, filename)
      await writeFile(filepath, buffer)
      url = `/uploads/days/${date}/${filename}`
    }
    
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
  } catch (error: any) {
    console.error('Error uploading day file:', error)
    const isVercel = process.env.VERCEL === '1'
    const noBlob = isVercel && !process.env.BLOB_READ_WRITE_TOKEN
    const message = noBlob
      ? 'Uploads on Vercel require Blob storage. Add BLOB_READ_WRITE_TOKEN in Vercel project settings (Storage).'
      : (error?.message || 'Failed to upload file')
    return NextResponse.json({ error: message }, { status: 500 })
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

    // Best-effort physical file delete (Blob or local disk)
    try {
      if (url.startsWith('http')) {
        await del(url)
      } else {
        const filePath = join(process.cwd(), 'public', url.replace(/^\/+/, ''))
        if (existsSync(filePath)) {
          await unlink(filePath)
        }
      }
    } catch {
      // Ignore file system / Blob delete errors
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting day file:', error)
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 })
  }
}

