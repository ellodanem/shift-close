'use client'

export type ShiftCountSystemRow = {
  key: string
  label: string
  count: number
  system: number
  overShort: number
  countHighlight?: boolean
  systemHighlight?: boolean
}

export type ShiftCashCheckSummary = {
  countTotal: number
  systemTotal: number
  overShortTotal: number
}

type FieldKey =
  | 'countCash'
  | 'systemCash'
  | 'countChecks'
  | 'systemChecks'
  | 'countCredit'
  | 'systemCredit'
  | 'countInhouse'
  | 'systemInhouse'
  | 'countFleet'
  | 'systemFleet'
  | 'countMassyCoupons'
  | 'systemMassyCoupons'

const FIELD_MAP: Record<string, { count: FieldKey; system: FieldKey }> = {
  cash: { count: 'countCash', system: 'systemCash' },
  checks: { count: 'countChecks', system: 'systemChecks' },
  credits: { count: 'countCredit', system: 'systemCredit' },
  inhouse: { count: 'countInhouse', system: 'systemInhouse' },
  fleets: { count: 'countFleet', system: 'systemFleet' },
  massy: { count: 'countMassyCoupons', system: 'systemMassyCoupons' }
}

function osTextClass(value: number): string {
  if (Math.abs(value) < 0.005) return 'text-gray-500'
  if (value > 0) return 'text-green-600'
  return 'text-red-600'
}

function formatOs(value: number): string {
  const abs = Math.abs(value).toFixed(2)
  if (Math.abs(value) < 0.005) return '0.00'
  return value > 0 ? `+${abs}` : `-${abs}`
}

function NumInput({
  value,
  onChange,
  mobile = false
}: {
  value: number
  onChange: (value: number | typeof NaN) => void
  mobile?: boolean
}) {
  return (
    <input
      type="number"
      step="0.01"
      value={Number.isNaN(value) ? '' : value}
      onChange={(e) => {
        const v = e.target.value
        const n = parseFloat(v)
        onChange(v === '' || Number.isNaN(n) ? Number.NaN : n)
      }}
      className={
        mobile
          ? 'w-full rounded border px-2 py-2 text-right font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'
          : 'w-full border-0 bg-transparent text-right focus:outline-none'
      }
    />
  )
}

function renderCellValue(
  value: number,
  editable: boolean,
  onChange: ((value: number | typeof NaN) => void) | undefined,
  mobile: boolean
) {
  if (editable && onChange) {
    return <NumInput value={value} onChange={onChange} mobile={mobile} />
  }
  if (mobile) {
    return <span className="font-mono tabular-nums">{value.toFixed(2)}</span>
  }
  return value.toFixed(2)
}

export default function ShiftCountSystemGrid({
  rows,
  summary,
  editable,
  onFieldChange
}: {
  rows: ShiftCountSystemRow[]
  summary: ShiftCashCheckSummary
  editable: boolean
  onFieldChange?: (field: FieldKey, value: number | typeof NaN) => void
}) {
  return (
    <div className="mb-6">
      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {rows.map((row) => {
          const fields = FIELD_MAP[row.key]
          const onCount = fields && onFieldChange ? (v: number | typeof NaN) => onFieldChange(fields.count, v) : undefined
          const onSystem = fields && onFieldChange ? (v: number | typeof NaN) => onFieldChange(fields.system, v) : undefined
          return (
            <div key={row.key} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
              <div className="mb-3 font-semibold text-gray-900">{row.label}</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Count</label>
                  <div className="mt-1 rounded border border-blue-200 bg-blue-50 px-2 py-2 text-right">
                    {renderCellValue(row.count, editable, onCount, true)}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-red-600">System</label>
                  <div className="mt-1 rounded border border-red-200 bg-red-50 px-2 py-2 text-right">
                    {renderCellValue(row.system, editable, onSystem, true)}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 text-sm">
                <span className="text-gray-600">Over/Short</span>
                <span className={`font-semibold font-mono tabular-nums ${osTextClass(row.overShort)}`}>
                  {formatOs(row.overShort)}
                </span>
              </div>
            </div>
          )
        })}

        <div className="rounded-lg bg-slate-800 p-3 text-white">
          <div className="text-xs uppercase tracking-wide text-slate-300">Count (Cash + Check)</div>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-[11px] text-blue-200">Count</div>
              <div className="font-mono font-semibold tabular-nums">{summary.countTotal.toFixed(2)}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-red-200">System</div>
              <div className="font-mono font-semibold tabular-nums">{summary.systemTotal.toFixed(2)}</div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-600 pt-3">
            <span className="text-sm text-slate-300">Over/Short</span>
            <span className={`font-bold font-mono tabular-nums ${osTextClass(summary.overShortTotal)}`}>
              {formatOs(summary.overShortTotal)}
            </span>
          </div>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="border border-gray-300 bg-blue-100 px-4 py-2 text-left">Description</th>
                <th className="border border-gray-300 bg-blue-600 px-4 py-2 text-right text-white">Count</th>
                <th className="border border-gray-300 bg-red-500 px-4 py-2 text-right text-white">System</th>
                <th className="border border-gray-300 bg-black px-4 py-2 text-right text-white">Over/Short</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const fields = FIELD_MAP[row.key]
                const onCount = fields && onFieldChange ? (v: number | typeof NaN) => onFieldChange(fields.count, v) : undefined
                const onSystem = fields && onFieldChange ? (v: number | typeof NaN) => onFieldChange(fields.system, v) : undefined
                return (
                  <tr key={row.key}>
                    <td className="border border-gray-300 px-4 py-2">{row.label}</td>
                    <td
                      className={`border border-gray-300 px-4 py-2 text-right ${
                        row.countHighlight ? 'bg-blue-50' : ''
                      }`}
                    >
                      {renderCellValue(row.count, editable, onCount, false)}
                    </td>
                    <td
                      className={`border border-gray-300 px-4 py-2 text-right ${
                        row.systemHighlight ? 'bg-blue-50' : ''
                      }`}
                    >
                      {renderCellValue(row.system, editable, onSystem, false)}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-right font-semibold">
                      {row.overShort.toFixed(2)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <td className="border border-gray-300 px-4 py-2 font-semibold">Count (Cash+Check)</td>
                <td className="border border-gray-300 bg-blue-600 px-4 py-2 text-right font-semibold text-white">
                  {summary.countTotal.toFixed(2)}
                </td>
                <td className="border border-gray-300 bg-red-500 px-4 py-2 text-right font-semibold text-white">
                  {summary.systemTotal.toFixed(2)}
                </td>
                <td className="border border-gray-300 bg-black px-4 py-2 text-right font-semibold text-white">
                  {summary.overShortTotal.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
