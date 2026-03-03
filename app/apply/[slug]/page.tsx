'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface FormField {
  name: string
  label: string
  type: string
  required?: boolean
  placeholder?: string
  options?: string[]
}

interface ApplicantForm {
  id: string
  name: string
  slug: string
  position: string
  introText: string
  fields: string
  confirmationText: string
  confirmationBullets: string
}

export default function ApplyPage() {
  const params = useParams()
  const slug = params.slug as string
  const [form, setForm] = useState<ApplicantForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [succeeded, setSucceeded] = useState(false)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [confirmChecked, setConfirmChecked] = useState(false)

  useEffect(() => {
    fetch(`/api/applicant-forms/${slug}`)
      .then((res) => {
        if (!res.ok) throw new Error('Form not found')
        return res.json()
      })
      .then(setForm)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [slug])

  const fields = form ? (JSON.parse(form.fields) as FormField[]) : []
  const bullets = form ? (JSON.parse(form.confirmationBullets) as string[]) : []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    if (form.confirmationText && !confirmChecked) {
      alert('Please confirm the requirements before submitting.')
      return
    }

    const required = fields.filter((f) => f.required)
    for (const f of required) {
      const v = (formData[f.name] || '').trim()
      if (!v) {
        alert(`Please fill in ${f.label}`)
        return
      }
    }

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('formId', form.id)
      fd.append('formData', JSON.stringify(formData))
      if (resumeFile) fd.append('resume', resumeFile)

      const res = await fetch('/api/applications/submit', {
        method: 'POST',
        body: fd
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit')

      setSucceeded(true)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to submit application')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <p className="text-gray-600">Loading form…</p>
      </div>
    )
  }

  if (error || !form) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <p className="text-red-600">{error || 'Form not found'}</p>
      </div>
    )
  }

  if (succeeded) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <h2 className="text-2xl font-bold text-green-700 mb-2">Application Submitted</h2>
          <p className="text-gray-600">
            Thank you for your application. We will review it and get back to you if your profile matches our needs.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">{form.name}</h1>

          {form.introText && (
            <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <h2 className="text-sm font-semibold text-amber-900 mb-2">Important Information — Please Read Before Applying</h2>
              <p className="text-sm text-amber-800 whitespace-pre-line">{form.introText}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {fields.map((field) => (
              <div key={field.name}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {field.label} {field.required && '*'}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    value={formData[field.name] || ''}
                    onChange={(e) => setFormData((d) => ({ ...d, [field.name]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    rows={5}
                  />
                ) : field.type === 'select' ? (
                  <select
                    value={formData[field.name] || ''}
                    onChange={(e) => setFormData((d) => ({ ...d, [field.name]: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  >
                    <option value="">— Select —</option>
                    {(field.options || []).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type === 'email' ? 'email' : 'text'}
                    value={formData[field.name] || ''}
                    onChange={(e) => setFormData((d) => ({ ...d, [field.name]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                )}
              </div>
            ))}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CV / Resume</label>
              <div>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,image/*"
                  onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                />
                <p className="text-xs text-gray-500 mt-1">Optional. PDF, DOC, or image. Max 50 MB.</p>
              </div>
            </div>

            {form.confirmationText && (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmChecked}
                    onChange={(e) => setConfirmChecked(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-sm text-gray-700">
                    {form.confirmationText}
                    <ul className="list-disc list-inside mt-2 text-gray-600 space-y-1">
                      {bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </span>
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-4 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800 disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
