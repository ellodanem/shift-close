import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'
import {
  TRANSFER_CATEGORY_NAME,
  cashbookAccountLabel,
  type CashbookAccount
} from '@/lib/cashbook-accounts'

export class TransferInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TransferInputError'
  }
}

/** Transfers are neither income nor expense, so they get their own category type. */
export async function getOrCreateTransferCategory() {
  let cat = await prisma.cashbookCategory.findFirst({
    where: { name: { equals: TRANSFER_CATEGORY_NAME, mode: 'insensitive' }, type: 'other' }
  })
  if (!cat) {
    cat = await prisma.cashbookCategory.create({
      data: { name: TRANSFER_CATEGORY_NAME, code: null, type: 'other', sortOrder: 0, active: true }
    })
  }
  return cat
}

export type TransferInput = {
  date: string
  amount: number
  from: CashbookAccount
  to: CashbookAccount
  ref?: string | null
  description?: string | null
}

/** Money leaves one account and arrives in the other: two linked lines that never count as income or expense. */
export async function createTransfer(input: TransferInput): Promise<{ groupId: string; entryIds: string[] }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new TransferInputError('A valid date is required')
  const amount = roundMoney(Math.abs(Number(input.amount)))
  if (!(amount > 0)) throw new TransferInputError('Amount must be greater than zero')
  if (input.from === input.to) throw new TransferInputError('Choose two different accounts')

  const category = await getOrCreateTransferCategory()
  const groupId = randomUUID()
  const ref = input.ref?.trim() || null
  const note = input.description?.trim()
  const outLabel = `Transfer to ${cashbookAccountLabel(input.to)}${note ? ` – ${note}` : ''}`
  const inLabel = `Transfer from ${cashbookAccountLabel(input.from)}${note ? ` – ${note}` : ''}`

  const [out, inn] = await prisma.$transaction([
    prisma.cashbookEntry.create({
      data: {
        date: input.date,
        ref,
        description: outLabel,
        debitEcard: amount,
        paymentMethod: 'eft',
        account: input.from,
        accountSource: 'manual',
        transferGroupId: groupId,
        allocations: { create: { categoryId: category.id, amount } }
      }
    }),
    prisma.cashbookEntry.create({
      data: {
        date: input.date,
        ref,
        description: inLabel,
        creditAmt: amount,
        paymentMethod: 'deposit',
        account: input.to,
        accountSource: 'manual',
        transferGroupId: groupId,
        allocations: { create: { categoryId: category.id, amount } }
      }
    })
  ])
  return { groupId, entryIds: [out.id, inn.id] }
}

/** Both legs go together. Refuses if either leg is already on a finished bank reconciliation. */
export async function deleteTransfer(groupId: string): Promise<number> {
  const legs = await prisma.cashbookEntry.findMany({
    where: { transferGroupId: groupId },
    select: { id: true }
  })
  if (legs.length === 0) return 0
  const locked = await prisma.bankReconciliationLine.count({
    where: {
      cashbookEntryId: { in: legs.map((leg) => leg.id) },
      cleared: true,
      reconciliation: { status: 'finished' }
    }
  })
  if (locked > 0) throw new TransferInputError('This transfer is on a finished bank reconciliation')
  const deleted = await prisma.cashbookEntry.deleteMany({ where: { transferGroupId: groupId } })
  return deleted.count
}
