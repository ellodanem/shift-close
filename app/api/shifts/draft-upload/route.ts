import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const type = formData.get('type') as string // 'deposit' or 'debit'
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    
    if (!type || (type !== 'deposit' && type !== 'debit')) {
      return NextResponse.json({ error: 'Invalid type. Must be "deposit" or "debit"' }, { status: 400 })
    }
    
    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Must be JPEG, PNG, or PDF' }, { status: 400 })
    }
    
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 10MB' }, { status: 400 })
    }
    
    // Store in temp/draft directory
    const tempDir = join(process.cwd(), 'public', 'uploads', 'draft')
    if (!existsSync(tempDir)) {
      await mkdir(tempDir, { recursive: true })
    }
    
    const timestamp = Date.now()
    const extension = file.name.split('.').pop()
    const filename = `${type}-${timestamp}.${extension}`
    const filepath = join(tempDir, filename)
    
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filepath, buffer)
    
    const url = `/uploads/draft/${filename}`
    
    return NextResponse.json({ success: true, url, filename })
  } catch (error) {
    console.error('Error uploading draft file:', error)
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
  }
}

