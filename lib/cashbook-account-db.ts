import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'
import { adjustOperatingBalance } from '@/lib/checkBalanceAccount'
import {
  isCashbookAccount,
  normalizeCounterparty,
  type CashbookAccount
} from '@/lib/cashbook-accounts'

export type CounterpartyKind = 'customer' | 'vendor'

/** The account a customer or vendor normally goes to, if someone taught us. */
export async function lookupCounterpartyAccount(
  kind: CounterpartyKind,
  name: string | null | undefined
): Promise<CashbookAccount | null> {
  const match = normalizeCounterparty(name)
  if (!match) return null
  try {
    const rule = await prisma.cashbookAccountRule.findUnique({
      where: { cashbook_account_rules_kind_match_key: { kind, match } }
    })
    return rule && isCashbookAccount(rule.account) ? rule.account : null
  } catch (error) {
    // Rules are a convenience. Never block an entry because they cannot be read.
    console.error('Failed to read cashbook account rule:', error)
    return null
  }
}

export async function rememberCounterpartyAccount(
  kind: CounterpartyKind,
  name: string | null | undefined,
  account: CashbookAccount
): Promise<void> {
  const match = normalizeCounterparty(name)
  if (!match) return
  await prisma.cashbookAccountRule.upsert({
    where: { cashbook_account_rules_kind_match_key: { kind, match } },
    create: { kind, match, account },
    update: { account }
  })
}

export type MoveSkip = { id: string; reason: string }

export type MoveResult = { moved: string[]; skipped: MoveSkip[] }

/**
 * Move cashbook lines to another account.
 * Refuses transfers and reconciled lines. If the money has already left an account
 * (cleared check, EFT, fuel payment) the operating balances follow the line.
 */
export async function moveEntriesToAccount(
  ids: string[],
  account: CashbookAccount,
  options: { remember?: boolean } = {}
): Promise<MoveResult> {
  const result: MoveResult = { moved: [], skipped: [] }
  const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id))]
  if (unique.length === 0) return result

  const [entries, locked] = await Promise.all([
    prisma.cashbookEntry.findMany({
      where: { id: { in: unique } },
      select: {
        id: true,
        account: true,
        description: true,
        debitCash: true,
        debitCheck: true,
        debitEcard: true,
        debitDcard: true,
        clearedAt: true,
        transferGroupId: true,
        vendorPaymentBatchId: true,
        paymentBatchId: true,
        customerArPaymentId: true
      }
    }),
    prisma.bankReconciliationLine.findMany({
      where: {
        cashbookEntryId: { in: unique },
        cleared: true,
        reconciliation: { status: 'finished' }
      },
      select: { cashbookEntryId: true }
    })
  ])
  const lockedIds = new Set(locked.map((row) => row.cashbookEntryId))
  const found = new Set(entries.map((entry) => entry.id))
  for (const id of unique) {
    if (!found.has(id)) result.skipped.push({ id, reason: 'Entry not found' })
  }

  for (const entry of entries) {
    if (entry.transferGroupId) {
      result.skipped.push({ id: entry.id, reason: 'Transfers move between accounts by design' })
      continue
    }
    if (lockedIds.has(entry.id)) {
      result.skipped.push({ id: entry.id, reason: 'Already on a finished bank reconciliation' })
      continue
    }

    if (entry.account !== account) {
      const out = roundMoney(entry.debitCash + entry.debitCheck + entry.debitEcard + entry.debitDcard)
      const batch = entry.vendorPaymentBatchId
        ? await prisma.vendorPaymentBatch.findUnique({
            where: { id: entry.vendorPaymentBatchId },
            select: { id: true, paymentMethod: true, clearedAt: true }
          })
        : null
      const moneyLeft =
        out > 0 &&
        ((entry.debitCheck > 0 && entry.clearedAt != null) ||
          (batch?.paymentMethod === 'eft') ||
          (entry.paymentBatchId != null && entry.vendorPaymentBatchId == null))

      try {
        if (moneyLeft && isCashbookAccount(entry.account)) {
          await adjustOperatingBalance(prisma, out, entry.account, 'restore')
          await adjustOperatingBalance(prisma, out, account, 'deduct')
        }
        if (batch && (batch.paymentMethod === 'eft' || batch.clearedAt)) {
          await prisma.vendorPaymentBatch.update({
            where: { id: batch.id },
            data: { clearedBalanceAccount: account }
          })
        }
      } catch (error) {
        console.error('Failed to move balances with cashbook entry:', error)
        result.skipped.push({ id: entry.id, reason: 'Could not update the account balances' })
        continue
      }
    }

    await prisma.cashbookEntry.update({
      where: { id: entry.id },
      data: { account, accountSource: 'manual' }
    })
    result.moved.push(entry.id)

    if (options.remember) {
      if (entry.customerArPaymentId) {
        await rememberCounterpartyAccount('customer', entry.description, account)
      } else if (entry.vendorPaymentBatchId) {
        const batch = await prisma.vendorPaymentBatch.findUnique({
          where: { id: entry.vendorPaymentBatchId },
          select: { vendor: { select: { name: true } } }
        })
        await rememberCounterpartyAccount('vendor', batch?.vendor.name, account)
      }
    }
  }
  return result
}

/** A person reviewed backfilled accounts and agrees with them. */
export async function confirmBackfilledAccounts(ids: string[]): Promise<number> {
  const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id))]
  if (unique.length === 0) return 0
  const updated = await prisma.cashbookEntry.updateMany({
    where: { id: { in: unique }, accountSource: 'backfill' },
    data: { accountSource: 'confirmed' }
  })
  return updated.count
}
