import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { formatAmount, roundMoney } from '@/lib/fuelPayments'
import {
  loadActiveStaffIndex,
  matchStaffByName,
  normalizeEntrantKey
} from '@/lib/promotion-entries'

export type PromotionReceiptRow = {
  id: string
  receiptDate: string
  entrantName: string
  staffId: string | null
  amount: number
  busRegistration: string
  phone: string
  createdAt: string
}

export type DriverProfile = {
  key: string
  name: string
  staffId: string | null
  receiptCount: number
  lastBus: string
  lastPhone: string
  lastReceiptDate: string | null
}

export type FuelTallyRow = {
  key: string
  staffId: string | null
  name: string
  receiptCount: number
  totalAmount: number
  lastBus: string
  lastPhone: string
  lastReceiptDate: string | null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isValidReceiptDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

export function parseReceiptAmount(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const n = roundMoney(raw)
    return n > 0 ? n : null
  }
  if (typeof raw !== 'string') return null
  const cleaned = raw.trim().replace(/[$,]/g, '')
  if (!cleaned) return null
  const n = roundMoney(Number(cleaned))
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

export function entrantKey(staffId: string | null, entrantName: string): string {
  if (staffId) return `staff:${staffId}`
  return `name:${normalizeEntrantKey(entrantName)}`
}

export async function resolveEntrant(input: {
  staffId?: string | null
  entrantName?: string
}): Promise<{ staffId: string | null; entrantName: string } | { error: string }> {
  let staffId =
    typeof input.staffId === 'string' && input.staffId.trim() ? input.staffId.trim() : null
  let entrantName = typeof input.entrantName === 'string' ? input.entrantName.trim() : ''

  if (staffId) {
    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      select: { id: true, name: true }
    })
    if (!staff) return { error: 'Staff not found' }
    if (!entrantName) entrantName = staff.name
  } else if (entrantName) {
    const index = await loadActiveStaffIndex()
    const matched = matchStaffByName(entrantName, index)
    if (matched) staffId = matched.id
  }

  if (!entrantName) return { error: 'Driver name is required' }
  return { staffId, entrantName }
}

export function buildFuelTally(
  receipts: {
    receiptDate: string
    entrantName: string
    staffId: string | null
    amount: number
    busRegistration: string
    phone: string
    staff?: { name: string } | null
  }[]
): FuelTallyRow[] {
  const buckets = new Map<string, FuelTallyRow>()

  for (const receipt of receipts) {
    const key = entrantKey(receipt.staffId, receipt.entrantName)
    const displayName = receipt.staff?.name || receipt.entrantName
    const bus = receipt.busRegistration.trim()
    const phone = receipt.phone.trim()
    const existing = buckets.get(key)

    if (existing) {
      existing.receiptCount += 1
      existing.totalAmount = roundMoney(existing.totalAmount + receipt.amount)
      if (bus) existing.lastBus = bus
      if (phone) existing.lastPhone = phone
      if (!existing.lastReceiptDate || receipt.receiptDate > existing.lastReceiptDate) {
        existing.lastReceiptDate = receipt.receiptDate
      }
      if (!existing.staffId && receipt.staffId) existing.staffId = receipt.staffId
      if (receipt.staff?.name) existing.name = receipt.staff.name
    } else {
      buckets.set(key, {
        key,
        staffId: receipt.staffId,
        name: displayName,
        receiptCount: 1,
        totalAmount: roundMoney(receipt.amount),
        lastBus: bus,
        lastPhone: phone,
        lastReceiptDate: receipt.receiptDate
      })
    }
  }

  return [...buckets.values()].sort((a, b) => {
    if (b.totalAmount !== a.totalAmount) return b.totalAmount - a.totalAmount
    if (b.receiptCount !== a.receiptCount) return b.receiptCount - a.receiptCount
    return a.name.localeCompare(b.name)
  })
}

export function buildDriverProfiles(
  receipts: {
    receiptDate: string
    entrantName: string
    staffId: string | null
    busRegistration: string
    phone: string
    staff?: { name: string } | null
  }[]
): DriverProfile[] {
  const byKey = new Map<string, DriverProfile>()

  for (const receipt of receipts) {
    const key = entrantKey(receipt.staffId, receipt.entrantName)
    const displayName = receipt.staff?.name || receipt.entrantName
    const bus = receipt.busRegistration.trim()
    const phone = receipt.phone.trim()
    const existing = byKey.get(key)

    if (existing) {
      existing.receiptCount += 1
      if (bus) existing.lastBus = bus
      if (phone) existing.lastPhone = phone
      if (!existing.lastReceiptDate || receipt.receiptDate >= existing.lastReceiptDate) {
        existing.lastReceiptDate = receipt.receiptDate
        if (bus) existing.lastBus = bus
        if (phone) existing.lastPhone = phone
      }
      if (!existing.staffId && receipt.staffId) existing.staffId = receipt.staffId
      if (receipt.staff?.name) existing.name = receipt.staff.name
    } else {
      byKey.set(key, {
        key,
        name: displayName,
        staffId: receipt.staffId,
        receiptCount: 1,
        lastBus: bus,
        lastPhone: phone,
        lastReceiptDate: receipt.receiptDate
      })
    }
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function filterTallyRows(rows: FuelTallyRow[], query: string): FuelTallyRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter(
    (row) =>
      row.name.toLowerCase().includes(q) ||
      row.lastBus.toLowerCase().includes(q) ||
      row.lastPhone.toLowerCase().includes(q)
  )
}

export function generatePromotionReceiptExcelBuffer(params: {
  promotionName: string
  tally: FuelTallyRow[]
  receipts: PromotionReceiptRow[]
}): { buffer: Buffer; filename: string } {
  const tallySheet: (string | number)[][] = [
    ['Promotion tally', params.promotionName],
    [],
    ['Driver name', 'Receipts', 'Total fuel (TT$)', 'Last bus', 'Phone', 'Last receipt date']
  ]
  for (const row of params.tally) {
    tallySheet.push([
      row.name,
      row.receiptCount,
      row.totalAmount,
      row.lastBus || '',
      row.lastPhone || '',
      row.lastReceiptDate || ''
    ])
  }

  const receiptSheet: (string | number)[][] = [
    ['Receipt date', 'Driver name', 'Amount (TT$)', 'Bus / registration', 'Phone']
  ]
  for (const row of params.receipts) {
    receiptSheet.push([
      row.receiptDate,
      row.entrantName,
      row.amount,
      row.busRegistration || '',
      row.phone || ''
    ])
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tallySheet), 'Tally')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(receiptSheet), 'Receipts')
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  const safeName = params.promotionName
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40)
  const filename = `promotion-tally-${safeName || 'export'}.xlsx`
  return { buffer, filename }
}

export function formatReceiptAmount(amount: number): string {
  return formatAmount(amount)
}
