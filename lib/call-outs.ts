import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import {
  isFullAccessRole,
  isOperationsManagerRole,
  isSupervisorLike,
  normalizeAppRole
} from '@/lib/roles'
import { getSessionFromRequest, type SessionPayload } from '@/lib/session'

/** Supervisor tier and above may log call outs (not stakeholder). */
export function canLogCallOut(role: string): boolean {
  const r = normalizeAppRole(role)
  if (r === 'stakeholder') return false
  return isFullAccessRole(role) || isOperationsManagerRole(role) || isSupervisorLike(role)
}

/** Normalize date to YYYY-MM-DD (accepts YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY). */
export function normalizeCallOutDate(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const ddmmyyyy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`
  }
  return null
}

export type SickLeaveSpan = {
  staffId: string
  startDate: string
  endDate: string
  status: string
}

export function sickLeaveCoversDate(leave: SickLeaveSpan, date: string): boolean {
  return leave.status !== 'denied' && leave.startDate <= date && leave.endDate >= date
}

export type CalledAtParts = { date: string; time: string }

export const EMPTY_CALLED_AT_PARTS: CalledAtParts = { date: '', time: '' }

/** 15-minute steps for optional "called at" time select (local wall clock). */
export const CALL_OUT_TIME_SELECT_OPTIONS: { value: string; label: string }[] = (() => {
  const out: { value: string; label: string }[] = [{ value: '', label: '— Time —' }]
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) {
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      const hour12 = h % 12 === 0 ? 12 : h % 12
      const ap = h < 12 ? 'AM' : 'PM'
      const label = `${hour12}:${String(m).padStart(2, '0')} ${ap}`
      out.push({ value, label })
    }
  }
  return out
})()

export function splitCalledAtToParts(iso: string | Date): CalledAtParts {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return { ...EMPTY_CALLED_AT_PARTS }
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
}

/** Round minutes to nearest 15 for select matching. */
export function snapCalledAtTimeToSelect(time: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!m) return ''
  let h = Math.min(23, Math.max(0, parseInt(m[1], 10)))
  const min = parseInt(m[2], 10)
  const snapped = Math.min(45, Math.round(min / 15) * 15)
  return `${String(h).padStart(2, '0')}:${String(snapped).padStart(2, '0')}`
}

export function defaultCalledAtPartsNow(): CalledAtParts {
  const raw = splitCalledAtToParts(new Date())
  return { date: raw.date, time: snapCalledAtTimeToSelect(raw.time) }
}

/** ISO instant for API, or null when cleared / incomplete (server uses "now"). */
export function combineCalledAtParts(parts: CalledAtParts): string | null {
  const date = parts.date.trim()
  const time = parts.time.trim()
  if (!date && !time) return null
  if (!date || !time) return null
  const instant = new Date(`${date}T${time}:00`)
  if (Number.isNaN(instant.getTime())) return null
  return instant.toISOString()
}

export function formatCalledAtLocal(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function buildCallOutTooltip(params: {
  calledAt: string | Date
  notes?: string | null
  recordedByLabel?: string | null
  sickLeaveOverlap?: boolean
}): string {
  const parts: string[] = [`Called ${formatCalledAtLocal(params.calledAt)}`]
  if (params.notes?.trim()) parts.push(params.notes.trim())
  if (params.recordedByLabel) parts.push(`Logged by ${params.recordedByLabel}`)
  if (params.sickLeaveOverlap) parts.push('Sick leave also covers this day')
  return parts.join(' · ')
}

export async function requireCallOutWrite(
  request: NextRequest
): Promise<{ session: SessionPayload } | NextResponse> {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canLogCallOut(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return { session }
}
