'use client'

import { formatMoney } from '@/lib/day-reconcile'
import type { MiniRangeReport } from '@/lib/mini-report'

function Dot({ ok }: { ok: boolean }) {
  return <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle ${ok ? 'bg-green-600' : 'bg-red-600'}`} />
}

const TH = 'px-2 py-1 font-normal'
const HEAD_ROW = 'border-b border-gray-200 text-xs text-gray-500'

/** The mini report for a range: Collected and Deposit only. */
export default function MiniRangeReportView({ report }: { report: MiniRangeReport }) {
  const range = `${report.from} to ${report.to}`
  return (
    <div className="rounded border border-gray-200 bg-white shadow-sm print:border-0 print:shadow-none">
      <div className="border-b border-gray-200 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-lg font-bold text-gray-900">{report.from === report.to ? report.from : range}</span>
          <span className="text-sm text-gray-500">
            {report.dayCount} {report.dayCount === 1 ? 'day' : 'days'}
          </span>
          <span className="ml-auto text-[11px] text-gray-400">Generated with ShiftClose</span>
        </div>
      </div>

      <div className="px-4 pb-6 pt-1 sm:px-6">
        <h3 className="mb-1 mt-5 text-sm font-semibold text-gray-900">Collected</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className={HEAD_ROW}>
                <th className={`${TH} text-left`}>Type</th>
                <th className={`${TH} text-right`}>System</th>
                <th className={`${TH} text-right`}>Count</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {report.collected.map((l) => (
                <tr key={l.key} className={`border-b border-gray-100 ${l.key === 'cashChecks' ? 'font-semibold' : ''}`}>
                  <td className="px-2 py-1.5 text-left">
                    <Dot ok={l.status === 'match'} />
                    {l.label}
                  </td>
                  <td className="px-2 py-1.5 text-right">{formatMoney(l.system)}</td>
                  <td className="px-2 py-1.5 text-right">{formatMoney(l.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="mb-1 mt-5 text-sm font-semibold text-gray-900">Deposit</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className={HEAD_ROW}>
                <th className={`${TH} text-left`}>Type</th>
                <th className={`${TH} text-right`}>Counted (Cash + Checks)</th>
                <th className={`${TH} text-right`}>Deposited</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr className="border-b border-gray-100 font-semibold">
                <td className="px-2 py-1.5 text-left">
                  <Dot ok={report.deposit.status === 'match'} />
                  Deposit
                </td>
                <td className="px-2 py-1.5 text-right">{formatMoney(report.deposit.counted)}</td>
                <td className="px-2 py-1.5 text-right">{formatMoney(report.deposit.deposited)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
