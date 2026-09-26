import { parseMoney, visibleExtraLines, type PayRunExtraLine } from '@/lib/pay-run'

export type CategoryKind = 'hours' | 'money' | 'deduction' | 'attendance'

export type PayrollCategory = {
  id: string
  label: string
  kind: CategoryKind
  builtin: boolean
  enabled: boolean
}

export const PAYROLL_CATEGORY_KEY = 'payroll-hour-money-types'
const SHOW_ALL_KEY = 'payroll-show-all-money'

export const BUILTIN_PAYROLL_CATEGORIES: PayrollCategory[] = [
  { id: 'basic', label: 'Basic', kind: 'hours', builtin: true, enabled: true },
  { id: 'ot', label: 'Overtime', kind: 'hours', builtin: true, enabled: true },
  { id: 'vacation', label: 'Vacation', kind: 'attendance', builtin: true, enabled: true },
  { id: 'sickDays', label: 'SICK', kind: 'attendance', builtin: true, enabled: true },
  { id: 'extra', label: 'Extra', kind: 'money', builtin: true, enabled: true },
  { id: 'medical', label: 'Medical', kind: 'deduction', builtin: true, enabled: true },
  { id: 'shortage', label: 'Shortage', kind: 'deduction', builtin: true, enabled: false }
]

type StoredCategories = {
  enabled?: Record<string, boolean>
  custom?: Array<{ id?: string; label?: string; kind?: string; enabled?: boolean }>
}

export function defaultPayrollCategories(): PayrollCategory[] {
  return BUILTIN_PAYROLL_CATEGORIES.map((category) => ({ ...category }))
}

function parseCategoryKind(value: unknown): CategoryKind | null {
  if (value === 'hours' || value === 'money' || value === 'deduction') return value
  return null
}

export function loadPayrollCategories(): PayrollCategory[] {
  const defaults = defaultPayrollCategories()
  if (typeof window === 'undefined') return defaults
  try {
    const raw = window.localStorage.getItem(PAYROLL_CATEGORY_KEY)
    if (!raw) {
      const showAll = window.localStorage.getItem(SHOW_ALL_KEY) === '1'
      return defaults.map((category) =>
        category.id === 'shortage' ? { ...category, enabled: showAll } : category
      )
    }
    const stored = JSON.parse(raw) as StoredCategories
    const enabled = stored.enabled ?? {}
    const builtins = defaults.map((category) => ({
      ...category,
      enabled: typeof enabled[category.id] === 'boolean' ? enabled[category.id] : category.enabled
    }))
    const custom = Array.isArray(stored.custom)
      ? stored.custom.flatMap((item) => {
          const label = typeof item.label === 'string' ? item.label.trim() : ''
          const id = typeof item.id === 'string' ? item.id.trim() : ''
          const kind = parseCategoryKind(item.kind)
          if (!label || !id || !kind) return []
          return [{ id, label, kind, builtin: false as const, enabled: item.enabled !== false }]
        })
      : []
    return [...builtins, ...custom]
  } catch {
    return defaults
  }
}

export function savePayrollCategories(categories: PayrollCategory[]) {
  if (typeof window === 'undefined') return
  const enabled: Record<string, boolean> = {}
  const custom: StoredCategories['custom'] = []
  for (const category of categories) {
    if (category.builtin) enabled[category.id] = category.enabled
    else custom.push({ id: category.id, label: category.label, kind: category.kind, enabled: category.enabled })
  }
  window.localStorage.setItem(PAYROLL_CATEGORY_KEY, JSON.stringify({ enabled, custom }))
}

export function newPayrollCategory(label: string, kind: CategoryKind): PayrollCategory {
  return {
    id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    label: label.trim(),
    kind,
    builtin: false,
    enabled: true
  }
}

export function categoryLabelTaken(categories: PayrollCategory[], label: string): boolean {
  const key = label.trim().toLowerCase()
  return categories.some((category) => category.label.toLowerCase() === key)
}

/** Custom "Sick" / "Sick Days" money columns repeat the attendance sick column. */
export function isSickAliasLabel(label: string): boolean {
  const key = label.trim().toLowerCase().replace(/\s+/g, '')
  return key === 'sick' || key === 'sickday' || key === 'sickdays'
}

export function sickDaysColumnEnabled(categories: PayrollCategory[]): boolean {
  return categories.some((category) => category.id === 'sickDays' && category.enabled)
}

/** Hide a custom Sick type while the attendance SICK column is on. */
export function listedPayrollCategories(categories: PayrollCategory[]): PayrollCategory[] {
  const sickOn = sickDaysColumnEnabled(categories)
  return categories.filter(
    (category) => !(sickOn && !category.builtin && isSickAliasLabel(category.label))
  )
}

/** Drop a custom Sick column while the attendance SICK column is on. */
export function visiblePayrollColumns(categories: PayrollCategory[]): PayrollCategory[] {
  return listedPayrollCategories(categories).filter((category) => category.enabled)
}

export function amountForLabel(lines: PayRunExtraLine[], label: string): number {
  return visibleExtraLines(lines)
    .filter((line) => line.label === label)
    .reduce((sum, line) => sum + line.amount, 0)
}

export function hoursForLabel(lines: PayRunExtraLine[], label: string): number {
  const match = visibleExtraLines(lines).find((line) => line.label === label && line.hours)
  return match?.hours ?? 0
}

export function buildExtraLines(input: {
  existing: PayRunExtraLine[]
  extraAmount: number
  hourlyRate: number
  categories: PayrollCategory[]
  values: Record<string, string>
}): PayRunExtraLine[] {
  const custom = input.categories.filter((category) => !category.builtin && category.kind !== 'deduction')
  const managed = new Set(['Extra', ...custom.map((category) => category.label)])
  const kept = visibleExtraLines(input.existing).filter((line) => !managed.has(line.label))
  const next: PayRunExtraLine[] = [...kept]
  if (input.extraAmount > 0) next.push({ label: 'Extra', amount: input.extraAmount })
  for (const category of custom) {
    const entered = parseMoney(input.values[category.id])
    if (entered <= 0) continue
    if (category.kind === 'hours') {
      next.push({ label: category.label, hours: entered, amount: parseMoney(entered * input.hourlyRate) })
    } else {
      next.push({ label: category.label, amount: entered })
    }
  }
  return next
}

export function buildDeductionLines(input: {
  existing: PayRunExtraLine[]
  otherAmount: number
  categories: PayrollCategory[]
  values: Record<string, string>
}): PayRunExtraLine[] {
  const custom = input.categories.filter((category) => !category.builtin && category.kind === 'deduction')
  const managed = new Set(['Other', ...custom.map((category) => category.label)])
  const kept = input.existing.filter((line) => line.label && !managed.has(line.label))
  const next: PayRunExtraLine[] = [...kept]
  if (input.otherAmount > 0) next.push({ label: 'Other', amount: input.otherAmount })
  for (const category of custom) {
    const entered = parseMoney(input.values[category.id])
    if (entered > 0) next.push({ label: category.label, amount: entered })
  }
  return next
}
