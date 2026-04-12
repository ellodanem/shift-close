/**
 * Deletes every saved Pay Period Report row (PayPeriod). Attendance will list all punches
 * until a new report is filed. For local/ops only.
 *
 * Usage (from repo root): node scripts/delete-all-pay-periods.cjs
 * Requires: DATABASE_URL in .env / .env.local (same as Prisma).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') })

const { PrismaClient } = require('@prisma/client')

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Add it to .env or .env.local.')
    process.exit(1)
  }
  const prisma = new PrismaClient()
  try {
    const r = await prisma.payPeriod.deleteMany({})
    console.log(`Deleted ${r.count} pay period report(s).`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
