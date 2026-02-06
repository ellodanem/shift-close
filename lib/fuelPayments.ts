import { PaymentBatch, PaidInvoice } from '@prisma/client'

// Helper to round to 2 decimals (prevent Float precision issues)
export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100
}

// Helper to format amount for display (with commas, 2 decimals)
export function formatAmount(amount: number): string {
  return roundMoney(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// Helper to pad invoice number to 8 characters
export function padInvoiceNumber(invoiceNumber: string): string {
  return invoiceNumber.padEnd(8, ' ')
}

// Helper to format date as DD/MM/YYYY
export function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

// Type for grouped report structure
export interface GroupedBlock {
  bankRef: string
  invoices: PaidInvoice[]
  subtotal: number
}

export interface GroupedDate {
  date: Date
  dateFormatted: string
  blocks: GroupedBlock[]
}

export interface GroupedReport {
  month: string // "2026-01"
  monthName: string // "January 2026"
  byDate: GroupedDate[]
  grandTotal: number
  warnings: string[]
}

// Grouping algorithm: paymentDate → (paymentDate + bankRef) blocks
export function groupBatchesForMonth(
  batches: (PaymentBatch & { invoices: PaidInvoice[] })[],
  month: string // "2026-01"
): GroupedReport {
  const warnings: string[] = []
  // Parse the month string as a LOCAL calendar month to avoid timezone
  // shifts (e.g. "2026-02-01" becoming January 31st in some timezones).
  const [monthYear, monthMonth] = month.split('-').map(Number)
  const monthDate = new Date(monthYear, monthMonth - 1, 1)
  const monthName = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' })

  // Filter batches for the selected month
  const monthBatches = batches.filter(batch => {
    const batchMonth = `${batch.paymentDate.getFullYear()}-${String(batch.paymentDate.getMonth() + 1).padStart(2, '0')}`
    return batchMonth === month
  })

  // Group by paymentDate
  const byDateMap = new Map<string, (PaymentBatch & { invoices: PaidInvoice[] })[]>()

  monthBatches.forEach(batch => {
    const dateKey = formatDate(batch.paymentDate)
    if (!byDateMap.has(dateKey)) {
      byDateMap.set(dateKey, [])
    }
    byDateMap.get(dateKey)!.push(batch)
  })

  // Convert to sorted array structure
  const byDate: GroupedDate[] = []

  // Sort dates ascending
  const sortedDates = Array.from(byDateMap.keys()).sort((a, b) => {
    const [dayA, monthA, yearA] = a.split('/').map(Number)
    const [dayB, monthB, yearB] = b.split('/').map(Number)
    const dateA = new Date(yearA, monthA - 1, dayA)
    const dateB = new Date(yearB, monthB - 1, dayB)
    return dateA.getTime() - dateB.getTime()
  })

  let grandTotal = 0

  sortedDates.forEach(dateStr => {
    const batchesForDate = byDateMap.get(dateStr)!

    // Sort batches by bankRef (string sort, but numeric-aware if all numeric)
    batchesForDate.sort((a, b) => {
      // Try numeric sort if both are numeric
      const aNum = Number(a.bankRef)
      const bNum = Number(b.bankRef)
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return aNum - bNum
      }
      // Otherwise string sort
      return a.bankRef.localeCompare(b.bankRef)
    })

    const blocks: GroupedBlock[] = []

    batchesForDate.forEach(batch => {
      // Validate bankRef
      const bankRef = batch.bankRef.trim()
      const displayRef = bankRef || '(No Ref)'

      if (!bankRef) {
        warnings.push(`Batch ${batch.id} has missing bank reference on ${dateStr}`)
      }

      // Sort invoices by invoiceNumber (ascending)
      const sortedInvoices = [...batch.invoices].sort((a, b) => {
        const aNum = Number(a.invoiceNumber)
        const bNum = Number(b.invoiceNumber)
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return aNum - bNum
        }
        return a.invoiceNumber.localeCompare(b.invoiceNumber)
      })

      // Calculate subtotal for this block
      const subtotal = roundMoney(
        sortedInvoices.reduce((sum, inv) => sum + roundMoney(inv.amount), 0)
      )

      grandTotal = roundMoney(grandTotal + subtotal)

      blocks.push({
        bankRef: displayRef,
        invoices: sortedInvoices,
        subtotal
      })
    })

    // Parse date for the date object
    const [day, month, year] = dateStr.split('/').map(Number)
    const dateObj = new Date(year, month - 1, day)

    byDate.push({
      date: dateObj,
      dateFormatted: dateStr,
      blocks
    })
  })

  return {
    month,
    monthName,
    byDate,
    grandTotal: roundMoney(grandTotal),
    warnings
  }
}

