import { prisma } from '@/lib/prisma'
import { ensureHarvestSchema } from '@/lib/harvest-agent'
import { ymdToUtcNoonDate } from '@/lib/datetime-policy'
import { invoiceDateToInputValue } from '@/lib/invoiceHelpers'
import { roundMoney, vendorInvoiceTotal } from '@/lib/vendorVat'
import { isRubisWestIndiesVendor } from '@/lib/vendor-rubis-skip'
import { resolveCashbookAccount } from '@/lib/cashbook-accounts'
import { lookupCounterpartyAccount } from '@/lib/cashbook-account-db'
import { adjustOperatingBalance } from '@/lib/checkBalanceAccount'
import {
  applyVendorInvoicesToBatch,
  ApplyVendorInvoicesError
} from '@/lib/applyVendorInvoicesToBatch'
import {
  isOriginalOrSuffixed,
  matchVendorRow,
  parseCstoreInvoiceDate,
  type HarvestCstoreInvoice
} from '@/lib/harvest-vendor-invoices'

export type HarvestPaymentMethod = 'check' | 'eft'

export type HarvestCheckInvoiceInput = {
  invoiceNumber: string
  invoiceDate: string
  amount: number
}

export type HarvestCheckInput = {
  checkNumber: string
  paymentDate?: string | null
  paymentMethod?: HarvestPaymentMethod
  invoices: HarvestCheckInvoiceInput[]
}

export type ShiftCloseInvoiceForCheck = {
  id: string
  invoiceNumber: string
  invoiceDate: string
  amount: number
  vat: number | null
  status: string
  batchId?: string | null
}

export type HarvestExistingBatch = {
  id: string
  bankRef: string
  paymentMethod: string
}

export type HarvestCheckPlan = {
  action: 'create' | 'append' | 'skip_existing' | 'skip_paid' | 'skip_mismatch'
  checkNumber: string
  message: string
  paymentDate?: string
  paymentMethod?: HarvestPaymentMethod
  batchId?: string
  invoiceIds?: string[]
  total?: number
  invoiceCount?: number
}

export type CstorePaymentKind = { kind: 'check' | 'eft' | 'other'; number?: string }

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

function collapsePaymentText(value: string | null | undefined): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseCstorePaymentType(value: string | null | undefined): CstorePaymentKind {
  const text = collapsePaymentText(value)
  if (!text) return { kind: 'other' }

  const check = text.match(/\bche(?:ck|que)\b[^0-9]{0,24}(\d+)/i)
  if (check) {
    return { kind: 'check', number: canonicalCheckNumber(check[1]) }
  }
  if (/\beft\b|electronic|direct debit|direct transfer/i.test(text)) {
    const numbered = text.match(/(\d+)/)
    return { kind: 'eft', number: numbered ? canonicalCheckNumber(numbered[1]) : 'EFT' }
  }
  return { kind: 'other' }
}

function paymentRowKey(row: HarvestCheckInvoiceInput): string {
  return `${row.invoiceNumber}|${row.invoiceDate}|${row.amount}`
}

export function groupCstoreInvoicePayments(rows: HarvestCstoreInvoice[]): HarvestCheckInput[] {
  const byKey = new Map<string, HarvestCheckInput>()
  for (const row of rows || []) {
    const parsed = parseCstorePaymentType(row.paymentType)
    if (parsed.kind !== 'check' && parsed.kind !== 'eft') continue
    const invoiceNumber = String(row.invoiceNumber || '').trim()
    const invoiceDate = String(row.invoiceDate || '').trim()
    const amount = Number(row.amount)
    if (!invoiceNumber || !invoiceDate || !Number.isFinite(amount) || amount <= 0) continue
    const number = parsed.number || (parsed.kind === 'eft' ? 'EFT' : '')
    if (!number) continue
    const key = `${parsed.kind}:${number}`
    const next = { invoiceNumber, invoiceDate, amount }
    const existing = byKey.get(key)
    if (existing) {
      if (!existing.invoices.some((invoice) => paymentRowKey(invoice) === paymentRowKey(next))) {
        existing.invoices.push(next)
      }
      continue
    }
    byKey.set(key, {
      checkNumber: number,
      paymentMethod: parsed.kind,
      invoices: [next]
    })
  }

  const payments = [...byKey.values()]
  for (const payment of payments) {
    payment.paymentDate =
      payment.invoices
        .map((invoice) => parseCstoreInvoiceDate(invoice.invoiceDate))
        .filter((date): date is string => Boolean(date))
        .sort()
        .at(-1) || ''
  }
  payments.sort((a, b) => {
    const method = String(a.paymentMethod).localeCompare(String(b.paymentMethod))
    if (method) return method
    return a.checkNumber.localeCompare(b.checkNumber, undefined, { numeric: true })
  })
  return payments
}

function paymentMethodOf(check: HarvestCheckInput): HarvestPaymentMethod {
  return check.paymentMethod === 'eft' ? 'eft' : 'check'
}

function paymentLabel(method: HarvestPaymentMethod, ref: string): string {
  if (method === 'eft') {
    return !ref || ref.toUpperCase() === 'EFT' ? 'EFT' : `EFT ${ref}`
  }
  return `Check #${ref}`
}

function findExistingBatch(
  batches: HarvestExistingBatch[] | undefined,
  refs: string[] | undefined,
  checkNumber: string,
  method: HarvestPaymentMethod
): HarvestExistingBatch | null {
  const fromBatches = (batches || []).find(
    (batch) =>
      checkNumbersMatch(batch.bankRef, checkNumber) &&
      (batch.paymentMethod === 'eft' ? 'eft' : 'check') === method
  )
  if (fromBatches) return fromBatches
  if ((refs || []).some((ref) => checkNumbersMatch(ref, checkNumber))) {
    return { id: '', bankRef: checkNumber, paymentMethod: method }
  }
  return null
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
  existingCheckRefs?: string[]
  existingBatches?: HarvestExistingBatch[]
}): HarvestCheckPlan {
  const method = paymentMethodOf(opts.check)
  const checkNumber = canonicalCheckNumber(opts.check.checkNumber)
  const label = paymentLabel(method, checkNumber)
  if (!checkNumber) {
    return {
      action: 'skip_mismatch',
      checkNumber: '',
      paymentMethod: method,
      message: `${method === 'eft' ? 'EFT' : 'Check'} not created — missing reference`
    }
  }

  const rows = Array.isArray(opts.check.invoices) ? opts.check.invoices : []
  if (rows.length === 0) {
    return {
      action: 'skip_mismatch',
      checkNumber,
      paymentMethod: method,
      message: `${label} not created — no invoices on the payment`
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
      paymentMethod: method,
      message: `${label} not created — ${parts.join('; ') || 'invoices could not be matched'}`
    }
  }

  const pending = matched.filter((invoice) => invoice.status !== 'paid')
  const paid = matched.filter((invoice) => invoice.status === 'paid')
  const existing = findExistingBatch(
    opts.existingBatches,
    opts.existingCheckRefs,
    checkNumber,
    method
  )

  if (pending.length === 0) {
    return {
      action: existing ? 'skip_existing' : 'skip_paid',
      checkNumber,
      paymentMethod: method,
      batchId: existing?.id || undefined,
      message: `${label} skipped — all ${matched.length} invoice${matched.length === 1 ? '' : 's'} already paid`
    }
  }

  if (paid.length > 0) {
    const allOnExisting =
      Boolean(existing?.id) && paid.every((invoice) => invoice.batchId === existing?.id)
    if (!allOnExisting) {
      return {
        action: 'skip_mismatch',
        checkNumber,
        paymentMethod: method,
        message: `${label} not created — invoice ${listInvoiceNumbers(
          paid.map((invoice) => invoice.invoiceNumber)
        )} already paid`
      }
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
      paymentMethod: method,
      message: `${label} not created — no payment date`
    }
  }

  const pendingTotal = roundMoney(
    pending.reduce((sum, invoice) => sum + vendorInvoiceTotal(invoice.amount, invoice.vat), 0)
  )
  if (existing && !existing.id) {
    return {
      action: 'skip_existing',
      checkNumber,
      paymentMethod: method,
      message: `${label} already recorded`
    }
  }
  if (existing?.id) {
    return {
      action: 'append',
      checkNumber,
      paymentMethod: method,
      paymentDate,
      batchId: existing.id,
      invoiceIds: pending.map((invoice) => invoice.id),
      total: pendingTotal,
      invoiceCount: pending.length,
      message: `${label} updated (${formatMoney(pendingTotal)}, ${pending.length} invoice${
        pending.length === 1 ? '' : 's'
      } added, ${formatUsDate(paymentDate)})`
    }
  }

  return {
    action: 'create',
    checkNumber,
    paymentMethod: method,
    paymentDate,
    invoiceIds: pending.map((invoice) => invoice.id),
    total: pendingTotal,
    invoiceCount: pending.length,
    message: `${label} prepared (${formatMoney(pendingTotal)}, ${pending.length} invoice${
      pending.length === 1 ? '' : 's'
    }, ${formatUsDate(paymentDate)})`
  }
}

class HarvestCheckChangedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HarvestCheckChangedError'
  }
}

async function createHarvestPayment(opts: {
  vendorId: string
  vendorName: string
  checkNumber: string
  paymentDate: string
  paymentMethod: HarvestPaymentMethod
  invoiceIds: string[]
}) {
  return prisma.$transaction(
    async (tx) => {
      const method = opts.paymentMethod === 'eft' ? 'eft' : 'check'
      const existing = await tx.vendorPaymentBatch.findMany({
        where: {
          vendorId: opts.vendorId,
          paymentMethod: method === 'eft' ? 'eft' : { in: ['check', 'cheque'] }
        },
        select: { bankRef: true, paymentMethod: true }
      })
      if (
        existing.some(
          (batch) =>
            checkNumbersMatch(batch.bankRef, opts.checkNumber) &&
            (batch.paymentMethod === 'eft' ? 'eft' : 'check') === method
        )
      ) {
        throw new HarvestCheckChangedError('that payment was recorded before it could be saved')
      }

      const invoices = await tx.vendorInvoice.findMany({
        where: {
          id: { in: opts.invoiceIds },
          vendorId: opts.vendorId,
          status: 'pending'
        }
      })
      if (invoices.length !== opts.invoiceIds.length) {
        throw new HarvestCheckChangedError('an invoice was paid or removed before the payment could be saved')
      }

      const totalAmount = roundMoney(
        invoices.reduce((sum, invoice) => sum + vendorInvoiceTotal(invoice.amount, invoice.vat), 0)
      )
      const resolved = resolveCashbookAccount({
        origin: 'vendor_payment',
        counterpartyRule: await lookupCounterpartyAccount('vendor', opts.vendorName)
      })
      if (method === 'eft') {
        await adjustOperatingBalance(tx, totalAmount, resolved.account, 'deduct')
      }
      const existingBalance = await tx.balance.findUnique({ where: { id: 'balance' } })
      const balanceBefore = existingBalance
        ? resolved.account === 'service_station'
          ? existingBalance.totalAutoAvailable
          : existingBalance.availableFunds
        : 0
      const balanceAfter = roundMoney(balanceBefore - totalAmount)
      const paymentDateObj = ymdToUtcNoonDate(opts.paymentDate)

      const batch = await tx.vendorPaymentBatch.create({
        data: {
          vendorId: opts.vendorId,
          paymentDate: paymentDateObj,
          paymentMethod: method,
          bankRef: opts.checkNumber,
          totalAmount,
          transferDescription: method === 'eft' ? `Total Auto ${invoices.map((invoice) => invoice.invoiceNumber).join(' ')}` : null,
          balanceBefore,
          balanceAfter,
          clearedAt: method === 'eft' ? paymentDateObj : null,
          clearedBalanceAccount: method === 'eft' ? resolved.account : null
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
          data: { status: 'paid', submittedToAccounting: true }
        })
      }

      return { batchId: batch.id, totalAmount, paymentMethod: method, account: resolved.account }
    },
    { timeout: 20_000 }
  )
}

async function addHarvestPaymentToCashbook(opts: {
  batchId: string
  vendorName: string
  checkNumber: string
  paymentDate: string
  totalAmount: number
  paymentMethod: HarvestPaymentMethod
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
    const resolved = resolveCashbookAccount({
      origin: 'vendor_payment',
      counterpartyRule: await lookupCounterpartyAccount('vendor', opts.vendorName)
    })
    const method = opts.paymentMethod === 'eft' ? 'eft' : 'check'
    await prisma.cashbookEntry.create({
      data: {
        date: opts.paymentDate,
        ref: opts.checkNumber,
        description: `Vendor payment (${method}) – ${opts.vendorName} – Ref ${opts.checkNumber}`,
        debitCash: 0,
        debitCheck: method === 'check' ? opts.totalAmount : 0,
        debitEcard: method === 'eft' ? opts.totalAmount : 0,
        debitDcard: 0,
        creditAmt: 0,
        paymentMethod: method,
        account: resolved.account,
        accountSource: resolved.source,
        vendorPaymentBatchId: opts.batchId,
        allocations: { create: [{ categoryId: category.id, amount: opts.totalAmount }] }
      }
    })
  } catch (cashbookErr) {
    console.error('Failed to add harvested vendor payment to cashbook:', cashbookErr)
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
        paidInvoice: { select: { id: true, batchId: true } }
      }
    }),
    prisma.vendorPaymentBatch.findMany({
      where: { vendorId: vendor.id },
      select: { id: true, bankRef: true, paymentMethod: true }
    })
  ])

  const invoices: ShiftCloseInvoiceForCheck[] = invoiceRows.map((row) => ({
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    invoiceDate: invoiceDateToInputValue(row.invoiceDate),
    amount: row.amount,
    vat: row.vat,
    status: row.paidInvoice || row.status === 'paid' ? 'paid' : row.status,
    batchId: row.paidInvoice?.batchId ?? null
  }))
  const existingBatches: HarvestExistingBatch[] = batches.map((batch) => ({
    id: batch.id,
    bankRef: batch.bankRef,
    paymentMethod: batch.paymentMethod
  }))
  const checks: HarvestCheckPlan[] = []

  for (const check of params.checks || []) {
    const plan = planHarvestCheck({ check, invoices, existingBatches })
    if (
      (plan.action !== 'create' && plan.action !== 'append') ||
      !plan.invoiceIds ||
      !plan.paymentDate
    ) {
      checks.push(plan)
      continue
    }

    try {
      if (plan.action === 'append' && plan.batchId) {
        await applyVendorInvoicesToBatch({
          batchId: plan.batchId,
          selectedInvoiceIds: plan.invoiceIds
        })
      } else {
        const createdPayment = await createHarvestPayment({
          vendorId: vendor.id,
          vendorName: vendor.name,
          checkNumber: plan.checkNumber,
          paymentDate: plan.paymentDate,
          paymentMethod: plan.paymentMethod === 'eft' ? 'eft' : 'check',
          invoiceIds: plan.invoiceIds
        })
        await addHarvestPaymentToCashbook({
          batchId: createdPayment.batchId,
          vendorName: vendor.name,
          checkNumber: plan.checkNumber,
          paymentDate: plan.paymentDate,
          totalAmount: createdPayment.totalAmount,
          paymentMethod: createdPayment.paymentMethod
        })
        existingBatches.push({
          id: createdPayment.batchId,
          bankRef: plan.checkNumber,
          paymentMethod: createdPayment.paymentMethod
        })
      }
      for (const invoice of invoices) {
        if (plan.invoiceIds.includes(invoice.id)) {
          invoice.status = 'paid'
          invoice.batchId = plan.batchId || existingBatches.at(-1)?.id || invoice.batchId
        }
      }
      checks.push(plan)
    } catch (err) {
      const recoverable =
        err instanceof HarvestCheckChangedError || err instanceof ApplyVendorInvoicesError
      if (recoverable) {
        checks.push({
          action: 'skip_mismatch',
          checkNumber: plan.checkNumber,
          paymentMethod: plan.paymentMethod,
          message: `${paymentLabel(plan.paymentMethod === 'eft' ? 'eft' : 'check', plan.checkNumber)} not created — ${
            err instanceof Error ? err.message : 'payment could not be saved'
          }`
        })
        continue
      }
      throw err
    }
  }

  const created = checks.filter((check) => check.action === 'create' || check.action === 'append').length
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
