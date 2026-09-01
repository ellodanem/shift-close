import {
  isQuietHours,
  isQuietHoursMorningRestore,
  secondsUntilQuietHoursEnd
} from './datetime-policy'

/** Daytime getrequest poll (seconds). Quiet-hours Delay is computed separately. */
export const DEFAULT_ICLOCK_DELAY_SECONDS = 300
const DAYTIME_DELAY_MAX = 600
const QUIET_DELAY_MAX = 8 * 60 * 60

export function parseBoundedIntEnv(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (raw === undefined || String(raw).trim() === '') return fallback
  const n = parseInt(String(raw).trim(), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export function daytimeIclockDelaySeconds(): number {
  return parseBoundedIntEnv(
    process.env.ZK_ICLOCK_DELAY_SECONDS,
    DEFAULT_ICLOCK_DELAY_SECONDS,
    30,
    DAYTIME_DELAY_MAX
  )
}

/** Delay to advertise on handshake / getrequest: long sleep overnight, 5 min by day. */
export function iclockPollDelaySeconds(now = new Date()): number {
  if (isQuietHours(now)) {
    return Math.min(QUIET_DELAY_MAX, secondsUntilQuietHoursEnd(now))
  }
  return daytimeIclockDelaySeconds()
}

export function buildGetrequestBody(now = new Date()): { body: string; delay: number | null } {
  if (isQuietHours(now) || isQuietHoursMorningRestore(now)) {
    const delay = iclockPollDelaySeconds(now)
    const id = Date.now()
    return {
      body: `C:${id}:DATA UPDATE OPTIONS Delay=${delay}\r\n`,
      delay
    }
  }
  return { body: 'OK', delay: null }
}
