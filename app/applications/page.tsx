'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Application {
  id: string
  applicantName: string
  applicantEmail: string | null
  pdfUrl: string
  resumeUrl: string | null
  submittedAt: string
  status: string
  applicationCount: number
  form: { id: string; name: string; slug: string; position: string }
}

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  viewed: 'Viewed',
  printed: 'Printed',
  contacted: 'Contacted',
  not_qualified: 'Not Qualified',
  interview_set: 'Interview Set',
  no_show: 'No Show',
  hired: 'Hired'
}

const STATUS_ICONS: Record<string, string> = {
  new: '👁‍🗨',
  viewed: '👁',
  printed: '🖨',
  contacted: '📞',
  not_qualified: '❌',
  interview_set: '📅',
  no_show: '⏸',
  hired: '✅'
}

export default function ApplicationsPage() {
  const router = useRouter()
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [diagnostic, setDiagnostic] = useState<{ forms: { id: string; name: string }[]; responseCount?: number; configuredFormId?: string } | null>(null)

  useEffect(() => {
    fetch('/api/applicant-forms/seed', { method: 'POST' }).catch(() => {})
  }, [])

  useEffect(() => {
    const url = statusFilter ? `/api/applications?status=${statusFilter}` : '/api/applications'
    fetch(url)
      .then((res) => res.json())
      .then(setApplications)
      .catch(() => setApplications([]))
      .finally(() => setLoading(false))
  }, [statusFilter])

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  const handleCheckDeftform = async () => {
    try {
      const res = await fetch('/api/applications/sync-deftform')
      const data = await res.json()
      if (res.ok) {
        setDiagnostic({
          forms: data.forms || [],
          responseCount: data.responseCount ?? null,
          configuredFormId: data.configuredFormId
        })
      } else {
        setDiagnostic(null)
        setSyncMessage(data.error || 'Check failed')
      }
    } catch {
      setSyncMessage('Check failed')
    }
  }

  const handleSyncDeftform = async () => {
    setSyncing(true)
    setSyncMessage(null)
    try {
      const res = await fetch('/api/applications/sync-deftform', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setSyncMessage(data.error || 'Sync failed')
        return
      }
      let msg = `Imported ${data.imported} new application(s) from Deftform`
      if (data.total !== undefined) msg += ` (${data.total} total in Deftform)`
      if (data.errorCount > 0) msg += `. ${data.errorCount} error(s): ${(data.errors || []).join('; ')}`
      setSyncMessage(msg)
      const url = statusFilter ? `/api/applications?status=${statusFilter}` : '/api/applications'
      const apps = await fetch(url).then((r) => r.json())
      setApplications(apps)
    } catch {
      setSyncMessage('Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading applications…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Applications</h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCheckDeftform}
              className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              Check Deftform
            </button>
            <button
              type="button"
              onClick={handleSyncDeftform}
              disabled={syncing}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncing ? 'Syncing…' : 'Sync from Deftform'}
            </button>
          </div>
        </div>
        {syncMessage && (
          <p className="mb-4 text-sm text-gray-600">{syncMessage}</p>
        )}
        {diagnostic && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200 text-sm">
            <p className="font-medium text-gray-800 mb-2">Deftform connection</p>
            <p className="text-gray-600">
              Configured form ID: <code className="bg-white px-1 rounded">{diagnostic.configuredFormId || 'Not set'}</code>
              {diagnostic.responseCount !== undefined && (
                <> · Responses for this form: <strong>{diagnostic.responseCount}</strong></>
              )}
            </p>
            {diagnostic.forms?.length > 0 && (
              <p className="mt-2 text-gray-600">
                Your forms: {diagnostic.forms.map((f) => (
                  <span key={f.id} className="inline-block mr-2">
                    <code className="bg-white px-1 rounded">{f.id}</code> ({f.name})
                  </span>
                ))}
              </p>
            )}
            <button
              type="button"
              onClick={() => setDiagnostic(null)}
              className="mt-2 text-gray-500 hover:text-gray-700 text-xs"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="mb-4 flex gap-2 flex-wrap">
          <button
            onClick={() => setStatusFilter('')}
            className={`px-3 py-1.5 rounded text-sm font-medium ${!statusFilter ? 'bg-gray-900 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            All
          </button>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={`px-3 py-1.5 rounded text-sm font-medium ${statusFilter === value ? 'bg-gray-900 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            >
              {STATUS_ICONS[value]} {label}
            </button>
          ))}
        </div>

        {applications.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <p className="text-gray-500">No applications yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Applicant</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Position</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Submitted</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase"># Apps</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {applications.map((app) => (
                  <tr key={app.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{app.applicantName}</div>
                      {app.applicantEmail && (
                        <div className="text-xs text-gray-500">{app.applicantEmail}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{app.form.position}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(app.submittedAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-medium ${app.applicationCount > 1 ? 'text-amber-600' : 'text-gray-600'}`}>
                        {app.applicationCount}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-sm">
                        {STATUS_ICONS[app.status] || '•'} {STATUS_LABELS[app.status] || app.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => router.push(`/applications/${app.id}`)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
