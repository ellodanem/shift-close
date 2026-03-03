import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const application = await prisma.applicantApplication.findUnique({
      where: { id },
      include: {
        form: { select: { id: true, name: true, slug: true, position: true } }
      }
    })
    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    const count = application.applicantEmail
      ? await prisma.applicantApplication.count({
          where: {
            applicantEmail: { equals: application.applicantEmail.trim(), mode: 'insensitive' }
          }
        })
      : await prisma.applicantApplication.count({
          where: {
            applicantEmail: null,
            applicantName: { equals: application.applicantName.trim(), mode: 'insensitive' }
          }
        })

    return NextResponse.json({ ...application, applicationCount: count })
  } catch (error) {
    console.error('Error fetching application:', error)
    return NextResponse.json({ error: 'Failed to fetch application' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const {
      status,
      viewedAt,
      printedAt,
      contactedAt,
      notes
    } = body as {
      status?: string
      viewedAt?: string | null
      printedAt?: string | null
      contactedAt?: string | null
      notes?: string | null
    }

    const validStatuses = ['new', 'viewed', 'printed', 'contacted', 'not_qualified', 'interview_set', 'no_show', 'hired']
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {}
    if (status !== undefined) updateData.status = status
    if (viewedAt !== undefined) updateData.viewedAt = viewedAt ? new Date(viewedAt) : null
    if (printedAt !== undefined) updateData.printedAt = printedAt ? new Date(printedAt) : null
    if (contactedAt !== undefined) updateData.contactedAt = contactedAt ? new Date(contactedAt) : null
    if (notes !== undefined) updateData.notes = notes

    const application = await prisma.applicantApplication.update({
      where: { id },
      data: updateData,
      include: {
        form: { select: { id: true, name: true, slug: true, position: true } }
      }
    })

    return NextResponse.json(application)
  } catch (error) {
    console.error('Error updating application:', error)
    return NextResponse.json({ error: 'Failed to update application' }, { status: 500 })
  }
}
