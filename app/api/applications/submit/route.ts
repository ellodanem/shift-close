import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { put } from '@vercel/blob'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { jsPDF } from 'jspdf'

export const dynamic = 'force-dynamic'

function normalizeKey(str: string): string {
  return str
    .replace(/\s+/g, ' ')
    .replace(/^[a-z]/, (c) => c.toUpperCase())
    .trim()
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const formId = formData.get('formId') as string
    const formDataJson = formData.get('formData') as string
    const resumeFile = formData.get('resume') as File | null

    if (!formId || !formDataJson) {
      return NextResponse.json(
        { error: 'formId and formData are required' },
        { status: 400 }
      )
    }

    const data = JSON.parse(formDataJson) as Record<string, string>
    const applicantName = [data.firstName, data.lastName].filter(Boolean).join(' ').trim()
    || data.applicantName || data.name || 'Unknown'
    const applicantEmail = (data.email || data.applicantEmail || '').trim() || null

    if (!applicantName) {
      return NextResponse.json(
        { error: 'Applicant name is required' },
        { status: 400 }
      )
    }

    const form = await prisma.applicantForm.findUnique({
      where: { id: formId }
    })
    if (!form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    }

    // Generate PDF from form data
    const doc = new jsPDF()
    doc.setFontSize(18)
    doc.text(form.name, 20, 20)
    doc.setFontSize(10)
    doc.text(`Submitted: ${new Date().toLocaleString()}`, 20, 28)
    doc.text('', 20, 36)

    let y = 36
    const fields = JSON.parse(form.fields) as Array<{ name: string; label: string }>
    for (const field of fields) {
      const value = data[field.name] || ''
      if (value) {
        const label = field.label || normalizeKey(field.name)
        doc.setFont('helvetica', 'bold')
        doc.text(`${label}:`, 20, y)
        doc.setFont('helvetica', 'normal')
        const lines = doc.splitTextToSize(String(value), 170)
        doc.text(lines, 30, y + 4)
        y += 4 + lines.length * 5 + 4
      }
    }

    if (data.coverLetter) {
      y += 6
      doc.setFont('helvetica', 'bold')
      doc.text('Cover Letter:', 20, y)
      doc.setFont('helvetica', 'normal')
      y += 4
      const lines = doc.splitTextToSize(String(data.coverLetter), 170)
      doc.text(lines, 20, y)
      y += lines.length * 5 + 6
    }

    if (resumeFile && resumeFile.size > 0) {
      doc.setFont('helvetica', 'bold')
      doc.text('(CV/Resume attached separately)', 20, y)
      y += 6
    }

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))

    let pdfUrl: string
    let resumeUrl: string | null = null

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const ts = Date.now()
      const pdfBlob = await put(`applications/${formId}/${ts}-application.pdf`, pdfBuffer, {
        access: 'public',
        contentType: 'application/pdf'
      })
      pdfUrl = pdfBlob.url

      if (resumeFile && resumeFile.size > 0 && resumeFile.size < 10 * 1024 * 1024) {
        const resBytes = await resumeFile.arrayBuffer()
        const resBuffer = Buffer.from(resBytes)
        const ext = resumeFile.name.split('.').pop() || 'pdf'
        const resBlob = await put(`applications/${formId}/${ts}-resume.${ext}`, resBuffer, {
          access: 'public',
          contentType: resumeFile.type || 'application/octet-stream'
        })
        resumeUrl = resBlob.url
      }
    } else {
      const uploadsDir = join(process.cwd(), 'public', 'uploads', 'applications', formId)
      if (!existsSync(uploadsDir)) {
        await mkdir(uploadsDir, { recursive: true })
      }
      const ts = Date.now()
      const pdfPath = join(uploadsDir, `${ts}-application.pdf`)
      await writeFile(pdfPath, pdfBuffer)
      pdfUrl = `/uploads/applications/${formId}/${ts}-application.pdf`

      if (resumeFile && resumeFile.size > 0 && resumeFile.size < 10 * 1024 * 1024) {
        const resBytes = await resumeFile.arrayBuffer()
        const resBuffer = Buffer.from(resBytes)
        const ext = resumeFile.name.split('.').pop() || 'pdf'
        const resPath = join(uploadsDir, `${ts}-resume.${ext}`)
        await writeFile(resPath, resBuffer)
        resumeUrl = `/uploads/applications/${formId}/${ts}-resume.${ext}`
      }
    }

    const application = await prisma.applicantApplication.create({
      data: {
        formId,
        applicantName,
        applicantEmail,
        pdfUrl,
        resumeUrl,
        formData: formDataJson,
        status: 'new'
      }
    })

    return NextResponse.json({
      success: true,
      id: application.id,
      message: 'Application submitted successfully'
    })
  } catch (error) {
    console.error('Error submitting application:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to submit application' },
      { status: 500 }
    )
  }
}
