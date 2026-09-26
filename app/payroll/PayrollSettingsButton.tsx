'use client'

import { useEffect, useId, useState } from 'react'
import {
  DEFAULT_OVERTIME_MULTIPLIER,
  DEFAULT_PAYSLIP_COMPANY,
  MAX_OVERTIME_MULTIPLIER,
  MIN_OVERTIME_MULTIPLIER,
  PAYSLIP_COMPANY_ADDRESS_MAX,
  PAYSLIP_COMPANY_NAME_MAX,
  PAYSLIP_COMPANY_PHONE_MAX,
  normalizeOvertimeMultiplier,
  normalizePayslipCompany,
  overtimeMultiplierLabel,
  parseOvertimeMultiplierInput,
  type PayslipCompany
} from '@/lib/payroll-settings'

export function PayrollSettingsButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        aria-label="Payroll settings"
        title="Payroll settings"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      </button>
      {open ? <PayrollSettingsDialog onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function PayrollSettingsDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId()
  const [company, setCompany] = useState<PayslipCompany>({ ...DEFAULT_PAYSLIP_COMPANY })
  const [overtimeRate, setOvertimeRate] = useState(String(DEFAULT_OVERTIME_MULTIPLIER))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const parsedOvertime = parseOvertimeMultiplierInput(overtimeRate)
  const ready = Boolean(
    company.companyName.trim() && company.address.trim() && company.phone.trim() && parsedOvertime != null
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    fetch('/api/pay-runs/settings')
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to load payroll settings')
        return data as Partial<PayslipCompany> & { overtimeMultiplier?: unknown }
      })
      .then((data) => {
        if (cancelled) return
        setCompany(normalizePayslipCompany(data))
        setOvertimeRate(String(normalizeOvertimeMultiplier(data.overtimeMultiplier)))
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load payroll settings')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const save = async () => {
    if (!company.companyName.trim()) {
      setError('Enter a company name.')
      return
    }
    if (!company.address.trim()) {
      setError('Enter an address.')
      return
    }
    if (!company.phone.trim()) {
      setError('Enter a contact number.')
      return
    }
    if (parsedOvertime == null) {
      setError('Enter an overtime rate from 1 to 3. 1.5 is time and a half.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/pay-runs/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: company.companyName.trim(),
          address: company.address.trim(),
          phone: company.phone.trim(),
          overtimeMultiplier: parsedOvertime
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save payroll settings')
      window.dispatchEvent(new Event('payroll-settings-saved'))
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save payroll settings')
    } finally {
      setSaving(false)
    }
  }

  const field = (key: keyof PayslipCompany, value: string) => {
    setCompany((current) => ({ ...current, [key]: value }))
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">
          Payroll settings
        </h2>
        <p className="mt-2 text-sm text-slate-600">The company details print at the bottom of each payslip.</p>
        <label className="mt-4 block text-sm">
          <span className="font-medium text-slate-800">Company name</span>
          <input
            value={company.companyName}
            maxLength={PAYSLIP_COMPANY_NAME_MAX}
            disabled={loading || saving}
            autoFocus
            onChange={(e) => field('companyName', e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="mt-4 block text-sm">
          <span className="font-medium text-slate-800">Address</span>
          <input
            value={company.address}
            maxLength={PAYSLIP_COMPANY_ADDRESS_MAX}
            disabled={loading || saving}
            onChange={(e) => field('address', e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="mt-4 block text-sm">
          <span className="font-medium text-slate-800">Contact number</span>
          <input
            value={company.phone}
            maxLength={PAYSLIP_COMPANY_PHONE_MAX}
            disabled={loading || saving}
            onChange={(e) => field('phone', e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <div className="mt-6 border-t border-slate-200 pt-4">
          <label className="block text-sm">
            <span className="font-medium text-slate-800">Overtime rate</span>
            <input
              type="number"
              min={MIN_OVERTIME_MULTIPLIER}
              max={MAX_OVERTIME_MULTIPLIER}
              step="0.05"
              value={overtimeRate}
              disabled={loading || saving}
              onChange={(e) => setOvertimeRate(e.target.value)}
              className="mt-1 w-32 rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <p className="mt-2 text-sm text-slate-600">
            Overtime is this multiple of the hourly rate.
            {parsedOvertime != null ? ` ${overtimeMultiplierLabel(parsedOvertime)}.` : ' 1.5 is time and a half.'}{' '}
            A draft uses the new rate when you save it. Approved payroll keeps the overtime already calculated.
          </p>
        </div>
        {error ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={loading || saving || !ready}
            className="rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
