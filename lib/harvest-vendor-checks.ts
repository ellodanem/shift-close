import { prisma } from '@/lib/prisma'
import { ensureHarvestSchema } from '@/lib/harvest-agent'
import { ymdToUtcNoonDate } from '@/lib/datetime-policy'
import { invoiceDateToInputValue } from '@/lib/invoiceHelpers'
import { roundMoney, vendorInvoiceTotal } from '@/lib/vendorVat'
import { isRubisWestIndiesVendor } from '@/lib/vendor-rubis-skip'
import {
  isOriginalOrSuffixed,
  matchVendorRow,
  parseCstoreInvoiceDate
} from '@/lib/harvest-vendor-invoices'

export type HarvestCheckInvoiceInput = {
  invoiceNumber: string
  invoiceDate: string
  amount: number
}

export type HarvestCheckInput = {
  checkNumber: string
  paymentDate?: string | null
  invoices: HarvestCheckInvoiceInput[]
}

export type ShiftCloseInvoiceForCheck = {
  id: string
  invoiceNumber: string
  invoiceDate: string
  amount: number
  vat: number | null
  status: string
}

export type HarvestCheckPlan = {
  action: 'create' | 'skip_existing' | 'skip_paid' | 'skip_mismatch'
  checkNumber: string
  message: string
  paymentDate?: string
  invoiceIds?: string[]
  total?: number
  invoiceCount?: number
}

export type HarvestVendorCheckResult = {
  vendorId: string
  vendorName: string
  cstoreName: string
  created: number
  skipped: number
  checks: HarvestCheckPlan[]
  errors: { checkNumber: string; message: string }[]
}

function canonicalCheckNumber(value: string): string {
  const raw = String(value || '').trim()
  const labeled = raw.match(/\bche(?:ck|que)\b[^0-9]*(\d+)/i)
  const digits = labeled?.[1] || raw.match(/^#?\s*0*(\d+)$/)?.[1]
  if (!digits) return raw
  return digits.replace(/^0+/, '') || '0'
}

export function checkNumbersMatch(a: string, b: string): boolean {
  const left = canonicalCheckNumber(a)
  const right = canonicalCheckNumber(b)
  if (!left || !right) return false
  return left.toLowerCase() === right.toLowerCase()
}

function formatMoney(amount: number): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD'
  })
}

function formatUsDate(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!match) return ymd
  return `${Number(match[2])}/${Number(match[3])}/${match[1]}`
}

function listInvoiceNumbers(numbers: string[]): string {
  const shown = numbers.slice(0, 4)
  const extra = numbers.length > 4 ? ` and ${numbers.length - 4} more` : ''
  return `${shown.join(', ')}${extra}`
}

function latestYmd(dates: string[]): string {
  return dates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort().at(-1) || ''
}

export function planHarvestCheck(opts: {
  check: HarvestCheckInput
  invoices: ShiftCloseInvoiceForCheck[]
  existingCheckRefs: string[]
}): HarvestCheckPlan {
  const checkNumber = canonicalCheckNumber(opts.check.checkNumber)
  if (!checkNumber) {
    return {
      action: 'skip_mismatch',
      checkNumber: '',
      message: 'Check not created — missing check number'
    }
  }

  const rows = Array.isArray(opts.check.invoices) ? opts.check.invoices : []
  if (rows.length === 0) {
    return {
      action: 'skip_mismatch',
      checkNumber,
      message: `Check #${checkNumber} not created — no invoices on the check`
    }
  }

  if ((opts.existingCheckRefs || []).some((ref) => checkNumbersMatch(ref, checkNumber))) {
    return {
      action: 'skip_existing',
      checkNumber,
      message: `Check #${checkNumber} already recorded`
    }
  }

  const missing: string[] = []
  const amountMismatch: string[] = []
  const ambiguous: string[] = []
  const matched: ShiftCloseInvoiceForCheck[] = []
  const usedIds = new Set<string>()

  for (const row of rows) {
    const invoiceNumber = String(row.invoiceNumber || '').trim()
    const dateYmd = parseCstoreInvoiceDate(String(row.invoiceDate || ''))
    const amount = roundMoney(Number(row.amount))
    if (!invoiceNumber || !dateYmd || !Number.isFinite(amount) || amount <= 0) {
      missing.push(invoiceNumber || '(blank)')
      continue
    }

    const sameNumber = opts.invoices.filter((invoice) =>
      isOriginalOrSuffixed(invoice.invoiceNumber, invoiceNumber)
    )
    const candidates = sameNumber.filter(
      (invoice) =>
        invoice.invoiceDate === dateYmd &&
        vendorInvoiceTotal(invoice.amount, invoice.vat) === amount
    )
    const exact = candidates.find((invoice) => invoice.invoiceNumber === invoiceNumber)
    const chosen = exact || (candidates.length === 1 ? candidates[0] : null)

    if (!chosen) {
      if (candidates.length > 1) ambiguous.push(invoiceNumber)
      else if (sameNumber.length > 0) amountMismatch.push(invoiceNumber)
      else missing.push(invoiceNumber)
      continue
    }
    if (usedIds.has(chosen.id)) {
      ambiguous.push(invoiceNumber)
      continue
    }
    usedIds.add(chosen.id)
    matched.push(chosen)
  }

  if (missing.length || amountMismatch.length || ambiguous.length || matched.length !== rows.length) {
    const parts: string[] = []
    if (missing.length) parts.push(`invoice ${listInvoiceNumbers(missing)} is not in Shift Close`)
    if (amountMismatch.length) {
      parts.push(`invoice ${listInvoiceNumbers(amountMismatch)} date or amount does not match`)
    }
    if (ambiguous.length) parts.push(`invoice ${listInvoiceNumbers(ambiguous)} matches more than one invoice`)
    return {
      action: 'skip_mismatch',
      checkNumber,
      message: `Check #${checkNumber} not created — ${parts.join('; ') || 'invoices could not be matched'}`
    }
  }

  const paid = matched.filter((invoice) => invoice.status === 'paid')
  if (paid.length === matched.length) {
    return {
      action: 'skip_paid',
      checkNumber,
      message: `Check #${checkNumber} skipped — all ${matched.length} invoice${matched.length === 1 ? '' : 's'} already paid`
    }
  }
  if (paid.length > 0) {
    return {
      action: 'skip_mismatch',
      checkNumber,
      message: `Check #${checkNumber} not created — invoice ${listInvoiceNumbers(
        paid.map((invoice) => invoice.invoiceNumber)
      )} already paid`
    }
  }

  const paymentDate =
    latestYmd(matched.map((invoice) => invoice.invoiceDate)) ||
    parseCstoreInvoiceDate(String(opts.check.paymentDate || '')) ||
    ''
  if (!paymentDate) {
    return {
      action: 'skip_mismatch',
      checkNumber,
      message: `Check #${checkNumber} not created — no payment date`
    }
  }

  const total = roundMoney(
    matched.reduce((sum, invoice) => sum + vendorInvoiceTotal(invoice.amount, invoice.vat), 0)
  )
  return {
    action: 'create',
    checkNumber,
    paymentDate,
    invoiceIds: matched.map((invoice) => invoice.id),
    total,
    invoiceCount: matched.length,
    message: `Check #${checkNumber} prepared (${formatMoney(total)}, ${matched.length} invoice${
      matched.length === 1 ? '' : 's'
    }, ${formatUsDate(paymentDate)})`
  }
}

class HarvestCheckChangedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HarvestCheckChangedError'
  }
}

async function createUncashedCheck(opts: {
  vendorId: string
  vendorName: string
  checkNumber: string
  paymentDate: string
  invoiceIds: string[]
}) {
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.vendorPaymentBatch.findMany({
        where: { vendorId: opts.vendorId, paymentMethod: { in: ['check', 'cheque'] } },
        select: { bankRef: true }
      })
      if (existing.some((batch) => checkNumbersMatch(batch.bankRef, opts.checkNumber))) {
        throw new HarvestCheckChangedError('that check number was recorded before it could be saved')
      }

      const invoices = await tx.vendorInvoice.findMany({
        where: {
          id: { in: opts.invoiceIds },
          vendorId: opts.vendorId,
          status: 'pending'
        }
      })
      if (invoices.length !== opts.invoiceIds.length) {
        throw new HarvestCheckChangedError('an invoice was paid or removed before the check could be saved')
      }

      const totalAmount = roundMoney(
        invoices.reduce((sum, invoice) => sum + vendorInvoiceTotal(invoice.amount, invoice.vat), 0)
      )
      const existingBalance = await tx.balance.findUnique({ where: { id: 'balance' } })
      const balanceBefore = existingBalance ? existingBalance.availableFunds : 0
      const balanceAfter = roundMoney(balanceBefore - totalAmount)
      const paymentDateObj = ymdToUtcNoonDate(opts.paymentDate)

      const batch = await tx.vendorPaymentBatch.create({
        data: {
          vendorId: opts.vendorId,
          paymentDate: paymentDateObj,
          paymentMethod: 'check',
          bankRef: opts.checkNumber,
          totalAmount,
          transferDescription: null,
          balanceBefore,
          balanceAfter,
          clearedAt: null
        }
      })

      for (const invoice of invoices) {
        await tx.paidVendorInvoice.create({
          data: {
            vendorInvoiceId: invoice.id,
            batchId: batch.id,
            invoiceNumber: invoice.invoiceNumber,
            amount: vendorInvoiceTotal(invoice.amount, invoice.vat),
            invoiceDate: invoice.invoiceDate,
            vat: invoice.vat ?? 0
          }
        })
        await tx.vendorInvoice.update({
          where: { id: invoice.id },
          data: { status: 'paid' }
        })
      }

      return { batchId: batch.id, totalAmount }
    },
    { timeout: 20_000 }
  )
}

async function addCheckToCashbook(opts: {
  batchId: string
  vendorName: string
  checkNumber: string
  paymentDate: string
  totalAmount: number
}) {
  try {
    let category = await prisma.cashbookCategory.findFirst({
      where: { name: { equals: 'Rec. Gen', mode: 'insensitive' }, type: 'expense' }
    })
    if (!category) {
      category = await prisma.cashbookCategory.create({
        data: { name: 'Rec. Gen', code: '3021', type: 'expense', sortOrder: 0, active: true }
      })
    }
    await prisma.cashbookEntry.create({
      data: {
        date: opts.paymentDate,
        ref: opts.checkNumber,
        description: `Vendor payment (check) – ${opts.vendorName} – Ref ${opts.checkNumber}`,
        debitCash: 0,
        debitCheck: opts.totalAmount,
        debitEcard: 0,
        debitDcard: 0,
        creditAmt: 0,
        paymentMethod: 'check',
        vendorPaymentBatchId: opts.batchId,
        allocations: { create: [{ categoryId: category.id, amount: opts.totalAmount }] }
      }
    })
  } catch (cashbookErr) {
    console.error('Failed to add harvested check to cashbook:', cashbookErr)
  }
}

export async function importHarvestVendorChecks(params: {
  cstoreVendorName: string
  checks: HarvestCheckInput[]
}): Promise<HarvestVendorCheckResult> {
  const cstoreName = params.cstoreVendorName.trim()
  if (!cstoreName) throw new Error('cstoreVendorName is required')

  if (isRubisWestIndiesVendor(cstoreName)) {
    return {
      vendorId: '',
      vendorName: cstoreName,
      cstoreName,
      created: 0,
      skipped: params.checks.length,
      checks: (params.checks || []).map((check) => ({
        action: 'skip_mismatch' as const,
        checkNumber: canonicalCheckNumber(check.checkNumber),
        message: `${cstoreName}: skipped on vendor checks`
      })),
      errors: []
    }
  }

  await ensureHarvestSchema()

  const vendors = await prisma.vendor.findMany({
    select: { id: true, name: true, cstoreName: true }
  })
  const vendor = matchVendorRow(vendors, cstoreName)
  if (!vendor) {
    return {
      vendorId: '',
      vendorName: cstoreName,
      cstoreName,
      created: 0,
      skipped: params.checks.length,
      checks: [],
      errors: [
        {
          checkNumber: '',
          message: `No Shift Close vendor mapped for Cstore "${cstoreName}". Set Cstore name on the correct vendor, then re-run.`
        }
      ]
    }
  }

  const [invoiceRows, batches] = await Promise.all([
    prisma.vendorInvoice.findMany({
      where: { vendorId: vendor.id },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        amount: true,
        vat: true,
        status: true,
        paidInvoice: { select: { id: true } }
      }
    }),
    prisma.vendorPaymentBatch.findMany({
      where: { vendorId: vendor.id, paymentMethod: { in: ['check', 'cheque'] } },
      select: { bankRef: true }
    })
  ])

  const invoices: ShiftCloseInvoiceForCheck[] = invoiceRows.map((row) => ({
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    invoiceDate: invoiceDateToInputValue(row.invoiceDate),
    amount: row.amount,
    vat: row.vat,
    status: row.paidInvoice || row.status === 'paid' ? 'paid' : row.status
  }))
  const existingCheckRefs = batches.map((batch) => batch.bankRef)
  const checks: HarvestCheckPlan[] = []

  for (const check of params.checks || []) {
    const plan = planHarvestCheck({ check, invoices, existingCheckRefs })
    if (plan.action !== 'create' || !plan.invoiceIds || !plan.paymentDate) {
      checks.push(plan)
      continue
    }

    try {
      const createdCheck = await createUncashedCheck({
        vendorId: vendor.id,
        vendorName: vendor.name,
        checkNumber: plan.checkNumber,
        paymentDate: plan.paymentDate,
        invoiceIds: plan.invoiceIds
      })
      await addCheckToCashbook({
        batchId: createdCheck.batchId,
        vendorName: vendor.name,
        checkNumber: plan.checkNumber,
        paymentDate: plan.paymentDate,
        totalAmount: createdCheck.totalAmount
      })
      existingCheckRefs.push(plan.checkNumber)
      for (const invoice of invoices) {
        if (plan.invoiceIds.includes(invoice.id)) invoice.status = 'paid'
      }
      checks.push(plan)
    } catch (err) {
      if (err instanceof HarvestCheckChangedError) {
        checks.push({
          action: 'skip_mismatch',
          checkNumber: plan.checkNumber,
          message: `Check #${plan.checkNumber} not created — ${err.message}`
        })
        continue
      }
      throw err
    }
  }

  const created = checks.filter((check) => check.action === 'create').length
  return {
    vendorId: vendor.id,
    vendorName: vendor.name,
    cstoreName,
    created,
    skipped: checks.length - created,
    checks,
    errors: []
  }
}

export function summarizeHarvestChecks(vendorName: string, checks: HarvestCheckPlan[]): string {
  if (!checks.length) return `${vendorName}: no check payments`
  return `${vendorName}: ${checks.map((check) => check.message).join('; ')}`
}
