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

export async function upsertHarvestHeartbeat(params: {
  agentKey: string
  hostname?: string | null
  version?: string | null
  cstoreSessionOk?: boolean | null
  heartbeatAt?: Date
}) {
  const key = params.agentKey.trim()
  if (!key) throw new Error('agentKey is required')

  const now = params.heartbeatAt ?? new Date()
  const sessionTouched = typeof params.cstoreSessionOk === 'boolean'

  return prisma.harvestAgent.upsert({
    where: { agentKey: key },
    create: {
      agentKey: key,
      hostname: params.hostname?.trim() || null,
      version: params.version?.trim() || null,
      lastHeartbeatAt: now,
      cstoreSessionOk: sessionTouched ? params.cstoreSessionOk : null,
      cstoreSessionAt: sessionTouched ? now : null
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
}) {
  const status = params.status === HARVEST_TASK_PASS ? HARVEST_TASK_PASS : HARVEST_TASK_FAIL
  const agent = await upsertHarvestHeartbeat({
    agentKey: params.agentKey,
    hostname: params.hostname,
    version: params.version,
    cstoreSessionOk: params.cstoreSessionOk,
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
