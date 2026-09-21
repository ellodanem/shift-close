/** Command-poll interval advertised on handshake (seconds). */
export const DEFAULT_ICLOCK_DELAY_SECONDS = 300
const DAYTIME_DELAY_MAX = 600

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

/**
 * Delay advertised on the cdata handshake only. Always the daytime interval
 * (default 300s). Do not send a fresh `DATA UPDATE OPTIONS` command on every
 * getrequest — ZKTeco treats each command as “poll again immediately,” which
 * turns overnight Delay=until-5:30am into a tight invocation loop.
 */
export function iclockPollDelaySeconds(_now = new Date()): number {
  return daytimeIclockDelaySeconds()
}

/** getrequest: OK means no pending command, wait for the handshake Delay. */
export function buildGetrequestBody(_now = new Date()): { body: string; delay: number | null } {
  return { body: 'OK', delay: null }
}
