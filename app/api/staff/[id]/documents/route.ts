import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir, unlink } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

// GET - List all documents for a staff member
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const documents = await prisma.staffDocument.findMany({
      where: { staffId: params.id },
      orderBy: { uploadedAt: 'desc' }
    })
    return NextResponse.json(documents)
  } catch (error) {
    console.error('Error fetching staff documents:', error)
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
  }
}

// POST - Upload a document for a staff member
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const formData = await request.formData()
    const file = formData.get('file') as File
    const type = formData.get('type') as string // 'sick-leave', 'contract', 'id', 'other'
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    
    if (!type) {
      return NextResponse.json({ error: 'Document type is required' }, { status: 400 })
    }
    
    // Verify staff exists
    const staff = await prisma.staff.findUnique({
      where: { id }
    })
    
    if (!staff) {
      return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
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
    
    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), 'public', 'uploads', 'staff', id)
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
    const url = `/uploads/staff/${id}/${filename}`
    
    // Create document record
    const document = await prisma.staffDocument.create({
      data: {
        staffId: id,
        type,
        fileName: file.name,
        fileUrl: url
      }
    })
    
    return NextResponse.json(document, { status: 201 })
  } catch (error) {
    console.error('Error uploading staff document:', error)
    return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 })
  }
}

// DELETE - Delete a document
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('documentId')
    
    if (!documentId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }
    
    // Get document to find file path
    const document = await prisma.staffDocument.findUnique({
      where: { id: documentId },
      select: { fileUrl: true, staffId: true }
    })
    
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }
    
    // Verify it belongs to this staff member
    if (document.staffId !== params.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
    
    // Delete physical file
    try {
      const filepath = join(process.cwd(), 'public', document.fileUrl)
      if (existsSync(filepath)) {
        await unlink(filepath)
      }
    } catch (fileError) {
      console.error('Error deleting file:', fileError)
      // Continue with DB deletion even if file deletion fails
    }
    
    // Delete database record
    await prisma.staffDocument.delete({
      where: { id: documentId }
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting staff document:', error)
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
  }
}

