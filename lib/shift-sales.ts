export const DEPARTMENT_SALE_CATEGORIES = [
  'unleaded',
  'diesel',
  'lpg',
  'lubricants',
  'cstore'
] as const

export type DepartmentSaleCategory = (typeof DEPARTMENT_SALE_CATEGORIES)[number]
export type ShiftSaleSource = 'manual' | 'pos'

export type ShiftSaleCategoryDef = {
  category: DepartmentSaleCategory
  label: string
  unit: string | null
  quantityKind: 'fuel' | 'count' | 'none'
}

export const DEPARTMENT_SALE_DEFS: ShiftSaleCategoryDef[] = [
  { category: 'unleaded', label: 'Unleaded', unit: 'litres', quantityKind: 'fuel' },
  { category: 'diesel', label: 'Diesel', unit: 'litres', quantityKind: 'fuel' },
  { category: 'lpg', label: 'LPG', unit: 'each', quantityKind: 'count' },
  { category: 'lubricants', label: 'Lubricants', unit: 'each', quantityKind: 'count' },
  { category: 'cstore', label: 'C-Store', unit: null, quantityKind: 'none' }
]

export type ShiftSaleRow = {
  id?: string
  category: string
  label: string
  quantity: number | null
  unit: string | null
  amount: number
  source: ShiftSaleSource
  posKey: string
  sortOrder: number
}

export type ShiftSaleFormRow = {
  category: DepartmentSaleCategory
  label: string
  quantity: number | null
  unit: string | null
  amount: number
  source: ShiftSaleSource
  posKey: string
  sortOrder: number
}

export type FuelQty = { unleaded: number; diesel: number }

export type ShiftTenderFields = {
  systemCash: number
  systemChecks: number
  systemCredit: number
  systemDebit: number
  otherCredit: number
  systemInhouse: number
  systemFleet: number
  systemMassyCoupons: number
}

const DEPARTMENT_SET = new Set<string>(DEPARTMENT_SALE_CATEGORIES)

function n(val: unknown): number {
  const num = typeof val === 'number' ? val : Number(val)
  return Number.isFinite(num) ? num : 0
}

function nanToNull(val: number | null | undefined): number | null {
  if (val === null || val === undefined) return null
  return Number.isNaN(val) ? null : val
}

export function isDepartmentSaleCategory(value: string): value is DepartmentSaleCategory {
  return DEPARTMENT_SET.has(value)
}

export function defaultDepartmentSales(): ShiftSaleFormRow[] {
  return DEPARTMENT_SALE_DEFS.map((def, index) => ({
    category: def.category,
    label: def.label,
    quantity: def.quantityKind === 'none' ? null : 0,
    unit: def.unit,
    amount: 0,
    source: 'manual',
    posKey: '',
    sortOrder: index
  }))
}

export function extraPosSales(rows: ShiftSaleRow[] | null | undefined): ShiftSaleRow[] {
  if (!Array.isArray(rows)) return []
  return rows
    .filter((row) => (row.posKey || '') !== '')
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
}

export function mergeDepartmentSales(
  existing: ShiftSaleRow[] | null | undefined,
  fuel: FuelQty
): ShiftSaleFormRow[] {
  const byCategory = new Map<string, ShiftSaleRow>()
  if (Array.isArray(existing)) {
    for (const row of existing) {
      if ((row.posKey || '') !== '') continue
      if (!isDepartmentSaleCategory(row.category)) continue
      byCategory.set(row.category, row)
    }
  }

  return DEPARTMENT_SALE_DEFS.map((def, index) => {
    const row = byCategory.get(def.category)
    const fuelQty = def.category === 'unleaded' ? n(fuel.unleaded) : def.category === 'diesel' ? n(fuel.diesel) : null
    const quantity =
      def.quantityKind === 'fuel'
        ? fuelQty
        : def.quantityKind === 'none'
          ? null
          : row?.quantity ?? 0
    return {
      category: def.category,
      label: row?.label || def.label,
      quantity,
      unit: row?.unit ?? def.unit,
      amount: row ? n(row.amount) : 0,
      source: row?.source === 'pos' ? 'pos' : 'manual',
      posKey: '',
      sortOrder: row?.sortOrder ?? index
    }
  })
}

export function salesAmountTotal(rows: Array<{ amount: number }>): number {
  return rows.reduce((sum, row) => sum + (Number.isNaN(row.amount) ? 0 : n(row.amount)), 0)
}

export function systemTenderTotal(fields: ShiftTenderFields): number {
  return (
    n(fields.systemCash) +
    n(fields.systemChecks) +
    n(fields.systemCredit) +
    n(fields.systemDebit) +
    n(fields.otherCredit) +
    n(fields.systemInhouse) +
    n(fields.systemFleet) +
    n(fields.systemMassyCoupons)
  )
}

export function departmentSalesSnapshot(rows: ShiftSaleFormRow[]): string {
  return JSON.stringify(
    rows.map((row) => ({
      category: row.category,
      quantity: nanToNull(row.quantity),
      amount: Number.isNaN(row.amount) ? 0 : n(row.amount),
      source: row.source
    }))
  )
}

function parseSource(value: unknown): ShiftSaleSource {
  return value === 'pos' ? 'pos' : 'manual'
}

/** Normalize a POST/PATCH sales payload. Unknown categories become `other`. */
export function parseSalesPayload(input: unknown, fuel: FuelQty): ShiftSaleRow[] {
  if (!Array.isArray(input)) return []

  const rows: ShiftSaleRow[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    const categoryRaw = String(item.category || '').trim().toLowerCase()
    const category = categoryRaw || 'other'
    const posKey = String(item.posKey ?? item.pos_key ?? '')
    const def = DEPARTMENT_SALE_DEFS.find((d) => d.category === category)
    const quantityKind = def?.quantityKind ?? (item.quantity == null || item.quantity === '' ? 'none' : 'count')
    let quantity: number | null = null
    if (quantityKind === 'fuel') {
      quantity = category === 'diesel' ? n(fuel.diesel) : n(fuel.unleaded)
    } else if (quantityKind === 'count') {
      if (item.quantity === null || item.quantity === undefined || item.quantity === '') {
        quantity = null
      } else {
        const q = Number(item.quantity)
        quantity = Number.isNaN(q) ? null : q
      }
    }

    rows.push({
      category: isDepartmentSaleCategory(category) || category === 'other' ? category : 'other',
      label: String(item.label || def?.label || category),
      quantity,
      unit: item.unit == null || item.unit === '' ? def?.unit ?? null : String(item.unit),
      amount: n(item.amount),
      source: parseSource(item.source),
      posKey,
      sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : rows.length
    })
  }
  return rows
}

export function departmentRowsForPersist(input: unknown, fuel: FuelQty): ShiftSaleRow[] {
  const parsed = parseSalesPayload(input, fuel)
  const department = parsed.filter((row) => row.posKey === '' && isDepartmentSaleCategory(row.category))
  if (department.length === 0 && parsed.length === 0) return []
  const merged = mergeDepartmentSales(department, fuel)
  return merged.map((row) => {
    const incoming = department.find((d) => d.category === row.category)
    return {
      ...row,
      amount: incoming ? incoming.amount : row.amount,
      quantity:
        row.category === 'unleaded'
          ? n(fuel.unleaded)
          : row.category === 'diesel'
            ? n(fuel.diesel)
            : incoming
              ? incoming.quantity
              : row.quantity,
      source: incoming?.source ?? row.source,
      posKey: ''
    }
  })
}
