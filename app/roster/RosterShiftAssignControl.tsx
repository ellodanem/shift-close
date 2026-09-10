'use client'

import { formatHm, textOnHex } from '@/lib/color-contrast'

export interface RosterShiftTemplateOption {
  id: string
  name: string
  startTime: string
  endTime: string
  color?: string | null
}

export default function RosterShiftAssignControl({
  template,
  templates,
  value,
  onChange,
  disabled,
  locked,
  onVacation,
  onSickLeave,
  stationClosed,
  holidayName,
  mismatch,
  mismatchTooltip,
  compact
}: {
  template?: RosterShiftTemplateOption | null
  templates: RosterShiftTemplateOption[]
  value: string
  onChange: (shiftTemplateId: string | null) => void
  disabled?: boolean
  locked?: boolean
  onVacation?: boolean
  onSickLeave?: boolean
  stationClosed?: boolean
  holidayName?: string | null
  mismatch?: boolean
  mismatchTooltip?: string
  compact?: boolean
}) {
  const height = compact ? 'h-[52px]' : 'min-h-[48px]'
  const color = template?.color ?? undefined
  const fg = textOnHex(color)
  const timeLabel =
    template && (template.startTime || template.endTime)
      ? `${formatHm(template.startTime)}–${formatHm(template.endTime)}`
      : ''

  if (onVacation) {
    return (
      <div
        className={`${height} flex items-center justify-center rounded-lg bg-slate-100 px-1.5 text-center text-xs font-medium text-slate-500`}
      >
        Vacation
      </div>
    )
  }
  if (onSickLeave) {
    return (
      <div
        className={`${height} flex items-center justify-center rounded-lg bg-rose-50 px-1.5 text-center text-xs font-medium text-rose-700`}
      >
        Sick leave
      </div>
    )
  }
  if (stationClosed) {
    return (
      <div className={`${height} flex flex-col items-center justify-center rounded-lg bg-amber-50 px-1.5 text-center`}>
        <div className="text-[10px] font-bold uppercase tracking-wide text-amber-900">Closed</div>
        {holidayName ? <div className="text-[10px] leading-tight text-amber-800">{holidayName}</div> : null}
      </div>
    )
  }

  if (locked) {
    if (template) {
      return (
        <div
          className={`${height} flex flex-col items-center justify-center rounded-lg px-1.5 text-center leading-tight`}
          style={{ backgroundColor: color || '#e2e8f0', color: fg }}
        >
          {holidayName ? (
            <div className="text-[9px] font-semibold text-indigo-700">{holidayName}</div>
          ) : null}
          <div className="text-[11px] font-semibold">{template.name}</div>
          {timeLabel ? <div className="text-[10px] opacity-90">{timeLabel}</div> : null}
        </div>
      )
    }
    return (
      <div
        className={`${height} flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/80 text-[11px] text-slate-400`}
      >
        No shift
      </div>
    )
  }

  const assigned = Boolean(template && value)
  return (
    <div className={`relative ${height}`}>
      <div
        className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center rounded-lg px-1.5 text-center leading-tight ${
          assigned
            ? ''
            : 'border border-dashed border-slate-200 bg-white text-slate-300'
        } ${mismatch ? 'ring-1 ring-amber-500' : ''}`}
        style={assigned ? { backgroundColor: color || '#64748b', color: fg } : undefined}
      >
        {assigned ? (
          <>
            <div className="text-[11px] font-semibold">{template!.name}</div>
            {timeLabel ? <div className="text-[10px] opacity-90">{timeLabel}</div> : null}
          </>
        ) : (
          <span className="text-lg leading-none font-light">+</span>
        )}
      </div>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        title={mismatchTooltip}
        aria-label="Shift"
        className={`absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-lg bg-transparent text-transparent ${
          mismatch ? 'roster-shift-request-mismatch' : ''
        }`}
      >
        <option value="">Off</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  )
}
