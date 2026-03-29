/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const h1 = await bcrypt.hash('shift@758closer', 12)
  const h2 = await bcrypt.hash('welcome@home123', 12)

  await prisma.appUser.upsert({
    where: { username: 'sadmin' },
    update: {
      email: 'ellodanemedia@gmail.com',
      firstName: 'Super',
      lastName: 'Admin',
      passwordHash: h1,
      role: 'admin',
      isSuperAdmin: true
    },
    create: {
      username: 'sadmin',
      email: 'ellodanemedia@gmail.com',
      firstName: 'Super',
      lastName: 'Admin',
      passwordHash: h1,
      role: 'admin',
      isSuperAdmin: true
    }
  })

  await prisma.appUser.upsert({
    where: { username: 'delcock' },
    // Do not set role on update — otherwise every `db seed` resets production/staging roles to stakeholder.
    update: {
      email: 'dane.elrus1@gmail.com',
      firstName: 'Dane',
      lastName: 'Elcock',
      passwordHash: h2
    },
    create: {
      username: 'delcock',
      email: 'dane.elrus1@gmail.com',
      firstName: 'Dane',
      lastName: 'Elcock',
      passwordHash: h2,
      role: 'stakeholder',
      isSuperAdmin: false
    }
  })

  console.log('Seeded app users: sadmin (super admin), delcock (create-only role: stakeholder)')

  /** 2026 St. Lucia public holidays — stationClosed = fully closed (no shifts). Toggle others in Settings → Public holidays. */
  const holidays2026 = [
    { date: '2026-01-01', name: "New Year's Day", stationClosed: false },
    { date: '2026-01-02', name: "New Year's Holiday", stationClosed: false },
    { date: '2026-02-22', name: 'Independence Day', stationClosed: false },
    { date: '2026-04-03', name: 'Good Friday', stationClosed: true },
    { date: '2026-04-06', name: 'Easter Monday', stationClosed: false },
    { date: '2026-05-01', name: 'Labour Day', stationClosed: false },
    { date: '2026-05-25', name: 'Whit Monday', stationClosed: false },
    { date: '2026-06-04', name: 'Corpus Christi', stationClosed: false },
    { date: '2026-08-03', name: 'Emancipation Day', stationClosed: false },
    { date: '2026-10-05', name: 'Thanksgiving Day (first Monday in October)', stationClosed: false },
    { date: '2026-12-13', name: 'National Day (Feast of Saint Lucy)', stationClosed: false },
    { date: '2026-12-14', name: 'National Day Holiday', stationClosed: false },
    { date: '2026-12-25', name: 'Christmas Day', stationClosed: true },
    { date: '2026-12-26', name: 'Boxing Day', stationClosed: false }
  ]

  for (const h of holidays2026) {
    await prisma.publicHoliday.upsert({
      where: {
        public_holiday_date_country: {
          date: h.date,
          countryCode: 'LC'
        }
      },
      update: { name: h.name, stationClosed: h.stationClosed },
      create: {
        date: h.date,
        name: h.name,
        stationClosed: h.stationClosed,
        countryCode: 'LC'
      }
    })
  }
  console.log(`Seeded ${holidays2026.length} St. Lucia public holidays (2026)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
