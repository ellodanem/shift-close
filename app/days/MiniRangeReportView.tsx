'use client'

import { formatMoney } from '@/lib/day-reconcile'
import { formatDmy, type MiniRangeReport } from '@/lib/mini-report'

function Dot({ ok }: { ok: boolean }) {
  return <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle ${ok ? 'bg-green-600' : 'bg-red-600'}`} />
}

const TH = 'px-2 py-1 font-normal'
const HEAD_ROW = 'border-b border-gray-200 text-xs text-gray-500'

/** The mini report for a range: card / electronic, fleet, vouchers, and the deposit. */
export default function MiniRangeReportView({ report }: { report: MiniRangeReport }) {
  const range = `${formatDmy(report.from)} to ${formatDmy(report.to)}`
  return (
    <div className="rounded border border-gray-200 bg-white shadow-sm print:border-0 print:shadow-none">
      <div className="border-b border-gray-200 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-lg font-bold text-gray-900">{report.from === report.to ? formatDmy(report.from) : range}</span>
          <span className="text-sm text-gray-500">
            {report.dayCount} {report.dayCount === 1 ? 'day' : 'days'}
          </span>
          <span className="ml-auto text-[11px] text-gray-400">Generated with ShiftClose</span>
        </div>
      </div>

      <div className="px-4 pb-6 pt-1 sm:px-6">
        <h3 className="mb-1 mt-5 text-sm font-semibold text-gray-900">Collected</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-sm">
            <tbody className="tabular-nums">
              <tr className="border-b border-gray-100">
                <td className="px-2 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-gray-500" colSpan={2}>
                  Card / electronic
                </td>
              </tr>
              <tr className="border-b border-gray-100 font-semibold">
                <td className="px-2 py-1.5 text-left">Total</td>
                <td className="px-2 py-1.5 text-right">{formatMoney(report.card.total)}</td>
              </tr>
              <tr className="border-b border-gray-100 text-xs text-gray-600">
                <td className="py-1.5 pl-6 pr-2 text-left">Debit (system)</td>
                <td className="px-2 py-1.5 text-right">{formatMoney(report.card.debit)}</td>
              </tr>
              <tr className="border-b border-gray-100 text-xs text-gray-600">
                <td className="py-1.5 pl-6 pr-2 text-left">Credit (other)</td>
                <td className="px-2 py-1.5 text-right">{formatMoney(report.card.credit)}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-2 py-1.5 text-left text-gray-700">Fleet</td>
                <td className="px-2 py-1.5 text-right font-medium">{formatMoney(report.fleet)}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-2 py-1.5 text-left text-gray-700">Vouchers / coupons</td>
                <td className="px-2 py-1.5 text-right font-medium">{formatMoney(report.vouchers)}</td>
              </tr>
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
