'use client'

import {
  DEPARTMENT_SALE_DEFS,
  extraPosSales,
  salesAmountTotal,
  type ShiftSaleFormRow,
  type ShiftSaleRow
} from '@/lib/shift-sales'

function formatMoney(value: number): string {
  const n = Number.isNaN(value) ? 0 : value
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatQty(value: number | null | undefined, unit: string | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const qty = value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return unit ? `${qty} ${unit}` : qty
}

function NumInput({
  value,
  onChange,
  className
}: {
  value: number | null
  onChange: (value: number | typeof NaN) => void
  className?: string
}) {
  return (
    <input
      type="number"
      step="0.01"
      value={value === null || Number.isNaN(value) ? '' : value}
      onChange={(e) => {
        const v = e.target.value
        const n = parseFloat(v)
        onChange(v === '' || Number.isNaN(n) ? Number.NaN : n)
      }}
      className={className}
    />
  )
}

export default function ShiftSalesGrid({
  rows,
  extraLines,
  fuelUnleaded,
  fuelDiesel,
  tenderTotal,
  editable,
  highlighted,
  hasStoredSales,
  onChange
}: {
  rows: ShiftSaleFormRow[]
  extraLines?: ShiftSaleRow[]
  fuelUnleaded: number
  fuelDiesel: number
  tenderTotal: number
  editable: boolean
  highlighted?: boolean
  hasStoredSales?: boolean
  onChange?: (category: ShiftSaleFormRow['category'], patch: { amount?: number; quantity?: number | null }) => void
}) {
  const salesTotal = salesAmountTotal(rows)
  const difference = salesTotal - (Number.isNaN(tenderTotal) ? 0 : tenderTotal)
  const fromPos = rows.some((row) => row.source === 'pos')
  const posLines = extraPosSales(extraLines)
  const inputClass =
    'w-full border border-gray-300 rounded px-2 py-2 text-right font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 md:border-0 md:bg-transparent md:rounded-none md:py-0 md:focus:ring-0'

  const qtyFor = (row: ShiftSaleFormRow): number | null => {
    if (row.category === 'unleaded') return Number.isNaN(fuelUnleaded) ? null : fuelUnleaded
    if (row.category === 'diesel') return Number.isNaN(fuelDiesel) ? null : fuelDiesel
    return row.quantity
  }

  const renderRow = (row: ShiftSaleFormRow, mobile: boolean) => {
    const def = DEPARTMENT_SALE_DEFS.find((d) => d.category === row.category)
    const qty = qtyFor(row)
    const qtyEditable = editable && def?.quantityKind === 'count'
    const amountNode =
      editable && onChange ? (
        <NumInput
          value={row.amount}
          onChange={(value) => onChange(row.category, { amount: value })}
          className={inputClass}
        />
      ) : (
        <span className="font-mono tabular-nums">{formatMoney(row.amount)}</span>
      )
    const qtyNode = qtyEditable && onChange ? (
      <NumInput
        value={row.quantity}
        onChange={(value) => onChange(row.category, { quantity: Number.isNaN(value) ? null : value })}
        className={inputClass}
      />
    ) : (
      <span className="font-mono tabular-nums text-gray-700">{formatQty(qty, row.unit)}</span>
    )

    if (mobile) {
      return (
        <div key={row.category} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="font-semibold text-gray-900">{row.label}</div>
            {row.source === 'pos' && (
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                POS
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Qty</label>
              <div className="mt-1 rounded border border-gray-200 bg-gray-50 px-2 py-2 text-right">{qtyNode}</div>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Sales $</label>
              <div className="mt-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-2 text-right">{amountNode}</div>
            </div>
          </div>
        </div>
      )
    }

    return (
      <tr key={row.category}>
        <td className="border border-gray-300 px-4 py-2">
          {row.label}
          {row.source === 'pos' && (
            <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
              POS
            </span>
          )}
        </td>
        <td className="border border-gray-300 px-4 py-2 text-right">{qtyNode}</td>
        <td className="border border-gray-300 bg-emerald-50 px-4 py-2 text-right">{amountNode}</td>
      </tr>
    )
  }

  return (
    <div className={`mb-6 ${highlighted ? 'ring-2 ring-blue-200 rounded-lg p-2' : ''}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="bg-emerald-700 px-4 py-2 font-semibold text-white">Sales</h3>
        <p className="text-xs text-gray-500">
          {fromPos ? 'Filled from POS — edit if you need to correct.' : 'Enter department totals. POS can fill this later.'}
        </p>
      </div>

      {!editable && hasStoredSales === false ? (
        <p className="rounded border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          Sales were not recorded on this close. Reopen the shift to enter them, or wait until POS import is wired.
        </p>
      ) : (
        <>
      <div className="space-y-3 md:hidden">
        {rows.map((row) => renderRow(row, true))}
        <div className="rounded-lg bg-emerald-900 p-3 text-white">
          <div className="flex items-center justify-between text-sm">
            <span className="text-emerald-100">Total sales</span>
            <span className="font-mono font-semibold tabular-nums">{formatMoney(salesTotal)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-emerald-100">System tenders</span>
            <span className="font-mono tabular-nums">{formatMoney(tenderTotal)}</span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-emerald-700 pt-3">
            <span className="text-sm text-emerald-100">Sales vs tenders</span>
            <span className={`font-bold font-mono tabular-nums ${Math.abs(difference) < 1 ? 'text-white' : 'text-amber-200'}`}>
              {difference > 0 ? '+' : ''}
              {formatMoney(difference)}
            </span>
          </div>
        </div>
      </div>

      <div className="hidden md:block">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="border border-gray-300 bg-emerald-100 px-4 py-2 text-left">Department</th>
              <th className="border border-gray-300 bg-emerald-100 px-4 py-2 text-right">Qty</th>
              <th className="border border-gray-300 bg-emerald-700 px-4 py-2 text-right text-white">Sales $</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => renderRow(row, false))}
            <tr>
              <td className="border border-gray-300 px-4 py-2 font-semibold" colSpan={2}>
                Total sales
              </td>
              <td className="border border-gray-300 bg-emerald-700 px-4 py-2 text-right font-semibold text-white">
                {formatMoney(salesTotal)}
              </td>
            </tr>
            <tr>
              <td className="border border-gray-300 px-4 py-2 text-gray-600" colSpan={2}>
                System tenders
              </td>
              <td className="border border-gray-300 px-4 py-2 text-right font-mono text-gray-700">
                {formatMoney(tenderTotal)}
              </td>
            </tr>
            <tr>
              <td className="border border-gray-300 px-4 py-2 text-gray-600" colSpan={2}>
                Sales vs tenders
              </td>
              <td
                className={`border border-gray-300 px-4 py-2 text-right font-semibold font-mono ${
                  Math.abs(difference) < 1 ? 'text-gray-700' : 'text-amber-700'
                }`}
              >
                {difference > 0 ? '+' : ''}
                {formatMoney(difference)}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1 text-xs text-gray-500">
          Unleaded and diesel qty come from the fuel boxes above. Sales vs tenders is a check only — it does not block
          close. A difference is common until POS fills both sides.
        </p>
      </div>

      {posLines.length > 0 && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-900">POS detail</div>
          <ul className="space-y-1 text-sm">
            {posLines.map((line) => (
              <li key={`${line.posKey}-${line.category}`} className="flex justify-between gap-3">
                <span className="text-gray-800">{line.label || line.category}</span>
                <span className="font-mono tabular-nums">{formatMoney(line.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
        </>
      )}
    </div>
  )
}
