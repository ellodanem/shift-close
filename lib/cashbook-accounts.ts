/**
 * The business runs two bank accounts through one cashbook.
 * Keys match CheckBalanceAccount so balances and cashbook lines speak the same language.
 */
export const CASHBOOK_ACCOUNTS = ['westline', 'service_station'] as const

export type CashbookAccount = (typeof CASHBOOK_ACCOUNTS)[number]

/** Westline is the fallback when nothing else decides. */
export const DEFAULT_CASHBOOK_ACCOUNT: CashbookAccount = 'westline'

export const CASHBOOK_ACCOUNT_INFO: Record<
  CashbookAccount,
  { label: string; bankLabel: string; ledgerCode: string; accountNumber: string }
> = {
  westline: {
    label: 'Westline',
    bankLabel: 'Westline Ent',
    ledgerCode: '101',
    accountNumber: '200000316928'
  },
  service_station: {
    label: 'Service Station',
    bankLabel: 'Service Station',
    ledgerCode: '102',
    accountNumber: '200000102146'
  }
}

/** Bank balances the accountant confirmed at the cutover. Cashbook running balances start here. */
export const CASHBOOK_OPENING_BALANCES: Record<CashbookAccount, { date: string; amount: number }> = {
  westline: { date: '2026-10-01', amount: 124611.95 },
  service_station: { date: '2026-10-01', amount: 30063.25 }
}

/**
 * How an account was set.
 * default: nothing decided it. rule: a built-in or learned rule. manual: a person chose it.
 * backfill: guessed when accounts were introduced, awaiting review. confirmed: a person reviewed a backfill.
 * upload: set while working an accountant-sheet task.
 */
export type CashbookAccountSource = 'default' | 'rule' | 'manual' | 'backfill' | 'confirmed' | 'upload'

/** Account chosen or confirmed by a person is never overwritten by a sync. */
export function isAccountLocked(source: string | null | undefined): boolean {
  return source === 'manual' || source === 'confirmed' || source === 'upload'
}

export function isCashbookAccount(value: unknown): value is CashbookAccount {
  return value === 'westline' || value === 'service_station'
}

export function parseCashbookAccount(value: unknown): CashbookAccount | undefined {
  if (value == null || value === '') return undefined
  if (isCashbookAccount(value)) return value
  throw new Error('Invalid cashbook account')
}

export function cashbookAccountLabel(account: string | null | undefined): string {
  return isCashbookAccount(account) ? CASHBOOK_ACCOUNT_INFO[account].label : 'Unassigned'
}

export function otherCashbookAccount(account: CashbookAccount): CashbookAccount {
  return account === 'westline' ? 'service_station' : 'westline'
}

/** Where an entry came from. Each origin has its own default account. */
export type CashbookEntryOrigin =
  | 'shift_deposit'
  | 'shift_card'
  | 'customer_payment'
  | 'fuel_payment'
  | 'vendor_payment'
  | 'payroll'
  | 'bank_statement'
  | 'reconciliation'
  | 'journal'
  | 'manual'

export type ResolveAccountInput = {
  origin: CashbookEntryOrigin
  /** A person's choice, or an account the screen already knows (e.g. the statement's own account). */
  explicit?: CashbookAccount | null
  /** Source to record for `explicit`. A screen's own account is a rule, a person's pick is manual. */
  explicitSource?: 'manual' | 'rule'
  /** Learned customer or vendor preference. Beats the origin default. */
  counterpartyRule?: CashbookAccount | null
  type?: 'income' | 'expense'
  categoryName?: string | null
  description?: string | null
}

export type ResolvedAccount = { account: CashbookAccount; source: CashbookAccountSource }

const ORIGIN_DEFAULTS: Partial<Record<CashbookEntryOrigin, CashbookAccount>> = {
  shift_deposit: 'westline',
  shift_card: 'service_station',
  customer_payment: 'westline',
  fuel_payment: 'westline',
  vendor_payment: 'service_station',
  payroll: 'service_station'
}

/**
 * One place decides which account a new cashbook line belongs to.
 * Order: explicit choice, learned counterparty rule, origin default, category rule, Westline.
 */
export function resolveCashbookAccount(input: ResolveAccountInput): ResolvedAccount {
  if (input.explicit && isCashbookAccount(input.explicit)) {
    return { account: input.explicit, source: input.explicitSource ?? 'manual' }
  }
  if (input.counterpartyRule && isCashbookAccount(input.counterpartyRule)) {
    return { account: input.counterpartyRule, source: 'rule' }
  }
  const fromOrigin = ORIGIN_DEFAULTS[input.origin]
  if (fromOrigin) return { account: fromOrigin, source: 'rule' }

  const category = (input.categoryName ?? '').trim().toLowerCase()
  const description = (input.description ?? '').trim().toLowerCase()
  if (input.type === 'income' && /^(credit|debit)\s*card$/.test(category)) {
    return { account: 'service_station', source: 'rule' }
  }
  if (input.type === 'income' && category === 'deposit') {
    return { account: 'westline', source: 'rule' }
  }
  if (/bank\s*charges?/.test(category) && /card|pos/.test(description)) {
    return { account: 'service_station', source: 'rule' }
  }
  return { account: DEFAULT_CASHBOOK_ACCOUNT, source: 'default' }
}

/** Entry fields a sync may rewrite. Leaves the account alone once a person has chosen it. */
export function accountFieldsForSync(
  existing: { account: string; accountSource: string } | null | undefined,
  resolved: ResolvedAccount
): { account?: CashbookAccount; accountSource?: CashbookAccountSource } {
  if (existing && isAccountLocked(existing.accountSource)) return {}
  if (existing && existing.accountSource === 'backfill') return {}
  return { account: resolved.account, accountSource: resolved.source }
}

export function normalizeCounterparty(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Transfer lines are income or expense on each side but never real income or expense. */
export const TRANSFER_CATEGORY_NAME = 'Transfer'
