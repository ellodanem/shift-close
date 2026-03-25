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
      passwordHash: h1,
      role: 'admin',
      isSuperAdmin: true
    },
    create: {
      username: 'sadmin',
      email: 'ellodanemedia@gmail.com',
      passwordHash: h1,
      role: 'admin',
      isSuperAdmin: true
    }
  })

  await prisma.appUser.upsert({
    where: { username: 'delcock' },
    update: {
      email: 'dane.elrus1@gmail.com',
      passwordHash: h2,
      role: 'stakeholder',
      isSuperAdmin: false
    },
    create: {
      username: 'delcock',
      email: 'dane.elrus1@gmail.com',
      passwordHash: h2,
      role: 'stakeholder',
      isSuperAdmin: false
    }
  })

  console.log('Seeded app users: sadmin (super admin), delcock (stakeholder)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
