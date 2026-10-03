/** Expense accounts already posted by the Vendor and Fuel bill tabs. */
const OWNED_BY_OTHER_BILLS = [/^rec\.?\s*gen$/i, /^rec\.?\s*gas$/i, /^fuel payments$/i]

export type CashbookCategoryRef = {
  name: string
  code?: string | null
  type?: string
}

/** Cashbook expense categories that are not already the Vendor or Fuel posting accounts. */
export function isOverheadCashbookCategory(category: CashbookCategoryRef): boolean {
  if (category.type && category.type !== 'expense') return false
  return !OWNED_BY_OTHER_BILLS.some((pattern) => pattern.test(category.name.trim()))
}

export function cashbookAccountLabel(category: CashbookCategoryRef | null | undefined): string {
  if (!category) return '3021 · Rec. Gen'
  const code = category.code?.trim()
  return code ? `${code} · ${category.name}` : category.name
}
