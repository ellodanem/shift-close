import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'

/** Upsert monthly A/R summary; stores previous charges/payments for dashboard deltas. */
export async function upsertCustomerArSummaryRow(input: {
  year: number
  month: number
  opening: number
  charges: number
  payments: number
  closing: number | null
  /** When set, updates notes; when omitted, existing notes are left unchanged on update. */
  notes?: string
}) {
  const existing = await prisma.customerArSummary.findUnique({
    where: {
      customer_ar_year_month: { year: input.year, month: input.month }
    }
  })

  const opening = roundMoney(input.opening)
  const charges = roundMoney(input.charges)
  const payments = roundMoney(input.payments)
  const closing =
    input.closing !== null && input.closing !== undefined && !Number.isNaN(input.closing)
      ? roundMoney(input.closing)
      : null

  const updateData: Prisma.CustomerArSummaryUpdateInput = {
    opening,
    charges,
    payments,
    closing,
    ...(existing
      ? {
          chargesPrevious: roundMoney(existing.charges),
          paymentsPrevious: roundMoney(existing.payments)
        }
      : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {})
  }

  return prisma.customerArSummary.upsert({
    where: {
      customer_ar_year_month: { year: input.year, month: input.month }
    },
    create: {
      year: input.year,
      month: input.month,
      opening,
      charges,
      payments,
      closing,
      notes: input.notes ?? ''
    },
    update: updateData
  })
}
