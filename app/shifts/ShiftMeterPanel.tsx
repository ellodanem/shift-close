'use client'

import { useState } from 'react'
import {
  formatMeterVariance,
  hasMeterReadings,
  meterLitres,
  meterVariance,
  type MeterCarry,
  type MeterReadingFields
} from '@/lib/shift-meter'

type Grade = 'unleaded' | 'diesel'

function readingValue(value: number | null): string {
  return value == null ? '' : String(value)
}

function parseInput(raw: string): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

function GradeInputs({
  label,
  chipClass,
  open,
  close,
  test,
  cstore,
  carryOpen,
  carryLabel,
  editable,
  onChange
}: {
  label: string
  chipClass: string
  open: number | null
  close: number | null
  test: number | null
  cstore: number
  carryOpen: number | null
  carryLabel: string | null
  editable: boolean
  onChange: (part: 'open' | 'close' | 'test', value: number | null) => void
}) {
  const meter = meterLitres(open, close, test)
  const variance = meterVariance(meter, cstore)
  const matched = variance != null && Math.abs(variance) < 0.05
  const closeBelowOpen = open != null && close != null && close < open

  const cell = (value: number | null, part: 'open' | 'close' | 'test', placeholder?: string) =>
    editable ? (
      <input
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        value={readingValue(value)}
        placeholder={placeholder}
        onChange={(e) => onChange(part, parseInput(e.target.value))}
        className="w-full min-w-[6.5rem] rounded border border-gray-300 px-2 py-1.5 text-right font-mono text-sm"
      />
    ) : (
      <div className="px-2 py-1.5 text-right font-mono text-sm text-gray-900">{value == null ? '—' : value.toLocaleString('en-US')}</div>
    )

  return (
    <>
      <tr>
        <td className="py-2 pr-3">
          <span className={`inline-block rounded px-2 py-1 text-xs font-semibold ${chipClass}`}>{label}</span>
        </td>
        <td className="px-1 py-2">{cell(open, 'open')}</td>
        <td className="px-1 py-2">{cell(close, 'close')}</td>
        <td className="px-1 py-2">{cell(test, 'test', '0')}</td>
        <td className="px-2 py-2 text-right font-mono text-sm text-gray-900">
          {meter == null ? '—' : meter.toLocaleString('en-US')}
        </td>
        <td className="px-2 py-2 text-right font-mono text-sm text-gray-700">
          {(Number.isFinite(cstore) ? cstore : 0).toLocaleString('en-US')}
        </td>
        <td className="py-2 pl-2 text-right">
          <span
            className={`inline-block rounded px-2 py-1 text-xs font-semibold ${
              variance == null ? 'text-gray-400' : matched ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'
            }`}
          >
            {formatMeterVariance(variance)}
          </span>
        </td>
      </tr>
      {editable && (carryLabel || closeBelowOpen) ? (
        <tr>
          <td />
          <td colSpan={6} className="pb-2 text-xs text-gray-500">
            {carryLabel && open != null && carryOpen != null && open === carryOpen
              ? `Open filled from ${carryLabel} close. `
              : null}
            {closeBelowOpen ? 'Close is lower than open, so the meter litres are negative.' : null}
          </td>
        </tr>
      ) : null}
    </>
  )
}

export default function ShiftMeterPanel({
  readings,
  cstoreUnleaded,
  cstoreDiesel,
  carry,
  editable,
  saveWithShift,
  saving,
  onChange,
  onSave
}: {
  readings: MeterReadingFields
  cstoreUnleaded: number
  cstoreDiesel: number
  carry: MeterCarry | null
  editable: boolean
  saveWithShift: boolean
  saving?: boolean
  onChange: (next: MeterReadingFields) => void
  onSave?: () => void
}) {
  const recorded = hasMeterReadings(readings)
  const [expanded, setExpanded] = useState(false)

  const unleadedVariance = formatMeterVariance(
    meterVariance(meterLitres(readings.unleadedMeterOpen, readings.unleadedMeterClose, readings.unleadedMeterTest), cstoreUnleaded)
  )
  const dieselVariance = formatMeterVariance(
    meterVariance(meterLitres(readings.dieselMeterOpen, readings.dieselMeterClose, readings.dieselMeterTest), cstoreDiesel)
  )

  const reveal = () => {
    if (editable && carry) {
      const next = { ...readings }
      if (next.unleadedMeterOpen == null && carry.unleadedOpen != null) next.unleadedMeterOpen = carry.unleadedOpen
      if (next.dieselMeterOpen == null && carry.dieselOpen != null) next.dieselMeterOpen = carry.dieselOpen
      if (next.unleadedMeterOpen !== readings.unleadedMeterOpen || next.dieselMeterOpen !== readings.dieselMeterOpen) {
        onChange(next)
      }
    }
    setExpanded(true)
  }

  const setPart = (grade: Grade, part: 'open' | 'close' | 'test', value: number | null) => {
    const key = `${grade}Meter${part === 'open' ? 'Open' : part === 'close' ? 'Close' : 'Test'}` as keyof MeterReadingFields
    onChange({ ...readings, [key]: value })
  }

  const sourceLabel = (source: MeterCarry['unleadedSource']) =>
    source ? `${source.date} ${source.shift}` : null

  return (
    <div className="mt-2 rounded border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => (expanded ? setExpanded(false) : reveal())}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <span className="text-sm font-semibold text-gray-900">
          Pump meters
          <span className="ml-2 rounded border border-gray-300 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
            Optional
          </span>
        </span>
        <span className="text-xs text-gray-600">
          {recorded ? (
            <>
              Unleaded {unleadedVariance}
              <span className="mx-1 text-gray-300">·</span>
              Diesel {dieselVariance}
            </>
          ) : (
            'Not recorded'
          )}
          <span className="ml-2 text-blue-700">{expanded ? 'Hide' : 'Show'}</span>
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-gray-200 px-3 pb-3">
          <p className="py-2 text-xs text-gray-500">
            Open and Close are the cumulative pump readings. Meter is Close minus Open minus Test. It is compared with the
            CStore litres in the boxes above. Leave this blank to skip.
            {saveWithShift ? ' These readings save with the shift.' : ' Save meters on its own — the rest of this shift stays as it is.'}
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="py-1 pr-3" />
                  <th className="px-1 py-1 text-right">Open</th>
                  <th className="px-1 py-1 text-right">Close</th>
                  <th className="px-1 py-1 text-right">Test</th>
                  <th className="px-2 py-1 text-right">Meter</th>
                  <th className="px-2 py-1 text-right">CStore</th>
                  <th className="py-1 pl-2 text-right">Variance</th>
                </tr>
              </thead>
              <tbody>
                <GradeInputs
                  label="Unleaded"
                  chipClass="bg-green-200 text-gray-900"
                  open={readings.unleadedMeterOpen}
                  close={readings.unleadedMeterClose}
                  test={readings.unleadedMeterTest}
                  cstore={cstoreUnleaded}
                  carryOpen={carry?.unleadedOpen ?? null}
                  carryLabel={sourceLabel(carry?.unleadedSource ?? null)}
                  editable={editable}
                  onChange={(part, value) => setPart('unleaded', part, value)}
                />
                <GradeInputs
                  label="Diesel"
                  chipClass="bg-green-700 text-white"
                  open={readings.dieselMeterOpen}
                  close={readings.dieselMeterClose}
                  test={readings.dieselMeterTest}
                  cstore={cstoreDiesel}
                  carryOpen={carry?.dieselOpen ?? null}
                  carryLabel={sourceLabel(carry?.dieselSource ?? null)}
                  editable={editable}
                  onChange={(part, value) => setPart('diesel', part, value)}
                />
              </tbody>
            </table>
          </div>
          {editable && !saveWithShift && onSave ? (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save meters'}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
