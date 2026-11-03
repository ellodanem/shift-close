import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'
import { getOrCreateDepositCategory } from '@/lib/cashbook-deposit-sync'
import { accountFieldsForSync, resolveCashbookAccount } from '@/lib/cashbook-accounts'
import { lookupCounterpartyAccount } from '@/lib/cashbook-account-db'

export type CustomerPaymentCashbookSource = {
  id: string
  date: string
  account: string
  amount: number
  ref?: string | null
  /** Kept on the payment record. Cashbook always books these as a deposit. */
  paymentMethod?: string | null
}

/**
 * Customer payment type (cash, check, EFT) can change after the payment is recorded.
 * Cashbook income does not follow that type. Every payment is a Deposit.
 */
export function customerPaymentCashbookFields(payment: CustomerPaymentCashbookSource) {
  return {
    date: payment.date.trim(),
    description: payment.account.trim() || 'Deposit',
    ref: payment.ref?.trim() || null,
    debitCash: 0,
    debitCheck: 0,
    debitEcard: 0,
    debitDcard: 0,
    creditAmt: roundMoney(payment.amount),
    paymentMethod: 'deposit' as const,
    categoryName: 'Deposit',
    categoryType: 'income' as const
  }
}

export async function syncCustomerPaymentToCashbook(payment: CustomerPaymentCashbookSource) {
  const fields = customerPaymentCashbookFields(payment)
  const category = await getOrCreateDepositCategory()
  const entryData = {
    date: fields.date,
    description: fields.description,
    ref: fields.ref,
    debitCash: fields.debitCash,
    debitCheck: fields.debitCheck,
    debitEcard: fields.debitEcard,
    debitDcard: fields.debitDcard,
    creditAmt: fields.creditAmt,
    paymentMethod: fields.paymentMethod,
    bank: null as string | null
  }

  const resolved = resolveCashbookAccount({
    origin: 'customer_payment',
    counterpartyRule: await lookupCounterpartyAccount('customer', payment.account)
  })

  const writeEntry = async (entry: { id: string; account: string; accountSource: string }) => {
    await prisma.cashbookEntry.update({
      where: { id: entry.id },
      data: {
        ...entryData,
        ...accountFieldsForSync(entry, resolved),
        allocations: {
          deleteMany: {},
          create: { categoryId: category.id, amount: fields.creditAmt }
        }
      }
    })
  }

  const existing = await prisma.cashbookEntry.findUnique({
    where: { customerArPaymentId: payment.id }
  })

  if (existing) {
    await writeEntry(existing)
  } else {
    try {
      await prisma.cashbookEntry.create({
        data: {
          ...entryData,
          account: resolved.account,
          accountSource: resolved.source,
          customerArPaymentId: payment.id,
          allocations: {
            create: { categoryId: category.id, amount: fields.creditAmt }
          }
        }
      })
    } catch (error) {
      const again = await prisma.cashbookEntry.findUnique({
        where: { customerArPaymentId: payment.id }
      })
      if (!again) throw error
      await writeEntry(again)
    }
  }

  await prisma.customerArPayment.update({
    where: { id: payment.id },
    data: { cashbookSynced: true }
  })
}

/** Book any recorded customer payments that are not yet in the cashbook. */
export async function syncUnsyncedCustomerPaymentsToCashbook(): Promise<number> {
  const pending = await prisma.customerArPayment.findMany({
    where: { cashbookSynced: false },
    orderBy: { createdAt: 'asc' }
  })
  for (const payment of pending) {
    await syncCustomerPaymentToCashbook(payment)
  }
  return pending.length
}

export async function ensureCustomerPaymentsInCashbook(): Promise<void> {
  try {
    await syncUnsyncedCustomerPaymentsToCashbook()
  } catch (error) {
    console.error('Failed to sync customer payments to cashbook:', error)
  }
}
