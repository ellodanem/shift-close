'use client'

import { JOB_LETTER_COMPANY, jobLetterBodyText, jobLetterPrintHtml, withJobLetterHead } from '@/lib/job-letter'

function plainPrintHtml(title: string, content: string): string {
  const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; }
    pre { white-space: pre-wrap; font-family: Arial, sans-serif; }
  </style>
</head>
<body><pre>${escaped}</pre></body>
</html>`
}

function openPrint(html: string) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.print()
}

function JobLetterHead() {
  const { name, addressLine, cityLine, phoneLine } = JOB_LETTER_COMPANY
  const serif = { fontFamily: '"Times New Roman", Times, serif' }
  return (
    <header>
      <div className="text-center text-gray-900" style={serif}>
        <div className="text-[32px] font-bold leading-tight">{name}</div>
        <div className="mt-1 text-[15px] italic leading-snug">{addressLine}</div>
        <div className="text-[15px] italic leading-snug">{cityLine}</div>
        <div className="text-[15px] italic leading-snug">{phoneLine}</div>
      </div>
      <hr className="mb-4 mt-3 border-0 border-t-2 border-black" />
    </header>
  )
}

export default function GeneratedDocumentDialog({
  title,
  templateType,
  content,
  onChange,
  onClose
}: {
  title: string
  templateType: string
  content: string
  onChange: (content: string) => void
  onClose: () => void
}) {
  const jobLetter = templateType === 'job-letter'
  const body = jobLetter ? jobLetterBodyText(content) : content

  const handlePrint = () => {
    if (jobLetter) {
      openPrint(jobLetterPrintHtml(title, body))
      return
    }
    openPrint(plainPrintHtml(title, content))
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700" type="button">
            ✕
          </button>
        </div>
        {jobLetter ? (
          <div className="rounded border border-gray-300 bg-white px-8 py-6 shadow-sm">
            <JobLetterHead />
            <textarea
              value={body}
              onChange={(e) => onChange(withJobLetterHead(e.target.value))}
              rows={16}
              aria-label="Job letter"
              className="w-full resize-y border-0 bg-transparent p-0 text-[15px] leading-relaxed text-gray-900 focus:outline-none focus:ring-0"
              style={{ fontFamily: '"Times New Roman", Times, serif' }}
            />
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => onChange(e.target.value)}
            rows={20}
            className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}
        <div className="flex gap-3 justify-end mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded font-semibold hover:bg-gray-300"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
          >
            Print / Save as PDF
          </button>
        </div>
      </div>
    </div>
  )
}
