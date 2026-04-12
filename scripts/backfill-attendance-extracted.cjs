/**
 * After migration adds extracted_at / extracted_pay_period_id, backfill from existing PayPeriod rows:
 * for each period in createdAt order, mark non-extracted logs whose punch_time falls in [startDate, endDate]
 * (station TZ, same rules as live extraction).
 *
 * Usage: node scripts/backfill-attendance-extracted.cjs
 * Requires: DATABASE_URL, optional .env / .env.local
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') })

const { PrismaClient } = require('@prisma/client')
const { fromZonedTime, formatInTimeZone } = require('date-fns-tz')

const EOD_TZ_KEY = 'eod_email_timezone'

function addCalendarYmd(ymd, delta, tz) {
  const anchor = fromZonedTime(`${ymd}T12:00:00`, tz)
  const next = new Date(anchor.getTime() + delta * 24 * 60 * 60 * 1000)
  return formatInTimeZone(next, tz, 'yyyy-MM-dd')
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.')
    process.exit(1)
  }
  const prisma = new PrismaClient()
  try {
    const tzRow = await prisma.appSettings.findUnique({ where: { key: EOD_TZ_KEY } })
    const tz =
      tzRow?.value?.trim() || process.env.EOD_EMAIL_TIMEZONE?.trim() || 'America/St_Lucia'

    const periods = await prisma.payPeriod.findMany({ orderBy: { createdAt: 'asc' } })
    if (periods.length === 0) {
      console.log('No pay periods to backfill.')
      return
    }

    let total = 0
    for (const p of periods) {
      const gte = fromZonedTime(`${p.startDate}T00:00:00`, tz)
      const lt = fromZonedTime(`${addCalendarYmd(p.endDate, 1, tz)}T00:00:00`, tz)
      const r = await prisma.attendanceLog.updateMany({
        where: {
          extractedAt: null,
          punchTime: { gte, lt }
        },
        data: {
          extractedAt: p.createdAt,
          extractedPayPeriodId: p.id
        }
      })
      total += r.count
      console.log(
        `Pay period ${p.id} (${p.startDate} … ${p.endDate}): marked ${r.count} punch(es) as extracted.`
      )
    }
    console.log(`Done. Total rows updated: ${total}.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
