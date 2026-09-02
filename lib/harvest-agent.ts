import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export const HARVEST_TASK_PASS = 'pass'
export const HARVEST_TASK_FAIL = 'fail'

const STALE_AFTER_MS = 16 * 60 * 60 * 1000
const OFFLINE_AFTER_MS = 30 * 60 * 60 * 1000

export type HarvestPresence = 'online' | 'stale' | 'offline'

export function harvestAgentSecretOk(request: NextRequest): boolean {
  const secret = request.headers.get('x-agent-secret')
  const expected = process.env.HARVEST_AGENT_SECRET || process.env.AGENT_SECRET
  if (!expected) {
    return process.env.NODE_ENV !== 'production'
  }
  return Boolean(secret) && secret === expected
}

export function harvestPresence(lastHeartbeatAt: Date, now = new Date()): HarvestPresence {
  const age = now.getTime() - lastHeartbeatAt.getTime()
  if (age <= STALE_AFTER_MS) return 'online'
  if (age <= OFFLINE_AFTER_MS) return 'stale'
  return 'offline'
}

let harvestSchemaReady = false

export async function ensureHarvestSchema() {
  if (harvestSchemaReady) return
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "harvest_agents" ADD COLUMN IF NOT EXISTS "paused" BOOLEAN NOT NULL DEFAULT false`
  )
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "harvest_agents" ADD COLUMN IF NOT EXISTS "pause_reason" TEXT`
  )
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "harvest_agents" ADD COLUMN IF NOT EXISTS "paused_at" TIMESTAMPTZ`
  )
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "cstore_name" TEXT`
  )
  harvestSchemaReady = true
}

export async function upsertHarvestHeartbeat(params: {
  agentKey: string
  hostname?: string | null
  version?: string | null
  cstoreSessionOk?: boolean | null
  paused?: boolean | null
  pauseReason?: string | null
  heartbeatAt?: Date
}) {
  const key = params.agentKey.trim()
  if (!key) throw new Error('agentKey is required')

  await ensureHarvestSchema()

  const now = params.heartbeatAt ?? new Date()
  const sessionTouched = typeof params.cstoreSessionOk === 'boolean'
  const pauseTouched = typeof params.paused === 'boolean'

  return prisma.harvestAgent.upsert({
    where: { agentKey: key },
    create: {
      agentKey: key,
      hostname: params.hostname?.trim() || null,
      version: params.version?.trim() || null,
      lastHeartbeatAt: now,
      cstoreSessionOk: sessionTouched ? params.cstoreSessionOk : null,
      cstoreSessionAt: sessionTouched ? now : null,
      paused: pauseTouched ? params.paused === true : false,
      pauseReason: pauseTouched && params.paused ? params.pauseReason?.trim() || null : null,
      pausedAt: pauseTouched && params.paused ? now : null
    },
    update: {
      hostname: params.hostname?.trim() || undefined,
      version: params.version?.trim() || undefined,
      lastHeartbeatAt: now,
      ...(sessionTouched
        ? {
            cstoreSessionOk: params.cstoreSessionOk,
            cstoreSessionAt: now
          }
        : {}),
      ...(pauseTouched
        ? params.paused
          ? {
              paused: true,
              pauseReason: params.pauseReason?.trim() || null,
              pausedAt: now
            }
          : {
              paused: false,
              pauseReason: null,
              pausedAt: null
            }
        : {})
    }
  })
}

export async function recordHarvestTask(params: {
  agentKey: string
  hostname?: string | null
  version?: string | null
  taskKey: string
  status: string
  message?: string | null
  details?: unknown
  startedAt: Date
  finishedAt: Date
  cstoreSessionOk?: boolean | null
  paused?: boolean | null
  pauseReason?: string | null
}) {
  const status = params.status === HARVEST_TASK_PASS ? HARVEST_TASK_PASS : HARVEST_TASK_FAIL
  const pauseFromTask =
    params.taskKey === 'agent_paused' || (typeof params.paused === 'boolean' && params.paused)
  const agent = await upsertHarvestHeartbeat({
    agentKey: params.agentKey,
    hostname: params.hostname,
    version: params.version,
    cstoreSessionOk: params.cstoreSessionOk,
    paused: pauseFromTask ? true : params.paused === false ? false : undefined,
    pauseReason: pauseFromTask
      ? params.pauseReason ||
        (params.details &&
        typeof params.details === 'object' &&
        'pauseReason' in params.details &&
        typeof (params.details as { pauseReason?: string }).pauseReason === 'string'
          ? (params.details as { pauseReason: string }).pauseReason
          : null)
      : params.paused === false
        ? null
        : undefined,
    heartbeatAt: params.finishedAt
  })

  const run = await prisma.harvestTaskRun.create({
    data: {
      agentId: agent.id,
      taskKey: params.taskKey.trim(),
      status,
      message: params.message?.trim() || null,
      details:
        params.details === undefined || params.details === null
          ? undefined
          : (params.details as Prisma.InputJsonValue),
      startedAt: params.startedAt,
      finishedAt: params.finishedAt
    }
  })

  await prisma.harvestAgent.update({
    where: { id: agent.id },
    data: { lastTaskAt: params.finishedAt }
  })

  return { agent, run }
}

export async function listHarvestStatus(taskLimit = 40) {
  const agents = await prisma.harvestAgent.findMany({
    orderBy: { lastHeartbeatAt: 'desc' }
  })
  const tasks = await prisma.harvestTaskRun.findMany({
    orderBy: { finishedAt: 'desc' },
    take: taskLimit,
    include: { agent: { select: { agentKey: true, hostname: true } } }
  })
  const now = new Date()
  return {
    agents: agents.map((a) => ({
      ...a,
      presence: harvestPresence(a.lastHeartbeatAt, now)
    })),
    tasks
  }
}
