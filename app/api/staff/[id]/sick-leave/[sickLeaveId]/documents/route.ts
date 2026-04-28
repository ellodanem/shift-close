import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deleteStaffDocumentFile, saveStaffDocumentFile } from '@/lib/staff-document-storage'

export const dynamic = 'force-dynamic'

const VALID_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']
const MAX_SIZE_BYTES = 10 * 1024 * 1024

async function ensureSickLeaveBelongsToStaff(staffId: string, sickLeaveId: string) {
  return prisma.staffSickLeave.findFirst({
    where: { id: sickLeaveId, staffId },
    select: { id: true }
  })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sickLeaveId: string }> }
) {
  try {
    const { id, sickLeaveId } = await params
    const sickLeave = await ensureSickLeaveBelongsToStaff(id, sickLeaveId)
    if (!sickLeave) {
      return NextResponse.json({ error: 'Sick leave record not found' }, { status: 404 })
    }

    const documents = await prisma.staffDocument.findMany({
      where: { staffId: id, sickLeaveId, type: 'sick-leave' },
      orderBy: { uploadedAt: 'desc' }
    })

    return NextResponse.json(documents)
  } catch (error) {
    console.error('Error fetching sick leave documents:', error)
    return NextResponse.json({ error: 'Failed to fetch sick leave documents' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sickLeaveId: string }> }
) {
  try {
    const { id, sickLeaveId } = await params
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!VALID_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Must be JPEG, PNG, or PDF' }, { status: 400 })
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'File size must be less than 10MB' }, { status: 400 })
    }

    const sickLeave = await ensureSickLeaveBelongsToStaff(id, sickLeaveId)
    if (!sickLeave) {
      return NextResponse.json({ error: 'Sick leave record not found' }, { status: 404 })
    }

    const url = await saveStaffDocumentFile({
      staffId: id,
      file,
      type: 'sick-leave',
      sickLeaveId
    })
    const document = await prisma.staffDocument.create({
      data: {
        staffId: id,
        sickLeaveId,
        type: 'sick-leave',
        fileName: file.name,
        fileUrl: url
      }
    })

    return NextResponse.json(document, { status: 201 })
  } catch (error) {
    console.error('Error uploading sick leave document:', error)
    return NextResponse.json({ error: 'Failed to upload sick leave document' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sickLeaveId: string }> }
) {
  try {
    const { id, sickLeaveId } = await params
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('documentId')

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }

    const document = await prisma.staffDocument.findFirst({
      where: { id: documentId, staffId: id, sickLeaveId, type: 'sick-leave' },
      select: { id: true, fileUrl: true }
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    try {
      await deleteStaffDocumentFile(document.fileUrl)
    } catch (fileError) {
      console.error('Error deleting sick leave file:', fileError)
    }

    await prisma.staffDocument.delete({ where: { id: document.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting sick leave document:', error)
    return NextResponse.json({ error: 'Failed to delete sick leave document' }, { status: 500 })
  }
}
