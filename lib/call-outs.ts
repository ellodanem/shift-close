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
