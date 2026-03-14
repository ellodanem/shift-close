import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deriveNameFromFormData, fetchResponsePdf, isValidDeftformUuid } from '@/lib/deftform'

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

    // Refresh expired Deftform PDF URLs when we have a valid UUID
    let pdfUrl = application.pdfUrl
    if (isValidDeftformUuid(application.deftformResponseId)) {
      try {
        const freshUrl = await fetchResponsePdf(application.deftformResponseId!)
        if (freshUrl) {
          pdfUrl = freshUrl
          await prisma.applicantApplication.update({
            where: { id },
            data: { pdfUrl: freshUrl }
          })
        }
      } catch {
        // Use stored URL if refresh fails (e.g. token not set, API error)
      }
    }

    const displayName = (application.applicantName === 'Unknown' && application.formData)
      ? (deriveNameFromFormData(application.formData) ?? application.applicantName)
      : application.applicantName

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

    return NextResponse.json({
      ...application,
      applicantName: displayName,
      pdfUrl,
      applicationCount: count
    })
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
