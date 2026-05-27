'use client'

import { useState } from 'react'
import { formatSavedPayPeriodDateRange } from '@/lib/pay-period-email'
import { formatDateDisplay } from '@/lib/pay-period-excel'
import type { PayPeriodExcelData, PayPeriodExcelRow } from '@/lib/pay-period-excel'
import { resolvePayPeriodPreviousRow } from '@/lib/pay-period-rows'

export interface MobileEditDraft extends PayPeriodExcelData {
  id: string
  previousRowsSnapshot: PayPeriodExcelRow[] | null
}

const fieldLabel = 'block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1'
const fieldInput =
  'w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-base text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

function PreviousHint({ show, text }: { show: boolean; text: string }) {
  if (!show) return null
  return <p className="text-xs text-amber-400 mt-1">Previously: {text}</p>
}

export default function MobilePayPeriodEdit({
  draft,
  onCancel,
  onSaved
}: {
  draft: MobileEditDraft
  onCancel: () => void
  onSaved: () => void | Promise<void>
}) {
  const [data, setData] = useState(draft)
  const [staffIndex, setStaffIndex] = useState(0)
  const [tab, setTab] = useState<'staff' | 'notes'>('staff')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const rowCount = data.rows.length
  const safeIndex = rowCount > 0 ? Math.min(staffIndex, rowCount - 1) : 0
  const row = data.rows[safeIndex]
  const prevRow = row
    ? resolvePayPeriodPreviousRow(data.previousRowsSnapshot, row.staffId, safeIndex)
    : undefined

  const updateRow = (index: number, field: keyof PayPeriodExcelRow, value: string | number) => {
    const rows = [...data.rows]
    rows[index] = { ...rows[index], [field]: value }
    setData({ ...data, rows })
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/attendance/pay-period/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: data.rows, notes: data.notes ?? '' })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(typeof body.error === 'string' ? body.error : 'Failed to save')
      }
      setConfirmOpen(false)
      await onSaved()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-700/80 bg-slate-900/95 backdrop-blur px-4 py-3">
        <div className="flex items-start justify-between gap-3 max-w-lg mx-auto">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">Edit pay period</h1>
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {formatSavedPayPeriodDateRange(data.startDate, data.endDate)} · {data.entityName}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Report {formatDateDisplay(data.reportDate)}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-medium text-blue-300 hover:text-blue-200 px-2 py-1 rounded-md hover:bg-slate-800 shrink-0"
          >
            Cancel
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 pt-3 pb-36">
        <div className="flex gap-2 mb-4" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'staff'}
            onClick={() => setTab('staff')}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
              tab === 'staff'
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'border-slate-600 text-slate-400 hover:bg-slate-800'
            }`}
          >
            Staff{rowCount > 0 ? ` (${safeIndex + 1}/${rowCount})` : ''}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'notes'}
            onClick={() => setTab('notes')}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
              tab === 'notes'
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'border-slate-600 text-slate-400 hover:bg-slate-800'
            }`}
          >
            Notes
          </button>
        </div>

        {tab === 'staff' ? (
          rowCount === 0 ? (
            <p className="text-sm text-slate-400">No staff rows in this report.</p>
          ) : (
            <div className="rounded-xl border border-slate-600 bg-slate-800/80 p-4">
              <h2 className="text-base font-semibold text-slate-100 mb-4">{row.staffName}</h2>

              <div className="space-y-4">
                <div>
                  <label className={fieldLabel} htmlFor="ppr-trans">
                    Trans total
                  </label>
                  <input
                    id="ppr-trans"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={row.transTtl}
                    onChange={(e) =>
                      updateRow(safeIndex, 'transTtl', parseFloat(e.target.value) || 0)
                    }
                    className={fieldInput}
                  />
                  <PreviousHint
                    show={
                      !!prevRow && prevRow.transTtl.toFixed(2) !== row.transTtl.toFixed(2)
                    }
                    text={prevRow!.transTtl.toFixed(2)}
                  />
                </div>

                <div>
                  <label className={fieldLabel} htmlFor="ppr-vac">
                    Vacation
                  </label>
                  <input
                    id="ppr-vac"
                    type="text"
                    value={row.vacation}
                    placeholder="********"
                    onChange={(e) => updateRow(safeIndex, 'vacation', e.target.value)}
                    className={fieldInput}
                  />
                  <PreviousHint
                    show={
                      !!prevRow &&
                      (prevRow.vacation ?? '').trim() !== (row.vacation ?? '').trim()
                    }
                    text={(prevRow!.vacation ?? '').trim() || '—'}
                  />
                </div>

                <div>
                  <label className={fieldLabel} htmlFor="ppr-sick-days">
                    Sick days
                  </label>
                  <input
                    id="ppr-sick-days"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={row.sickLeaveDays ?? 0}
                    onChange={(e) =>
                      updateRow(
                        safeIndex,
                        'sickLeaveDays',
                        e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0
                      )
                    }
                    className={fieldInput}
                  />
                  <PreviousHint
                    show={
                      !!prevRow && (prevRow.sickLeaveDays ?? 0) !== (row.sickLeaveDays ?? 0)
                    }
                    text={String(prevRow!.sickLeaveDays ?? 0)}
                  />
                </div>

                <div>
                  <label className={fieldLabel} htmlFor="ppr-sick-leave">
                    Sick leave (dates)
                  </label>
                  <input
                    id="ppr-sick-leave"
                    type="text"
                    value={row.sickLeaveRanges ?? ''}
                    placeholder="Mar 3 – Mar 5"
                    onChange={(e) => updateRow(safeIndex, 'sickLeaveRanges', e.target.value)}
                    className={fieldInput}
                  />
                  <PreviousHint
                    show={
                      !!prevRow &&
                      (prevRow.sickLeaveRanges ?? '').trim() !== (row.sickLeaveRanges ?? '').trim()
                    }
                    text={(prevRow!.sickLeaveRanges ?? '').trim() || '—'}
                  />
                </div>

                <div>
                  <label className={fieldLabel} htmlFor="ppr-short">
                    Shortage ($)
                  </label>
                  <input
                    id="ppr-short"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={row.shortage || ''}
                    placeholder="0"
                    onChange={(e) =>
                      updateRow(safeIndex, 'shortage', parseFloat(e.target.value) || 0)
                    }
                    className={fieldInput}
                  />
                  <PreviousHint
                    show={!!prevRow && prevRow.shortage !== row.shortage}
                    text={prevRow!.shortage > 0 ? `$${prevRow!.shortage.toFixed(2)}` : '0'}
                  />
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="rounded-xl border border-slate-600 bg-slate-800/80 p-4">
            <label className={fieldLabel} htmlFor="ppr-notes">
              Notes (optional)
            </label>
            <textarea
              id="ppr-notes"
              rows={10}
              value={data.notes ?? ''}
              onChange={(e) => setData({ ...data, notes: e.target.value })}
              className={`${fieldInput} text-sm font-mono`}
              spellCheck={false}
              placeholder="Internal notes for this pay period…"
            />
          </div>
        )}

        {saveError ? <p className="mt-3 text-sm text-red-300">{saveError}</p> : null}
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-700 bg-slate-900/98 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="max-w-lg mx-auto">
          {tab === 'staff' && rowCount > 1 ? (
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                disabled={safeIndex <= 0}
                onClick={() => setStaffIndex((i) => Math.max(0, i - 1))}
                className="flex-1 min-h-[44px] rounded-lg border border-slate-600 bg-slate-800 text-sm font-medium text-slate-200 disabled:opacity-40"
              >
                ← Prev
              </button>
              <button
                type="button"
                disabled={safeIndex >= rowCount - 1}
                onClick={() => setStaffIndex((i) => Math.min(rowCount - 1, i + 1))}
                className="flex-1 min-h-[44px] rounded-lg border border-slate-600 bg-slate-800 text-sm font-medium text-slate-200 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="w-full min-h-[48px] rounded-lg bg-blue-600 text-base font-semibold text-white hover:bg-blue-500 active:scale-[0.99]"
          >
            Save changes
          </button>
        </div>
      </div>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
          onClick={() => !saving && setConfirmOpen(false)}
        >
          <div
            className="bg-slate-800 border border-slate-600 rounded-t-xl w-full max-w-lg p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="ppr-save-title"
          >
            <h3 id="ppr-save-title" className="text-base font-semibold text-white">
              Save this pay period?
            </h3>
            <p className="text-sm text-slate-300 mt-2 mb-5">
              Updates the saved report. Previous values are kept for audit (same as desktop Edit).
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => setConfirmOpen(false)}
                className="flex-1 min-h-[44px] rounded-lg border border-slate-600 text-sm font-medium text-slate-200 disabled:opacity-50"
              >
                Go back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="flex-1 min-h-[44px] rounded-lg bg-blue-600 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
