import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const migrations = await prisma.$queryRaw<
    {
      migration_name: string
      finished_at: Date | null
      rolled_back_at: Date | null
      started_at: Date
      logs: string | null
    }[]
  >`
    SELECT migration_name, finished_at, rolled_back_at, started_at, logs
    FROM _prisma_migrations
    WHERE migration_name LIKE '202606%'
    ORDER BY started_at
  `
  console.log('Recent migrations:', JSON.stringify(migrations, null, 2))

  const vendorCols = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vendors'
      AND column_name IN ('is_vat_registered', 'vat_rate')
  `
  console.log('Vendor VAT columns:', vendorCols.map((c) => c.column_name))

  const slipCol = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'missing_deposit_slip_alerts'
      AND column_name = 'slip_unavailable_reason'
  `
  console.log('Slip unavailable column:', slipCol.map((c) => c.column_name))

  const pending = await prisma.$queryRaw<
    { migration_name: string; finished_at: Date | null }[]
  >`
    SELECT migration_name, finished_at
    FROM _prisma_migrations
    WHERE finished_at IS NULL AND rolled_back_at IS NULL
    ORDER BY started_at
  `
  console.log('Pending/failed migrations:', pending)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => void prisma.$disconnect())
