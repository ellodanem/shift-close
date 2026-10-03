import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { businessTodayYmd } from '@/lib/datetime-policy'
import { ensureHarvestSchema, harvestPresence, upsertHarvestHeartbeat } from '@/lib/harvest-agent'

export const HARVEST_SYNC_STEPS = [
  { taskKey: 'customer_accounts', label: 'Customer accounts' },
  { taskKey: 'vendor_invoices', label: 'Vendor invoices' },
  { taskKey: 'fuel_invoices', label: 'Fuel invoices' },
  { taskKey: 'lpg_invoices', label: 'LPG invoices' }
] as const

export type HarvestSyncTaskKey = (typeof HARVEST_SYNC_STEPS)[number]['taskKey']

const TASK_KEYS = new Set<string>(HARVEST_SYNC_STEPS.map((step) => step.taskKey))

export function isHarvestSyncTaskKey(value: string): value is HarvestSyncTaskKey {
  return TASK_KEYS.has(value)
}

export function harvestSyncMonthLabel(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1, 12))
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function currentHarvestSyncMonth(now = new Date()): { year: number; month: number } {
  const ymd = businessTodayYmd(now)
  return { year: Number(ymd.slice(0, 4)), month: Number(ymd.slice(5, 7)) }
}

export class HarvestSyncActiveError extends Error {
  constructor() {
    super('A sync is already waiting or running')
    this.name = 'HarvestSyncActiveError'
  }
}

type StepRow = {
  id: string
  position: number
  taskKey: string
  status: string
  message: string | null
  startedAt: Date | null
  finishedAt: Date | null
}

type RunRow = {
  id: string
  year: number
  month: number
  status: string
  claimedAt: Date | null
  finishedAt: Date | null
  createdAt: Date
  steps: StepRow[]
}

const runInclude = { steps: { orderBy: { position: 'asc' as const } } }

function stepLabel(taskKey: string): string {
  return HARVEST_SYNC_STEPS.find((step) => step.taskKey === taskKey)?.label ?? taskKey
}

export function serializeHarvestSyncRun(run: RunRow) {
  return {
    id: run.id,
    year: run.year,
    month: run.month,
    label: harvestSyncMonthLabel(run.year, run.month),
    status: run.status,
    claimedAt: run.claimedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    steps: [...run.steps]
      .sort((a, b) => a.position - b.position)
      .map((step) => ({
        taskKey: step.taskKey,
        label: stepLabel(step.taskKey),
        position: step.position,
        status: step.status,
        message: step.message,
        startedAt: step.startedAt?.toISOString() ?? null,
        finishedAt: step.finishedAt?.toISOString() ?? null
      }))
  }
}

function trimMessage(message: string | null | undefined): string | null {
  if (typeof message !== 'string') return null
  const trimmed = message.trim()
  if (!trimmed) return null
  return trimmed.slice(0, 2000)
}

export async function createHarvestSyncRun(input?: { year?: number; month?: number }) {
  await ensureHarvestSchema()
  const current = currentHarvestSyncMonth()
  const year = input?.year ?? current.year
  const month = input?.month ?? current.month
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error('Year is out of range')
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Month is out of range')
  }

  try {
    const run = await prisma.$transaction(async (tx) => {
      const active = await tx.harvestSyncRun.findFirst({
        where: { status: { in: ['pending', 'running'] } }
      })
      if (active) throw new HarvestSyncActiveError()
      return tx.harvestSyncRun.create({
        data: {
          year,
          month,
          status: 'pending',
          steps: {
            create: HARVEST_SYNC_STEPS.map((step, position) => ({
              position,
              taskKey: step.taskKey,
              status: 'waiting'
            }))
          }
        },
        include: runInclude
      })
    })
    return serializeHarvestSyncRun(run)
  } catch (error) {
    if (error instanceof HarvestSyncActiveError) throw error
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HarvestSyncActiveError()
    }
    throw error
  }
}

export async function getHarvestSyncView() {
  await ensureHarvestSchema()
  const now = new Date()
  const month = currentHarvestSyncMonth(now)
  const [agents, active, latest] = await Promise.all([
    prisma.harvestAgent.findMany({ orderBy: { lastHeartbeatAt: 'desc' } }),
    prisma.harvestSyncRun.findFirst({
      where: { status: { in: ['pending', 'running'] } },
      orderBy: { createdAt: 'asc' },
      include: runInclude
    }),
    prisma.harvestSyncRun.findFirst({
      orderBy: { createdAt: 'desc' },
      include: runInclude
    })
  ])
  const online = agents.filter((agent) => harvestPresence(agent.lastHeartbeatAt, now) === 'online')
  const run = active ?? latest
  return {
    month: { ...month, label: harvestSyncMonthLabel(month.year, month.month) },
    run: run ? serializeHarvestSyncRun(run) : null,
    agentOnline: online.length > 0,
    agentPaused: online.length > 0 && online.every((agent) => agent.paused)
  }
}

export async function claimHarvestSyncRun(params: {
  agentKey: string
  hostname?: string | null
  version?: string | null
}) {
  await ensureHarvestSchema()
  const agent = await upsertHarvestHeartbeat({
    agentKey: params.agentKey,
    hostname: params.hostname,
    version: params.version
  })

  const own = await prisma.harvestSyncRun.findFirst({
    where: { status: 'running', agentId: agent.id },
    include: runInclude
  })
  if (own) return { run: serializeHarvestSyncRun(own), busy: false }

  const other = await prisma.harvestSyncRun.findFirst({
    where: { status: 'running' }
  })
  if (other) return { run: null, busy: true }

  const pending = await prisma.harvestSyncRun.findFirst({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' }
  })
  if (!pending) return { run: null, busy: false }

  const updated = await prisma.harvestSyncRun.updateMany({
    where: { id: pending.id, status: 'pending' },
    data: { status: 'running', agentId: agent.id, claimedAt: new Date() }
  })
  if (updated.count === 0) return { run: null, busy: true }

  const run = await prisma.harvestSyncRun.findUnique({
    where: { id: pending.id },
    include: runInclude
  })
  return { run: run ? serializeHarvestSyncRun(run) : null, busy: !run }
}

export async function reportHarvestSyncStep(params: {
  agentKey: string
  hostname?: string | null
  version?: string | null
  runId: string
  taskKey: string
  status: string
  message?: string | null
}) {
  await ensureHarvestSchema()
  if (!isHarvestSyncTaskKey(params.taskKey)) {
    throw new Error('Unknown sync step')
  }
  if (!['running', 'pass', 'fail', 'paused'].includes(params.status)) {
    throw new Error('Unknown step status')
  }

  const agent = await upsertHarvestHeartbeat({
    agentKey: params.agentKey,
    hostname: params.hostname,
    version: params.version
  })
  const run = await prisma.harvestSyncRun.findFirst({
    where: { id: params.runId, agentId: agent.id },
    include: runInclude
  })
  if (!run || (run.status !== 'running' && run.status !== 'paused')) {
    throw new Error('Sync run is not active for this agent')
  }
  if (run.status === 'paused') return serializeHarvestSyncRun(run)

  const step = run.steps.find((row) => row.taskKey === params.taskKey)
  if (!step) throw new Error('Sync step not found')

  const now = new Date()
  const message = trimMessage(params.message)

  if (params.status === 'running') {
    if (step.status !== 'pass' && step.status !== 'fail') {
      await prisma.harvestSyncStep.update({
        where: { id: step.id },
        data: { status: 'running', message, startedAt: step.startedAt ?? now }
      })
    }
  } else if (params.status === 'paused') {
    await prisma.$transaction([
      prisma.harvestSyncStep.update({
        where: { id: step.id },
        data: {
          status: 'fail',
          message: message ?? 'Paused',
          startedAt: step.startedAt ?? now,
          finishedAt: now
        }
      }),
      prisma.harvestSyncRun.update({
        where: { id: run.id },
        data: { status: 'paused', finishedAt: now }
      })
    ])
  } else {
    await prisma.harvestSyncStep.update({
      where: { id: step.id },
      data: {
        status: params.status,
        message,
        startedAt: step.startedAt ?? now,
        finishedAt: now
      }
    })
    const steps = await prisma.harvestSyncStep.findMany({ where: { runId: run.id } })
    if (steps.every((row) => row.status === 'pass' || row.status === 'fail')) {
      await prisma.harvestSyncRun.update({
        where: { id: run.id },
        data: {
          status: steps.some((row) => row.status === 'fail') ? 'fail' : 'pass',
          finishedAt: now
        }
      })
    }
  }

  const fresh = await prisma.harvestSyncRun.findUnique({
    where: { id: run.id },
    include: runInclude
  })
  if (!fresh) throw new Error('Sync run disappeared')
  return serializeHarvestSyncRun(fresh)
}
