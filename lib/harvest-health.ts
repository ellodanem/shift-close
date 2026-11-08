import { prisma } from '@/lib/prisma'
import { ensureHarvestSchema, harvestPresence } from '@/lib/harvest-agent'

/** Customer account data older than this is flagged as stale. */
export const CUSTOMER_SYNC_STALE_HOURS = 24

export type HarvestHealthLevel = 'ok' | 'warn' | 'error'

export type HarvestHealth = {
  level: HarvestHealthLevel
  /** Short, user-facing explanation. Null when everything is fine. */
  message: string | null
  agentKnown: boolean
  agentOnline: boolean
  agentPaused: boolean
  pauseReason: string | null
  pausedAt: string | null
  /** Last time a customer_accounts sync finished with a pass. */
  lastCustomerSyncAt: string | null
  customerSyncStale: boolean
}

const PAUSE_REASON_TEXT: Record<string, string> = {
  cloudflare_pending:
    'Cloudflare "Verify you are human" was not completed in the Cstore browser',
  cstore_login_failed: 'the Cstore login failed'
}

export function describePauseReason(reason: string | null): string {
  if (!reason) return 'the agent was paused'
  return PAUSE_REASON_TEXT[reason] ?? reason.replace(/_/g, ' ')
}

export function formatAge(from: Date, now = new Date()): string {
  const hours = Math.max(0, (now.getTime() - from.getTime()) / 3_600_000)
  if (hours < 1) return 'less than an hour'
  if (hours < 48) {
    const h = Math.floor(hours)
    return `${h} hour${h === 1 ? '' : 's'}`
  }
  const d = Math.floor(hours / 24)
  return `${d} days`
}

export async function getHarvestHealth(now = new Date()): Promise<HarvestHealth> {
  await ensureHarvestSchema()

  const [agents, lastPass] = await Promise.all([
    prisma.harvestAgent.findMany({ orderBy: { lastHeartbeatAt: 'desc' } }),
    prisma.harvestTaskRun.findFirst({
      where: { taskKey: 'customer_accounts', status: 'pass' },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true }
    })
  ])

  const online = agents.filter((a) => harvestPresence(a.lastHeartbeatAt, now) === 'online')
  const paused = online.length > 0 && online.every((a) => a.paused)
  const pausedAgent = paused ? online.find((a) => a.paused) : undefined

  const lastCustomerSync = lastPass?.finishedAt ?? null
  const staleCutoff = now.getTime() - CUSTOMER_SYNC_STALE_HOURS * 3_600_000
  const customerSyncStale =
    agents.length > 0 && (!lastCustomerSync || lastCustomerSync.getTime() < staleCutoff)

  let level: HarvestHealthLevel = 'ok'
  let message: string | null = null

  if (agents.length === 0) {
    level = 'ok'
  } else if (paused) {
    level = 'error'
    const since = pausedAgent?.pausedAt ? ` for ${formatAge(pausedAgent.pausedAt, now)}` : ''
    message =
      `Cstore sync is paused${since}: ${describePauseReason(pausedAgent?.pauseReason ?? null)}. ` +
      'Customer balances here may be out of date. Open the harvest agent on the PC, complete the check, then click Resume.'
  } else if (online.length === 0) {
    level = 'error'
    message =
      'The harvest agent is offline, so Cstore data is not syncing. Customer balances here may be out of date.'
  } else if (customerSyncStale) {
    level = 'warn'
    message = lastCustomerSync
      ? `Customer accounts have not synced from Cstore for ${formatAge(lastCustomerSync, now)}. Balances may be out of date.`
      : 'Customer accounts have never synced from Cstore.'
  }

  return {
    level,
    message,
    agentKnown: agents.length > 0,
    agentOnline: online.length > 0,
    agentPaused: paused,
    pauseReason: pausedAgent?.pauseReason ?? null,
    pausedAt: pausedAgent?.pausedAt ? pausedAgent.pausedAt.toISOString() : null,
    lastCustomerSyncAt: lastCustomerSync ? lastCustomerSync.toISOString() : null,
    customerSyncStale
  }
}
