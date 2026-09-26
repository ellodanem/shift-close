'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatMoney } from '@/lib/pay-run'
import { loadPayslipCompany } from '@/lib/payroll-settings'
import { printStaffPayslips, type StaffPayslipSlip } from '@/lib/payroll-print'

const RECENT_COUNT = 3

type StaffPayslip = StaffPayslipSlip & {
  id: string
  payRunId: string
  netPay: number
}

function mdy(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${Number(m)}/${Number(d)}/${y}`
}

export default function StaffPayslipHistory({ staffId }: { staffId: string }) {
  const [slips, setSlips] = useState<StaffPayslip[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [printing, setPrinting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/staff/${staffId}/payslips`, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to load salary slips')
        return Array.isArray(data.slips) ? (data.slips as StaffPayslip[]) : []
      })
      .then((next) => {
        if (cancelled) return
        setSlips(next)
        setSelected(new Set(next.slice(0, RECENT_COUNT).map((slip) => slip.id)))
      })
      .catch((err) => {
        if (cancelled) return
        setSlips([])
        setSelected(new Set())
        setError(err instanceof Error ? err.message : 'Failed to load salary slips')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [staffId])

  const allSelected = slips.length > 0 && slips.every((slip) => selected.has(slip.id))
  const chosen = useMemo(() => slips.filter((slip) => selected.has(slip.id)), [slips, selected])

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(slips.map((slip) => slip.id)))
  }

  const printSelected = async () => {
    if (chosen.length === 0) return
    setPrinting(true)
    setError(null)
    try {
      const company = await loadPayslipCompany()
      const opened = printStaffPayslips({
        companyName: company.companyName,
        companyAddress: company.address,
        companyPhone: company.phone,
        slips: chosen
      })
      if (!opened) setError('Allow pop-ups to print these salary slips.')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <section className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Salary slips</h2>
          <p className="mt-1 text-sm text-gray-500">
            Approved payroll.
            {slips.length > RECENT_COUNT ? ' The three most recent are selected.' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void printSelected()}
          disabled={printing || chosen.length === 0}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700 disabled:bg-gray-400"
        >
          {chosen.length === 1 ? 'Print 1 slip' : `Print ${chosen.length} slips`}
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">Loading salary slips…</p>
      ) : slips.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">
          No approved salary slips yet. Slips appear here after a payroll is approved.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-3 font-medium">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all salary slips"
                  />
                </th>
                <th className="py-2 pr-3 font-medium">Pay date</th>
                <th className="py-2 pr-3 font-medium">Period</th>
                <th className="py-2 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody>
              {slips.map((slip) => (
                <tr key={slip.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      checked={selected.has(slip.id)}
                      onChange={() => toggle(slip.id)}
                      aria-label={`Select slip for ${mdy(slip.payDate)}`}
                    />
                  </td>
                  <td className="py-2 pr-3 text-gray-900">{mdy(slip.payDate)}</td>
                  <td className="py-2 pr-3 text-gray-700">
                    {mdy(slip.startDate)} – {mdy(slip.endDate)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-gray-900">{formatMoney(slip.netPay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
