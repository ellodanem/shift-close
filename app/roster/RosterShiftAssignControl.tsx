'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  const assigned = Boolean(template && value)
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const canPick = !locked && !onVacation && !onSickLeave && !stationClosed && !disabled

  useLayoutEffect(() => {
    if (!open || !canPick) {
      setMenuPos(null)
      return
    }
    const el = triggerRef.current
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      const width = Math.min(Math.max(r.width, 220), window.innerWidth - 16)
      let left = r.left
      if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8)
      if (left < 8) left = 8
      const maxH = 288
      const spaceBelow = window.innerHeight - r.bottom - 8
      const spaceAbove = r.top - 8
      const openDown = spaceBelow >= Math.min(maxH, 160) || spaceBelow >= spaceAbove
      const top = openDown ? r.bottom + 4 : Math.max(8, r.top - Math.min(maxH, spaceAbove) - 4)
      setMenuPos({ top, left, width })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, canPick])

  useEffect(() => {
    if (!open || !canPick) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, canPick])

  useEffect(() => {
    if (!canPick && open) setOpen(false)
  }, [canPick, open])

  const pick = (id: string | null) => {
    onChange(id)
    setOpen(false)
  }

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

  return (
    <div className={`relative ${height}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        title={mismatchTooltip}
        aria-label="Shift"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (!disabled) setOpen((o) => !o)
        }}
        className={`flex h-full w-full flex-col items-center justify-center rounded-lg px-1.5 text-center leading-tight ${
          assigned ? '' : 'border border-dashed border-slate-200 bg-white text-slate-300'
        } ${mismatch ? 'ring-1 ring-amber-500 roster-shift-request-mismatch' : ''} ${
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
        } ${open ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
        style={assigned ? { backgroundColor: color || '#64748b', color: fg } : undefined}
      >
        {assigned ? (
          <>
            <div className="text-[11px] font-semibold">{template!.name}</div>
            {timeLabel ? <div className="text-[10px] opacity-90">{timeLabel}</div> : null}
          </>
        ) : (
          <span className="text-lg font-light leading-none">+</span>
        )}
      </button>
      {open && menuPos
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              aria-label="Shift"
              style={{
                position: 'fixed',
                top: menuPos.top,
                left: menuPos.left,
                width: menuPos.width,
                zIndex: 80
              }}
              className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
            >
              <button
                type="button"
                role="option"
                aria-selected={!assigned}
                className={`flex w-full items-center px-2.5 py-1.5 text-left text-xs hover:bg-slate-50 ${
                  !assigned ? 'bg-slate-50 font-medium text-slate-900' : 'text-slate-700'
                }`}
                onClick={() => pick(null)}
              >
                Off
              </button>
              {templates.map((t) => {
                const selected = value === t.id
                const tColor = t.color || '#64748b'
                const time =
                  t.startTime || t.endTime ? `${formatHm(t.startTime)}–${formatHm(t.endTime)}` : ''
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-slate-50 ${
                      selected ? 'bg-blue-50 font-medium text-blue-900' : 'text-slate-800'
                    }`}
                    onClick={() => pick(t.id)}
                  >
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-sm border border-black/10"
                      style={{ backgroundColor: tColor }}
                    />
                    <span className="min-w-0 flex-1 truncate font-semibold">{t.name}</span>
                    {time ? (
                      <span className="shrink-0 text-[10px] font-normal tabular-nums text-slate-500">{time}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
