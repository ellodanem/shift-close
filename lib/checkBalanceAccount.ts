import { roundMoney } from '@/lib/fuelPayments'

export const CHECK_BALANCE_ACCOUNTS = ['service_station', 'westline'] as const

export type CheckBalanceAccount = (typeof CHECK_BALANCE_ACCOUNTS)[number]

/** Vendor checks clear against Service Station unless another account is chosen. */
export const DEFAULT_VENDOR_CHECK_BALANCE: CheckBalanceAccount = 'service_station'

export function isCheckBalanceAccount(value: unknown): value is CheckBalanceAccount {
  return value === 'service_station' || value === 'westline'
}

export function parseCheckBalanceAccount(value: unknown): CheckBalanceAccount | undefined {
  if (value == null || value === '') return undefined
  if (isCheckBalanceAccount(value)) return value
  throw new Error('Invalid balance account')
}

export function checkBalanceAccountLabel(account: CheckBalanceAccount): string {
  return account === 'service_station' ? 'Service Station' : 'Westline Ent'
}

/**
 * Account a vendor payment already reduced.
 * Uncashed checks return null — they are reserved on both phantoms, not deducted yet.
 * EFT and older cleared checks (no stored account) reduced Westline.
 */
export function chargedVendorBalanceAccount(batch: {
  paymentMethod: string
  clearedAt: Date | null
  clearedBalanceAccount?: string | null
}): CheckBalanceAccount | null {
  if (batch.paymentMethod === 'eft') return 'westline'
  if (batch.clearedAt == null) return null
  return batch.clearedBalanceAccount === 'service_station' ? 'service_station' : 'westline'
}

/**
 * Outstanding vendor checks are reserved on both accounts until the check clears.
 * Cashbook checks are reserved on Westline only.
 */
export function phantomBalances(input: {
  westlineAvailable: number
  serviceStationAvailable: number
  vendorUncashed: number
  cashbookUncashed: number
}) {
  const vendor = roundMoney(input.vendorUncashed)
  const cashbook = roundMoney(input.cashbookUncashed)
  const uncashedChecksTotal = roundMoney(vendor + cashbook)

  return {
    uncashedChecksTotal,
    vendorUncashedChecksTotal: vendor,
    phantom: roundMoney(input.westlineAvailable - uncashedChecksTotal),
    serviceStationUncashedChecksTotal: vendor,
    serviceStationPhantom: roundMoney(input.serviceStationAvailable - vendor)
  }
}

type BalanceRow = {
  availableFunds: number
  totalAutoAvailable: number
}

type BalanceStore = {
  balance: {
    findUnique(args: { where: { id: string } }): Promise<BalanceRow | null>
    update(args: {
      where: { id: string }
      data: {
        availableFunds?: number
        balanceAfter?: number
        totalAutoAvailable?: number
      }
    }): Promise<unknown>
    create(args: { data: Record<string, unknown> }): Promise<unknown>
  }
}

export async function adjustOperatingBalance(
  db: BalanceStore,
  amount: number,
  account: CheckBalanceAccount,
  direction: 'deduct' | 'restore'
) {
  const signed = direction === 'deduct' ? -roundMoney(amount) : roundMoney(amount)
  const existing = await db.balance.findUnique({ where: { id: 'balance' } })

  if (account === 'service_station') {
    if (existing) {
      await db.balance.update({
        where: { id: 'balance' },
        data: {
          totalAutoAvailable: roundMoney(existing.totalAutoAvailable + signed)
        }
      })
      return
    }

    await db.balance.create({
      data: {
        id: 'balance',
        currentBalance: 0,
        availableFunds: 0,
        totalAutoCurrentBalance: 0,
        totalAutoAvailable: roundMoney(signed),
        planned: 0,
        balanceAfter: 0
      }
    })
    return
  }

  if (existing) {
    const updatedAvailable = roundMoney(existing.availableFunds + signed)
    await db.balance.update({
      where: { id: 'balance' },
      data: {
        availableFunds: updatedAvailable,
        balanceAfter: roundMoney(updatedAvailable)
      }
    })
    return
  }

  await db.balance.create({
    data: {
      id: 'balance',
      currentBalance: 0,
      availableFunds: roundMoney(signed),
      planned: 0,
      balanceAfter: roundMoney(signed)
    }
  })
}
