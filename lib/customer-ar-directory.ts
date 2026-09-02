import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'

export type DirectoryCustomer = {
  id: string
  name: string
  cstoreName: string | null
  active: boolean
  sortOrder: number
}

export function normalizeCustomerKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/\s+/g, ' ')
}

export function matchDirectoryCustomer(
  customers: DirectoryCustomer[],
  cstoreLabel: string
): DirectoryCustomer | null {
  const key = normalizeCustomerKey(cstoreLabel)
  if (!key) return null
  for (const c of customers) {
    const aliases = [c.name, c.cstoreName].filter(Boolean) as string[]
    if (aliases.some((a) => normalizeCustomerKey(a) === key)) return c
  }
  return null
}

export async function collectHistoricalAccountNames(): Promise<string[]> {
  const [fromLedger, fromSnaps, fromPayments] = await Promise.all([
    prisma.customerArLedgerLine.findMany({
      select: { account: true },
      distinct: ['account']
    }),
    prisma.customerArAccountSnapshot.findMany({
      select: { account: true },
      distinct: ['account']
    }),
    prisma.customerArPayment.findMany({
      select: { account: true },
      distinct: ['account']
    })
  ])
  const names = new Set<string>()
  for (const r of [...fromLedger, ...fromSnaps, ...fromPayments]) {
    if (r.account?.trim()) names.add(r.account.trim())
  }
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

export async function seedDirectoryFromHistory(): Promise<number> {
  const names = await collectHistoricalAccountNames()
  let created = 0
  for (const name of names) {
    const existing = await prisma.customerArDirectory.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } }
    })
    if (existing) continue
    await prisma.customerArDirectory.create({
      data: { name, active: true }
    })
    created += 1
  }
  return created
}

export async function ensureDirectorySeeded() {
  const count = await prisma.customerArDirectory.count()
  if (count === 0) {
    await seedDirectoryFromHistory()
  }
}

export async function upsertDirectoryNames(names: string[]) {
  await addMissingDirectoryNames(names)
}

export async function addMissingDirectoryNames(names: string[]) {
  const created: DirectoryCustomer[] = []
  const skipped: string[] = []
  for (const raw of names) {
    const name = raw.trim()
    if (!name || name.toLowerCase() === 'total') continue
    const existing = await prisma.customerArDirectory.findFirst({
      where: {
        OR: [
          { name: { equals: name, mode: 'insensitive' } },
          { cstoreName: { equals: name, mode: 'insensitive' } }
        ]
      }
    })
    if (existing) {
      skipped.push(name)
      continue
    }
    const row = await prisma.customerArDirectory.create({
      data: { name, active: true }
    })
    created.push(row)
  }
  return { created, skipped }
}

export async function listDirectory(includeInactive = true) {
  await ensureDirectorySeeded()
  return prisma.customerArDirectory.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
  })
}

export async function listMonthAccountsFromDirectory(year: number, month: number) {
  await ensureDirectorySeeded()
  const directory = await prisma.customerArDirectory.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
  })

  const snapshots = await prisma.customerArAccountSnapshot.findMany({
    where: { year, month }
  })
  const snapByKey = new Map(
    snapshots.map((s) => [normalizeCustomerKey(s.account), s])
  )

  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const prevSnaps = await prisma.customerArAccountSnapshot.findMany({
    where: { year: prevYear, month: prevMonth }
  })
  const prevByKey = new Map(
    prevSnaps.map((s) => [normalizeCustomerKey(s.account), s])
  )

  const usedSnapIds = new Set<string>()
  const rows: Array<{
    id: string
    account: string
    opening: number
    charges: number
    payments: number
    closing: number
    directoryId: string | null
    cstoreName: string | null
    rolled: boolean
  }> = directory.map((c) => {
    const key = normalizeCustomerKey(c.name)
    const snap = snapByKey.get(key)
    if (snap) {
      usedSnapIds.add(snap.id)
      return {
        id: snap.id,
        account: c.name,
        opening: snap.opening,
        charges: snap.charges,
        payments: snap.payments,
        closing: snap.closing,
        directoryId: c.id,
        cstoreName: c.cstoreName,
        rolled: false
      }
    }
    const prev = prevByKey.get(key)
    const opening = roundMoney(prev?.closing ?? 0)
    return {
      id: `rolled:${c.id}`,
      account: c.name,
      opening,
      charges: 0,
      payments: 0,
      closing: opening,
      directoryId: c.id,
      cstoreName: c.cstoreName,
      rolled: true
    }
  })

  for (const snap of snapshots) {
    if (usedSnapIds.has(snap.id)) continue
    rows.push({
      id: snap.id,
      account: snap.account,
      opening: snap.opening,
      charges: snap.charges,
      payments: snap.payments,
      closing: snap.closing,
      directoryId: null,
      cstoreName: null,
      rolled: false
    })
  }

  rows.sort((a, b) => a.account.localeCompare(b.account, undefined, { sensitivity: 'base' }))
  return rows
}
