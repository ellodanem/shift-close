import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  fetchResponses,
  fetchResponsePdf,
  parseApplicantFromResponse
} from '@/lib/deftform'

export const dynamic = 'force-dynamic'

export async function POST() {
  const token = process.env.DEFTFORM_ACCESS_TOKEN
  const formId = process.env.DEFTFORM_FORM_ID

  if (!token) {
    return NextResponse.json(
      { error: 'DEFTFORM_ACCESS_TOKEN is not set in environment' },
      { status: 400 }
    )
  }
  if (!formId) {
    return NextResponse.json(
      { error: 'DEFTFORM_FORM_ID is not set in environment' },
      { status: 400 }
    )
  }

  try {
    const responses = await fetchResponses(formId)
    const existing = await prisma.applicantApplication.findMany({
      where: { deftformResponseId: { not: null } },
      select: { deftformResponseId: true }
    })
    const existingIds = new Set(
      existing.map((a) => a.deftformResponseId).filter(Boolean) as string[]
    )

    let form = await prisma.applicantForm.findFirst({
      where: { deftformFormId: formId }
    })
    if (!form) {
      form = await prisma.applicantForm.create({
        data: {
          name: `Deftform (${formId})`,
          slug: `deftform-${formId.toLowerCase()}`,
          deftformFormId: formId,
          position: 'Applicant',
          introText: '',
          fields: '[]',
          confirmationText: '',
          confirmationBullets: '[]',
          updatedAt: new Date()
        }
      })
    }

    let imported = 0
    const errors: string[] = []

    for (const r of responses) {
      if (existingIds.has(r.id)) continue

      try {
        const { name, email, formData } = parseApplicantFromResponse(r)
        const pdfUrl = await fetchResponsePdf(r.id)

        await prisma.applicantApplication.create({
          data: {
            formId: form.id,
            deftformResponseId: r.id,
            applicantName: name,
            applicantEmail: email,
            pdfUrl,
            formData: JSON.stringify(formData),
            status: 'new',
            submittedAt: r.created_at ? new Date(r.created_at) : new Date()
          }
        })
        imported++
        existingIds.add(r.id)
      } catch (err) {
        errors.push(`${r.id}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      total: responses.length,
      skipped: responses.length - imported - errors.length,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error) {
    console.error('Deftform sync error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to sync from Deftform'
      },
      { status: 500 }
    )
  }
}
