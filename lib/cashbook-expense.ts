import { prisma } from '@/lib/prisma'

export function mapExpenseDebits(
  paymentMethod: string | null | undefined,
  amount: number
): {
  debitCash: number
  debitCheck: number
  debitEcard: number
  debitDcard: number
  creditAmt: number
  paymentMethod: string | null
} {
  const amt = Math.abs(Number(amount)) || 0
  const base = {
    debitCash: 0,
    debitCheck: 0,
    debitEcard: 0,
    debitDcard: 0,
    creditAmt: 0,
    paymentMethod: null as string | null
  }
  const pm = (paymentMethod || 'cash').toLowerCase()
  if (pm === 'check') return { ...base, debitCheck: amt, paymentMethod: 'check' }
  if (pm === 'deposit' || pm === 'eft' || pm === 'direct_debit') {
    return { ...base, debitEcard: amt, paymentMethod: pm }
  }
  if (pm === 'debit_credit' || pm === 'debit/credit') {
    return { ...base, debitDcard: amt, paymentMethod: 'debit_credit' }
  }
  return { ...base, debitCash: amt, paymentMethod: 'cash' }
}

export async function getOrCreateExpenseCategory(name: string, code: string | null) {
  let cat = await prisma.cashbookCategory.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, type: 'expense' }
  })
  if (!cat) {
    cat = await prisma.cashbookCategory.create({
      data: { name, code, type: 'expense', sortOrder: 0, active: true }
    })
  }
  return cat
}

export async function createCashbookExpenseEntry(opts: {
  date: string
  description: string
  amount: number
  categoryId: string
  paymentMethod?: string | null
  ref?: string | null
}) {
  const mapped = mapExpenseDebits(opts.paymentMethod, opts.amount)
  return prisma.cashbookEntry.create({
    data: {
      date: opts.date,
      ref: opts.ref?.trim() || null,
      description: opts.description.trim(),
      debitCash: mapped.debitCash,
      debitCheck: mapped.debitCheck,
      debitEcard: mapped.debitEcard,
      debitDcard: mapped.debitDcard,
      creditAmt: mapped.creditAmt,
      paymentMethod: mapped.paymentMethod,
      allocations: {
        create: { categoryId: opts.categoryId, amount: Math.abs(opts.amount) }
      }
    }
  })
}

export async function updateCashbookExpenseEntry(
  id: string,
  opts: {
    date?: string
    description?: string
    amount?: number
    categoryId?: string
    paymentMethod?: string | null
    ref?: string | null
  }
) {
  const data: Record<string, unknown> = {}
  if (opts.date !== undefined) data.date = opts.date
  if (opts.description !== undefined) data.description = opts.description.trim()
  if (opts.ref !== undefined) data.ref = opts.ref?.trim() || null
  if (opts.amount !== undefined || opts.paymentMethod !== undefined) {
    const existing = await prisma.cashbookEntry.findUnique({
      where: { id },
      include: { allocations: true }
    })
    if (!existing) return null
    const amount = opts.amount ?? existing.allocations[0]?.amount ?? 0
    const mapped = mapExpenseDebits(opts.paymentMethod ?? existing.paymentMethod, amount)
    Object.assign(data, mapped)
  }

  const allocData: Record<string, unknown> = {}
  if (opts.categoryId !== undefined) allocData.categoryId = opts.categoryId
  if (opts.amount !== undefined) allocData.amount = Math.abs(opts.amount)

  try {
    return await prisma.cashbookEntry.update({
      where: { id },
      data: {
        ...data,
        ...(Object.keys(allocData).length > 0 && {
          allocations: {
            updateMany: {
              where: {},
              data: allocData
            }
          }
        })
      }
    })
  } catch {
    return null
  }
}
