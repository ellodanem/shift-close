/**
 * Creates the accountant login if it is missing.
 * Prints a one-time password only when the user is created.
 * Does not reset the password of an existing account.
 */
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'

const USERNAME = 'accountant'
const EMAIL = 'accountant@shift-close.local'

async function main() {
  const existing = await prisma.appUser.findUnique({ where: { username: USERNAME } })
  if (existing) {
    await prisma.appUser.update({
      where: { id: existing.id },
      data: { role: 'accountant', homePath: '/accounting' }
    })
    console.log(`Updated ${USERNAME} to the accountant role. Password was left as it is.`)
    return
  }

  const password = randomBytes(9).toString('base64url')
  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.appUser.create({
    data: {
      username: USERNAME,
      email: EMAIL,
      passwordHash,
      role: 'accountant',
      homePath: '/accounting',
      firstName: 'Accountant',
      lastName: ''
    }
  })
  console.log(`Created ${USERNAME}`)
  console.log(`Password: ${password}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
