import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'

/** Total amount of fuel invoices still pending payment. */
export async function sumPendingFuelInvoiceAmounts(): Promise<number> {
  const pending = await prisma.invoice.findMany({
    where: { status: 'pending' },
    select: { amount: true }
  })
  return roundMoney(
    pending.reduce((sum, inv) => sum + roundMoney(inv.amount), 0)
  )
}

/**
 * Summary "After" reflects actual available funds only — it changes when
 * payments are made (or balance is edited), not when a payment is proposed.
 */
export function balanceAfterFromAvailable(availableFunds: number): number {
  return roundMoney(availableFunds)
}

/** Westline is the payment result. Combined (Westline + Total Auto) is a suggestion only. */
export function proposedPaymentBalances(
  availableFunds: number,
  totalAutoAvailable: number,
  planned: number
) {
  const westlineBefore = roundMoney(availableFunds)
  const plannedAmount = roundMoney(planned)
  const totalAuto = roundMoney(totalAutoAvailable || 0)
  const westlineAfter = roundMoney(westlineBefore - plannedAmount)
  const combinedBefore = roundMoney(westlineBefore + totalAuto)
  return {
    westlineBefore,
    westlineAfter,
    totalAutoAvailable: totalAuto,
    combinedBefore,
    combinedAfter: roundMoney(combinedBefore - plannedAmount)
  }
}

/** Recompute planned (pending total) and balanceAfter from current DB state. */
export async function refreshBalanceSnapshot() {
  let balance = await prisma.balance.upsert({
    where: { id: 'balance' },
    update: {},
    create: {
      id: 'balance',
      currentBalance: 0,
      availableFunds: 0,
      planned: 0,
      balanceAfter: 0
    }
  })

  const planned = await sumPendingFuelInvoiceAmounts()
  const balanceAfter = balanceAfterFromAvailable(balance.availableFunds)

  if (planned !== balance.planned || balanceAfter !== balance.balanceAfter) {
    balance = await prisma.balance.update({
      where: { id: 'balance' },
      data: { planned, balanceAfter }
    })
  } else {
    balance = { ...balance, planned, balanceAfter }
  }

  return balance
}
