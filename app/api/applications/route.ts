import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deriveNameFromFormData } from '@/lib/deftform'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const formId = searchParams.get('formId')
    const archivedParam = searchParams.get('archived')
    const archivedOnly = archivedParam === '1' || archivedParam === 'true'

    const applications = await prisma.applicantApplication.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(formId ? { formId } : {}),
        ...(archivedOnly ? { NOT: { archivedAt: null } } : { archivedAt: null })
      },
      include: {
        form: { select: { id: true, name: true, slug: true, position: true } }
      },
      orderBy: { submittedAt: 'desc' }
    })

    // Use derived name from formData when applicantName is "Unknown"
    const withDisplayName = applications.map((app) => {
      const displayName = (app.applicantName === 'Unknown' && app.formData)
        ? (deriveNameFromFormData(app.formData) ?? app.applicantName)
        : app.applicantName
      return { ...app, applicantName: displayName }
    })

    // Compute application count per person (by email or name)
    const byPerson = new Map<string, number>()
    for (const app of withDisplayName) {
      const key = (app.applicantEmail || '').trim()
        ? app.applicantEmail!.toLowerCase().trim()
        : app.applicantName.toLowerCase().trim()
      byPerson.set(key, (byPerson.get(key) || 0) + 1)
    }

    const withCount = withDisplayName.map((app) => {
      const key = (app.applicantEmail || '').trim()
        ? app.applicantEmail!.toLowerCase().trim()
        : app.applicantName.toLowerCase().trim()
      return {
        ...app,
        applicationCount: byPerson.get(key) || 1
      }
    })

    return NextResponse.json(withCount)
  } catch (error) {
    console.error('Error fetching applications:', error)
    return NextResponse.json({ error: 'Failed to fetch applications' }, { status: 500 })
  }
}

const VALID_STATUSES = ['new', 'viewed', 'printed', 'contacted', 'not_qualified', 'interview_set', 'no_show', 'hired']

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { ids, status, archived } = body as { ids?: unknown; status?: unknown; archived?: unknown }

    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
      return NextResponse.json({ error: 'ids must be a non-empty array of strings' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {}

    if (status !== undefined) {
      if (typeof status !== 'string' || !VALID_STATUSES.includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      const now = new Date()
      updateData.status = status
      if (status === 'viewed') updateData.viewedAt = now
      if (status === 'printed') updateData.printedAt = now
      if (status === 'contacted') updateData.contactedAt = now
    }

    if (archived !== undefined) {
      if (typeof archived !== 'boolean') {
        return NextResponse.json({ error: 'archived must be a boolean' }, { status: 400 })
      }
      updateData.archivedAt = archived ? new Date() : null
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Nothing to update: provide status or archived' }, { status: 400 })
    }

    const result = await prisma.applicantApplication.updateMany({
      where: { id: { in: ids as string[] } },
      data: updateData
    })

    return NextResponse.json({ updated: result.count })
  } catch (error) {
    console.error('Error bulk updating applications:', error)
    return NextResponse.json({ error: 'Failed to update applications' }, { status: 500 })
  }
}
