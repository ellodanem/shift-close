'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

type Align = 'left' | 'right'

const triggerClass =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm transition hover:bg-slate-50 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40'

/** Square icon button that opens a list; use for “pick then act” menus (e.g. open scan). */
export function IconMenu({
  ariaLabel,
  title,
  icon,
  options,
  disabled,
  emptyHint,
  onPick,
  align = 'left',
  triggerClassName,
  /** When true, trigger stays enabled with no files (show empty hint + optional footer). */
  allowEmptyOpen,
  onDelete,
  footer
}: {
  ariaLabel: string
  title?: string
  icon: ReactNode
  options: { value: string; label: string }[]
  disabled?: boolean
  emptyHint?: string
  onPick: (value: string, label: string) => void
  align?: Align
  /** Extra classes for the square trigger (e.g. tinted border/background). */
  triggerClassName?: string
  allowEmptyOpen?: boolean
  onDelete?: (value: string) => void
  footer?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const fn = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [open])

  useEffect(() => {
    if (!open) return
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [open])

  const empty = options.length === 0
  const disabledFinal = Boolean(disabled) || (empty && !allowEmptyOpen)

  return (
    <div className="relative inline-block" ref={wrap}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabledFinal}
        title={disabledFinal ? emptyHint ?? 'Nothing to choose' : title ?? ariaLabel}
        onClick={() => !disabledFinal && setOpen((o) => !o)}
        className={`${triggerClass} ${open ? 'ring-2 ring-blue-500 ring-offset-1' : ''} ${triggerClassName ?? ''}`}
      >
        {icon}
      </button>
      {open && !disabledFinal && (
        <ul
          role="listbox"
          className={`absolute z-50 mt-1 max-h-72 min-w-[16rem] overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {empty ? (
            <li className="px-3 py-2 text-sm text-slate-500">{emptyHint ?? 'No items'}</li>
          ) : (
            options.map((o) => (
              <li key={o.value} role="option" className="flex items-stretch border-b border-slate-50 last:border-0">
                <button
                  type="button"
                  className="min-w-0 flex-1 px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                  onClick={() => {
                    onPick(o.value, o.label)
                    setOpen(false)
                  }}
                >
                  <span className="break-all">{o.label}</span>
                </button>
                {onDelete ? (
                  <button
                    type="button"
                    className="shrink-0 px-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                    aria-label="Delete file"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(o.value)
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </li>
            ))
          )}
          {footer ? <li className="border-t border-slate-100 px-2 py-2">{footer}</li> : null}
        </ul>
      )}
    </div>
  )
}

/** Square icon button showing current choice; opens list to change (replaces a full-width native select). */
export function IconSelect<T extends string>({
  ariaLabel,
  value,
  onChange,
  options,
  renderTrigger,
  disabled,
  align = 'left'
}: {
  ariaLabel: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  renderTrigger: (ctx: { value: T; label: string }) => ReactNode
  disabled?: boolean
  align?: Align
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const fn = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [open])

  useEffect(() => {
    if (!open) return
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [open])

  return (
    <div className="relative inline-block" ref={wrap}>
      <button
        type="button"
        aria-label={`${ariaLabel}: ${current?.label ?? value}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        title={current?.label}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`${triggerClass} ${open ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
      >
        {renderTrigger({ value: current.value, label: current.label })}
      </button>
      {open && !disabled && (
        <ul
          role="listbox"
          className={`absolute z-50 mt-1 max-h-60 min-w-[10rem] overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {options.map((o) => (
            <li key={String(o.value)} role="option">
              <button
                type="button"
                className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                  o.value === value ? 'bg-blue-50 font-medium text-blue-900' : 'text-slate-800'
                }`}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* —— inline icons (no extra deps) —— */

export function IconCalendar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-slate-700" aria-hidden>
      <path
        d="M8 2v3M16 2v3M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconDepositSlip({ className = 'text-slate-700' }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

export function IconDebitCard({ className = 'text-slate-700' }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M2 10h20" stroke="currentColor" strokeWidth="1.75" />
      <path d="M6 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconShield({ className = 'text-violet-700' }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 3l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V7l8-4z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconFilter() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-slate-700" aria-hidden>
      <path
        d="M4 6h16M7 12h10M10 18h4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconLayers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-slate-700" aria-hidden>
      <path
        d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconRepeat() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-slate-700" aria-hidden>
      <path
        d="M17 1v6h6M7 23v-6H1M1 17a8 8 0 0113.3-5.3L17 14M23 7a8 8 0 01-13.3 5.3L7 10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function BankStatusGlyph({ status }: { status: 'pending' | 'cleared' | 'discrepancy' }) {
  if (status === 'cleared') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-emerald-700" aria-hidden>
        <path
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (status === 'discrepancy') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-amber-700" aria-hidden>
        <path
          d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-slate-600" aria-hidden>
      <path
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
