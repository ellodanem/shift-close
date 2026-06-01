import type { ReactNode } from 'react'

type FormAccent = 'amber' | 'blue' | 'rose' | 'teal' | 'slate'

const formAccentBar: Record<FormAccent, string> = {
  amber: 'bg-amber-500',
  blue: 'bg-blue-600',
  rose: 'bg-rose-600',
  teal: 'bg-teal-600',
  slate: 'bg-slate-500'
}

/** Heading inside a white form card (add / set actions). */
export function TimeOffFormHeading({
  children,
  accent = 'slate'
}: {
  children: ReactNode
  accent?: FormAccent
}) {
  return (
    <div className="mb-4 flex items-center gap-2.5 border-b border-slate-100 pb-3">
      <span className={`h-5 w-1 shrink-0 rounded-full ${formAccentBar[accent]}`} aria-hidden />
      <h2 className="text-base font-semibold text-slate-900">{children}</h2>
    </div>
  )
}

/** Heading above a list or table on the page background. */
export function TimeOffListHeading({
  children,
  count
}: {
  children: ReactNode
  count?: number
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">{children}</h2>
      {count !== undefined ? (
        <span className="shrink-0 rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
          {count}
        </span>
      ) : null}
    </div>
  )
}

/** Subheading for grouped list blocks (e.g. call outs by day). */
export function TimeOffDayHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">{children}</h3>
  )
}
