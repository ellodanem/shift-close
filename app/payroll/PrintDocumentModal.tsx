'use client'

import { useEffect, useRef, useState } from 'react'
import { downloadHtmlPdf, printHtmlDocument } from '@/lib/print-document'

export type PrintDocumentPreview = {
  title: string
  subtitle: string
  html: string
  filename: string
}

export function PrintDocumentModal({
  preview,
  onClose
}: {
  preview: PrintDocumentPreview
  onClose: () => void
}) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [frameHeight, setFrameHeight] = useState(720)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const fitFrame = () => {
    const body = frameRef.current?.contentDocument?.body
    const next = body?.scrollHeight ?? 0
    if (next > 0) setFrameHeight(next)
  }

  const print = () => {
    setError(null)
    if (!printHtmlDocument(preview.html)) setError('Could not open the print dialog.')
  }

  const download = async () => {
    setError(null)
    setDownloading(true)
    try {
      await downloadHtmlPdf(preview.html, preview.filename)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download this preview.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-document-title"
        className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="print-document-title" className="text-lg font-semibold text-slate-900">
              {preview.title}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{preview.subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Close
          </button>
        </div>
        <div className="overflow-auto bg-slate-100 px-6 py-5">
          <iframe
            ref={frameRef}
            title={preview.title}
            srcDoc={preview.html}
            onLoad={fitFrame}
            className="mx-auto block w-[8.5in] max-w-full border-0 bg-white shadow-sm"
            style={{ height: frameHeight }}
          />
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          {error ? <p className="mr-auto text-sm text-red-700">{error}</p> : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={print}
            className="rounded-md border border-violet-700 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50"
          >
            Print
          </button>
          <button
            type="button"
            onClick={() => {
              void download()
            }}
            disabled={downloading}
            className="rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
          >
            {downloading ? 'Preparing…' : 'Download'}
          </button>
        </div>
      </div>
    </div>
  )
}
