import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deleteStaffDocumentFile } from '@/lib/staff-document-storage'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const documents = await prisma.staffDocument.findMany({
      where: { sickLeaveId: id, type: 'sick-leave' },
      select: { id: true, fileUrl: true }
    })

    for (const document of documents) {
      try {
        await deleteStaffDocumentFile(document.fileUrl)
      } catch (fileError) {
        console.error('Error deleting sick leave file:', fileError)
      }
    }

    if (documents.length > 0) {
      await prisma.staffDocument.deleteMany({
        where: { sickLeaveId: id, type: 'sick-leave' }
      })
    }

    await prisma.staffSickLeave.delete({
      where: { id }
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting sick leave record:', error)
    return NextResponse.json(
      { error: 'Failed to delete sick leave record' },
      { status: 500 }
    )
  }
}
