import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  fetchForms,
  fetchResponses,
  fetchResponsesRaw,
  fetchResponsePdf,
  getResponseId,
  getResponseUuidForPdf,
  parseApplicantFromResponse
} from '@/lib/deftform'

export const dynamic = 'force-dynamic'

/** GET: Diagnostic info to verify Deftform config (forms list, response count, optional raw sample) */
export async function GET(request: Request) {
  const token = process.env.DEFTFORM_ACCESS_TOKEN
  const formId = process.env.DEFTFORM_FORM_ID
  const { searchParams } = new URL(request.url)
  const showSample = searchParams.get('sample') === '1'

  if (!token) {
    return NextResponse.json(
      { error: 'DEFTFORM_ACCESS_TOKEN is not set', forms: null },
      { status: 400 }
    )
  }

  try {
    const forms = await fetchForms()
    let responseCount: number | null = null
    let sampleResponse: unknown = null
    if (formId) {
      const responses = await fetchResponses(formId)
      responseCount = responses.length
      if (showSample) {
        const raw = await fetchResponsesRaw(formId)
        sampleResponse = { parsedFirst: responses[0] ?? null, rawApiResponse: raw }
      }
    }
    return NextResponse.json({
      configuredFormId: formId || null,
      forms: forms.map((f) => ({ id: f.id, name: f.name })),
      responseCount,
      sampleResponse
    })
  } catch (error) {
    console.error('Deftform diagnostic error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to connect to Deftform', forms: null },
      { status: 500 }
    )
  }
}

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

    for (let i = 0; i < responses.length; i++) {
      const r = responses[i]
      const responseId = getResponseId(r)
      // Fallback for dedup when API returns number but not UUID (e.g. older format)
      const dedupId = responseId ?? (typeof (r as Record<string, unknown>).number === 'number'
        ? `${formId}-${(r as Record<string, unknown>).number}`
        : `${formId}-idx-${i}`)
      if (!responseId && !(r as Record<string, unknown>).number) {
        const keys = typeof r === 'object' && r !== null ? Object.keys(r as object).join(',') : 'non-object'
        errors.push(`[${i}] No id/uuid/number (keys: ${keys})`)
        continue
      }
      if (existingIds.has(dedupId)) continue

      try {
        const { name, email, formData } = parseApplicantFromResponse(r)
        const pdfUuid = getResponseUuidForPdf(r)
        let pdfUrl: string
        if (pdfUuid) {
          try {
            pdfUrl = await fetchResponsePdf(pdfUuid)
          } catch (pdfErr) {
            pdfUrl = 'https://deftform.com'
            errors.push(`${dedupId}: PDF unavailable (${pdfErr instanceof Error ? pdfErr.message : 'unknown'})`)
          }
        } else {
          pdfUrl = 'https://deftform.com'
          if (responseId) {
            errors.push(`${dedupId}: No valid UUID for PDF (id=${responseId})`)
          }
        }

        await prisma.applicantApplication.create({
          data: {
            formId: form.id,
            deftformResponseId: dedupId,
            applicantName: name,
            applicantEmail: email,
            pdfUrl,
            formData: JSON.stringify(formData),
            status: 'new',
            submittedAt: r.created_at ? new Date(r.created_at) : new Date()
          }
        })
        imported++
        existingIds.add(dedupId)
      } catch (err) {
        const id = dedupId ?? `[${i}]`
        errors.push(`${id}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      total: responses.length,
      skipped: responses.length - imported - errors.length,
      errors: errors.length > 0 ? errors.slice(0, 15) : undefined,
      errorCount: errors.length
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
