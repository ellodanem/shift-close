'use client'

import { useEffect, useId, useState } from 'react'
import { PrintDocumentModal, type PrintDocumentPreview } from '@/app/payroll/PrintDocumentModal'
import {
  incomeYearOf,
  incomeYearRange,
  payeCertificateFilename,
  renderPayeCertificateHtml,
  type PayeCertificate
} from '@/lib/paye-certificate'

function mdy(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${Number(m)}/${Number(d)}/${y}`
}

export function PayeCertificateButton({ year, years }: { year: number; years: number[] }) {
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'year' | 'range'>('year')
  const [incomeYear, setIncomeYear] = useState(year)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PrintDocumentPreview | null>(null)

  const openDialog = () => {
    const nextYear = years.includes(year) ? year : (years[0] ?? year)
    const range = incomeYearRange(nextYear)
    setIncomeYear(nextYear)
    setStartDate(range.startDate)
    setEndDate(range.endDate)
    setMode('year')
    setError(null)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const chooseYear = (value: number) => {
    const range = incomeYearRange(value)
    setIncomeYear(value)
    setStartDate(range.startDate)
    setEndDate(range.endDate)
    setError(null)
  }

  const previewCertificates = async () => {
    const range = mode === 'year' ? incomeYearRange(incomeYear) : { startDate, endDate }
    if (incomeYearOf(range.startDate, range.endDate) == null) {
      setError(
        range.startDate > range.endDate
          ? 'The end date has to be on or after the start.'
          : 'A TD5 or TD4 covers one income year. Choose dates inside a single calendar year.'
      )
      return
    }
    setBusy(true)
    setError(null)
    try {
      const params = new URLSearchParams({ startDate: range.startDate, endDate: range.endDate })
      const res = await fetch(`/api/pay-runs/certificates?${params}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to build certificates')
      const certificates = Array.isArray(data.certificates) ? (data.certificates as PayeCertificate[]) : []
      if (certificates.length === 0) {
        setError('No approved pay in this range.')
        return
      }
      const fullYear = range.startDate.endsWith('-01-01') && range.endDate.endsWith('-12-31')
      setPreview({
        title: 'TD5 / TD4',
        subtitle: fullYear
          ? `Income year ${data.incomeYear}`
          : `${mdy(range.startDate)} – ${mdy(range.endDate)} · Income year ${data.incomeYear}`,
        filename: payeCertificateFilename(range.startDate, range.endDate),
        html: renderPayeCertificateHtml({
          startDate: range.startDate,
          endDate: range.endDate,
          incomeYear: data.incomeYear,
          certificates
        })
      })
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build certificates')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md border border-violet-700 px-4 text-sm font-semibold text-violet-700 hover:bg-violet-50 sm:h-10 sm:min-h-0 sm:w-auto"
      >
        TD5 / TD4
      </button>
      {open ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="my-4 w-full max-w-lg rounded-lg bg-white p-4 shadow-xl sm:p-6"
          >
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              TD5 / TD4
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Employee certificates for the income tax return. Someone still employed gets a TD5. Someone marked
              inactive gets a TD4. Totals are approved pay whose pay date falls in the range.
            </p>
            <form
              className="mt-5"
              onSubmit={(event) => {
                event.preventDefault()
                void previewCertificates()
              }}
            >
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-pressed={mode === 'year'}
                  onClick={() => {
                    setMode('year')
                    chooseYear(incomeYear)
                  }}
                  className={`min-h-[44px] flex-1 rounded-md border px-3 text-sm font-medium sm:min-h-0 ${
                    mode === 'year'
                      ? 'border-violet-700 bg-violet-50 text-violet-900'
                      : 'border-slate-200 text-slate-700'
                  }`}
                >
                  Income year
                </button>
                <button
                  type="button"
                  aria-pressed={mode === 'range'}
                  onClick={() => {
                    setMode('range')
                    setError(null)
                  }}
                  className={`min-h-[44px] flex-1 rounded-md border px-3 text-sm font-medium sm:min-h-0 ${
                    mode === 'range'
                      ? 'border-violet-700 bg-violet-50 text-violet-900'
                      : 'border-slate-200 text-slate-700'
                  }`}
                >
                  Date range
                </button>
              </div>
              {mode === 'year' ? (
                <label className="mt-4 block text-sm">
                  <span className="font-medium text-slate-800">Income year</span>
                  <select
                    value={incomeYear}
                    onChange={(event) => chooseYear(Number(event.target.value))}
                    className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 sm:min-h-0"
                  >
                    {(years.includes(incomeYear) ? years : [incomeYear, ...years]).map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="font-medium text-slate-800">From</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(event) => {
                        setStartDate(event.target.value)
                        setError(null)
                      }}
                      className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 px-3 py-2 sm:min-h-0"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium text-slate-800">To</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(event) => {
                        setEndDate(event.target.value)
                        setError(null)
                      }}
                      className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 px-3 py-2 sm:min-h-0"
                    />
                  </label>
                </div>
              )}
              {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="min-h-[44px] rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:min-h-0"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="min-h-[44px] rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50 sm:min-h-0"
                >
                  {busy ? 'Preparing…' : 'Preview'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {preview ? <PrintDocumentModal preview={preview} onClose={() => setPreview(null)} /> : null}
    </div>
  )
}
