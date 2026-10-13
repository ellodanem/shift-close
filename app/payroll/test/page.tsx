'use client'

import { useEffect, useState } from 'react'
import { formatCurrency } from '@/lib/format'

export default function PayrollTestPage() {
  const [step, setStep] = useState(1)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const raw = sessionStorage.getItem('payroll-test-request')
    if (!raw) { setError('No test payroll was selected.'); return }
    fetch('/api/pay-runs/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw })
      .then(async (res) => { const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Test run failed'); setResult(data) })
      .catch((err) => setError(err instanceof Error ? err.message : 'Test run failed'))
  }, [])
  if (error) return <main className="mx-auto max-w-4xl p-6"><p className="rounded border border-red-200 bg-red-50 p-3 text-red-700">{error}</p></main>
  if (!result) return <main className="mx-auto max-w-4xl p-6">Loading test payroll…</main>
  const totals = result.totals || {}
  return <main className="mx-auto max-w-5xl p-6"><div className="flex items-center justify-between"><div><h1 className="text-2xl font-semibold">Test payroll</h1><p className="text-sm text-amber-700">TEST MODE — changes are not saved.</p></div><a href="/payroll" className="rounded border px-3 py-2 text-sm">Exit test</a></div><div className="mt-6 grid grid-cols-3 border-b text-sm">{['Enter payroll', 'Approve payroll', 'Print'].map((label, index) => <button key={label} onClick={() => setStep(index + 1)} className={`border-b-2 p-3 text-left ${step === index + 1 ? 'border-violet-600 font-semibold text-violet-700' : 'border-transparent text-slate-500'}`}>{index + 1}. {label}</button>)}</div>{step === 1 ? <section className="mt-6"><h2 className="text-lg font-semibold">Enter hours and money</h2><p className="mt-1 text-sm text-slate-500">Review the calculated lines exactly as they would appear before approval.</p><LineTable lines={result.lines} /></section> : null}{step === 2 ? <section className="mt-6"><h2 className="text-lg font-semibold">Approve payroll</h2><p className="mt-1 text-sm text-slate-500">Approval validation completed in test mode. No approval was recorded.</p><div className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-4">{result.warnings?.length ? result.warnings.join(' · ') : 'All approval checks passed.'}</div><Totals totals={totals} /></section> : null}{step === 3 ? <section className="mt-6"><h2 className="text-lg font-semibold">Print</h2><p className="mt-1 text-sm text-slate-500">These are the payroll document lines that would be printed.</p><LineTable lines={result.lines} /></section> : null}<div className="mt-8 flex justify-between"><button disabled={step === 1} onClick={() => setStep((v) => v - 1)} className="rounded border px-4 py-2 disabled:opacity-40">Back</button><button disabled={step === 3} onClick={() => setStep((v) => v + 1)} className="rounded bg-violet-700 px-4 py-2 text-white disabled:opacity-40">Next step</button></div></main>
}

function LineTable({ lines }: { lines: any[] }) { return <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Employee</th><th className="p-2">Type</th><th className="p-2 text-right">Gross</th><th className="p-2 text-right">Net</th></tr></thead><tbody>{(lines || []).map((line, i) => <tr key={line.staffId || i} className="border-b"><td className="p-2">{line.staffName}</td><td className="p-2">{line.payType}</td><td className="p-2 text-right">{formatCurrency(Number(line.grossPay || 0))}</td><td className="p-2 text-right">{formatCurrency(Number(line.netPay || 0))}</td></tr>)}</tbody></table></div> }
function Totals({ totals }: { totals: any }) { return <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded border p-3"><div className="text-xs text-slate-500">Employees</div><div className="text-lg font-semibold">{totals.employees}</div></div><div className="rounded border p-3"><div className="text-xs text-slate-500">Gross pay</div><div className="text-lg font-semibold">{formatCurrency(totals.grossPay || 0)}</div></div><div className="rounded border p-3"><div className="text-xs text-slate-500">Net pay</div><div className="text-lg font-semibold">{formatCurrency(totals.netPay || 0)}</div></div></div> }
