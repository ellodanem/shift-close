/**
 * One-off: compare ADMS (device) punches earliest vs latest in DB.
 * Run: npx tsx scripts/analyze-device-punches.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const adms = await prisma.attendanceLog.findMany({
    where: { source: { startsWith: 'adms:' } },
    orderBy: { punchTime: 'asc' },
    select: {
      id: true,
      punchTime: true,
      createdAt: true,
      deviceUserId: true,
      deviceUserName: true,
      staffId: true,
      punchType: true,
      source: true,
      correctedAt: true
    }
  })

  const manual = await prisma.attendanceLog.findMany({
    where: { source: 'manual' },
    orderBy: { punchTime: 'asc' },
    take: 5,
    select: {
      punchTime: true,
      deviceUserId: true,
      staffId: true,
      punchType: true,
      source: true
    }
  })

  const otherSources = await prisma.attendanceLog.groupBy({
    by: ['source'],
    _count: { id: true }
  })

  console.log('=== Source distribution (all attendance_logs) ===')
  for (const r of otherSources.sort((a, b) => b._count.id - a._count.id)) {
    console.log(`${String(r.source).padEnd(24)} ${r._count.id}`)
  }

  console.log(`\n=== ADMS rows (source starts with "adms:"): ${adms.length} total ===`)

  if (adms.length === 0) {
    console.log('No ADMS punches found.')
    await prisma.$disconnect()
    return
  }

  const sampleHead = adms.slice(0, 25)
  const sampleTail = adms.slice(-25)

  const withStaff = adms.filter((r) => r.staffId !== null).length
  const unmapped = adms.length - withStaff

  console.log(`\nLinked to staff (staffId set): ${withStaff}`)
  console.log(`Unmapped (staffId null): ${unmapped}`)

  const snSet = new Set(adms.map((r) => r.source.replace(/^adms:/, '')))
  console.log(`Distinct device serials in source: ${[...snSet].join(', ') || '(none)'}`)

  console.log('\n--- Earliest 25 ADMS punches (by punchTime) ---')
  for (const r of sampleHead) {
    console.log(JSON.stringify(rowSummary(r)))
  }

  console.log('\n--- Latest 25 ADMS punches (by punchTime) ---')
  for (const r of sampleTail) {
    console.log(JSON.stringify(rowSummary(r)))
  }

  console.log('\n--- Sample manual punches (first 5 by punchTime) ---')
  for (const r of manual) {
    console.log(JSON.stringify(r))
  }

  const deviceIdLengths = freq(adms.map((r) => r.deviceUserId.length))
  const punchTypes = freq(adms.map((r) => r.punchType))

  console.log('\n--- ADMS deviceUserId string lengths (frequency) ---')
  console.log(deviceIdLengths)
  console.log('--- ADMS punchType (frequency) ---')
  console.log(punchTypes)

  const early = adms.slice(0, Math.min(50, adms.length))
  const late = adms.slice(-Math.min(50, adms.length))
  console.log('\n--- Early chunk staffId null % ---', pctNullStaff(early))
  console.log('--- Late chunk staffId null % ---', pctNullStaff(late))
}

function rowSummary(r: {
  punchTime: Date
  createdAt: Date
  deviceUserId: string
  deviceUserName: string | null
  staffId: string | null
  punchType: string
  source: string
  correctedAt: Date | null
}) {
  return {
    punchTime: r.punchTime.toISOString(),
    createdAt: r.createdAt.toISOString(),
    deviceUserId: r.deviceUserId,
    deviceUserName: r.deviceUserName,
    staffId: r.staffId ? `${r.staffId.slice(0, 8)}…` : null,
    punchType: r.punchType,
    source: r.source,
    correctedAt: r.correctedAt?.toISOString() ?? null,
    lagMsCreatedMinusPunch: r.createdAt.getTime() - r.punchTime.getTime()
  }
}

function freq<T extends string | number>(arr: T[]): Record<string, number> {
  const o: Record<string, number> = {}
  for (const x of arr) {
    const k = String(x)
    o[k] = (o[k] ?? 0) + 1
  }
  return o
}

function pctNullStaff(rows: { staffId: string | null }[]): string {
  if (rows.length === 0) return 'n/a'
  const n = rows.filter((r) => r.staffId === null).length
  return `${((100 * n) / rows.length).toFixed(1)}% (${n}/${rows.length})`
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
