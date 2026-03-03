'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface Application {
  id: string
  applicantName: string
  applicantEmail: string | null
  pdfUrl: string
  resumeUrl: string | null
  formData: string
  submittedAt: string
  status: string
  viewedAt: string | null
  printedAt: string | null
  contactedAt: string | null
  notes: string | null
  applicationCount: number
  form: { id: string; name: string; slug: string; position: string }
}

const STATUS_OPTIONS = [
  { value: 'new', label: 'New', icon: '👁‍🗨' },
  { value: 'viewed', label: 'Viewed', icon: '👁' },
  { value: 'printed', label: 'Printed', icon: '🖨' },
  { value: 'contacted', label: 'Contacted', icon: '📞' },
  { value: 'not_qualified', label: 'Not Qualified', icon: '❌' },
  { value: 'interview_set', label: 'Interview Set', icon: '📅' },
  { value: 'no_show', label: 'No Show', icon: '⏸' },
  { value: 'hired', label: 'Hired', icon: '✅' }
]

export default function ApplicationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [app, setApp] = useState<Application | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState('')
  const pdfViewedRef = useRef(false)

  useEffect(() => {
    fetch(`/api/applications/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setApp(data)
        setNotes(data.notes || '')
      })
      .catch(() => setApp(null))
      .finally(() => setLoading(false))
  }, [id])

  const markViewed = () => {
    if (pdfViewedRef.current || !app) return
    pdfViewedRef.current = true
    fetch(`/api/applications/${id}/viewed`, { method: 'POST' })
      .then((res) => res.json())
      .then(() => {
        setApp((a) => (a ? { ...a, viewedAt: new Date().toISOString(), status: a.status === 'new' ? 'viewed' : a.status } : null))
      })
      .catch(() => {})
  }

  const updateStatus = async (status: string) => {
    if (!app) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = { status }
      if (status === 'printed') payload.printedAt = new Date().toISOString()
      if (status === 'contacted') payload.contactedAt = new Date().toISOString()

      const res = await fetch(`/api/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const updated = await res.json()
      setApp(updated)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const saveNotes = async () => {
    if (!app) return
    setSaving(true)
    try {
      const res = await fetch(`/api/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      })
      const updated = await res.json()
      setApp(updated)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const handlePrint = () => {
    window.print()
    if (app && app.status !== 'printed') {
      updateStatus('printed')
    }
  }

  if (loading || !app) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">{loading ? 'Loading…' : 'Application not found'}</p>
      </div>
    )
  }

  const formData = JSON.parse(app.formData) as Record<string, string>
  const pdfFullUrl = app.pdfUrl.startsWith('http') ? app.pdfUrl : `${typeof window !== 'undefined' ? window.location.origin : ''}${app.pdfUrl}`

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex justify-between items-start">
          <div>
            <button
              onClick={() => router.push('/applications')}
              className="text-sm text-gray-600 hover:text-gray-900 mb-2"
            >
              ← Back to Applications
            </button>
            <h1 className="text-2xl font-bold text-gray-900">{app.applicantName}</h1>
            <p className="text-sm text-gray-500">
              {app.form.position} • Submitted {new Date(app.submittedAt).toLocaleString()} • Application #{app.applicationCount}
            </p>
            {app.applicantEmail && (
              <p className="text-sm text-gray-600">{app.applicantEmail}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">Application PDF</span>
                <div className="flex gap-2">
                  <a
                    href={pdfFullUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Open in new tab
                  </a>
                  <button
                    onClick={handlePrint}
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    Print
                  </button>
                </div>
              </div>
              <div className="h-[600px] bg-gray-100">
                <iframe
                  src={pdfFullUrl}
                  title="Application PDF"
                  className="w-full h-full"
                  onLoad={markViewed}
                />
              </div>
            </div>

            {app.resumeUrl && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">CV / Resume</h3>
                <a
                  href={app.resumeUrl.startsWith('http') ? app.resumeUrl : `${typeof window !== 'undefined' ? window.location.origin : ''}${app.resumeUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  View resume
                </a>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Status</h3>
              <div className="space-y-1">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => updateStatus(opt.value)}
                    disabled={saving}
                    className={`block w-full text-left px-3 py-2 rounded text-sm ${app.status === opt.value ? 'bg-gray-900 text-white' : 'hover:bg-gray-100 text-gray-700'}`}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Notes</h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={saveNotes}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                rows={4}
                placeholder="Add notes…"
              />
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Form Data</h3>
              <dl className="text-xs space-y-1">
                {Object.entries(formData).map(([k, v]) => {
                  if (!v || k === 'coverLetter') return null
                  const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
                  return (
                    <div key={k} className="flex gap-2">
                      <dt className="text-gray-500 shrink-0">{label}:</dt>
                      <dd className="text-gray-800 truncate">{String(v)}</dd>
                    </div>
                  )
                })}
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
