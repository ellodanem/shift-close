import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deriveNameFromFormData } from '@/lib/deftform'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const formId = searchParams.get('formId')

    const applications = await prisma.applicantApplication.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(formId ? { formId } : {})
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
