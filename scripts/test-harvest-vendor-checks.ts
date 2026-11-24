import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  checkNumbersMatch,
  groupCstoreInvoicePayments,
  parseCstorePaymentType,
  planHarvestCheck,
  type ShiftCloseInvoiceForCheck
} from '../lib/harvest-vendor-checks'

const acadoInvoices: ShiftCloseInvoiceForCheck[] = [
  {
    id: 'a',
    invoiceNumber: '002093072',
    invoiceDate: '2026-08-26',
    amount: 2484.35,
    vat: 0,
    status: 'pending'
  },
  {
    id: 'b',
    invoiceNumber: '2062886',
    invoiceDate: '2026-08-24',
    amount: 1897.31,
    vat: 0,
    status: 'pending'
  },
  {
    id: 'c',
    invoiceNumber: '2050106',
    invoiceDate: '2026-08-06',
    amount: 1804.17,
    vat: 0,
    status: 'pending'
  },
  {
    id: 'd',
    invoiceNumber: '2058939',
    invoiceDate: '2026-08-05',
    amount: 2008.27,
    vat: 0,
    status: 'pending'
  }
]

const acadoCheck = {
  checkNumber: '857',
  paymentDate: '2026-08-26',
  invoices: [
    { invoiceNumber: '002093072', invoiceDate: '8/26/2026', amount: 2484.35 },
    { invoiceNumber: '2062886', invoiceDate: '8/24/2026', amount: 1897.31 },
    { invoiceNumber: '2050106', invoiceDate: '8/6/2026', amount: 1804.17 },
    { invoiceNumber: '2058939', invoiceDate: '8/5/2026', amount: 2008.27 }
  ]
}

describe('harvest vendor checks', () => {
  it('matches check 857 to 0857 and Check # 857', () => {
    assert.equal(checkNumbersMatch('857', '0857'), true)
    assert.equal(checkNumbersMatch('857', 'Check # 857'), true)
    assert.equal(checkNumbersMatch('857', '858'), false)
  })

  it('prepares one Acado check for the four August invoices', () => {
    const plan = planHarvestCheck({
      check: acadoCheck,
      invoices: acadoInvoices,
      existingCheckRefs: []
    })
    assert.equal(plan.action, 'create')
    assert.equal(plan.checkNumber, '857')
    assert.equal(plan.paymentDate, '2026-08-26')
    assert.equal(plan.total, 8194.1)
    assert.deepEqual(plan.invoiceIds, ['a', 'b', 'c', 'd'])
  })

  it('does not add a check number that is already recorded', () => {
    const plan = planHarvestCheck({
      check: acadoCheck,
      invoices: acadoInvoices,
      existingCheckRefs: ['0857']
    })
    assert.equal(plan.action, 'skip_existing')
  })

  it('adds unpaid invoices onto a recorded check instead of leaving them pending', () => {
    const plan = planHarvestCheck({
      check: acadoCheck,
      invoices: acadoInvoices,
      existingBatches: [{ id: 'batch-857', bankRef: '0857', paymentMethod: 'check' }]
    })
    assert.equal(plan.action, 'append')
    assert.equal(plan.batchId, 'batch-857')
    assert.deepEqual(plan.invoiceIds, ['a', 'b', 'c', 'd'])
  })

  it('skips a check when every invoice is already paid', () => {
    const plan = planHarvestCheck({
      check: acadoCheck,
      invoices: acadoInvoices.map((invoice) => ({ ...invoice, status: 'paid' })),
      existingCheckRefs: []
    })
    assert.equal(plan.action, 'skip_paid')
  })

  it('appends only the unpaid invoices when some are already on that check', () => {
    const plan = planHarvestCheck({
      check: acadoCheck,
      invoices: acadoInvoices.map((invoice) =>
        invoice.id === 'a'
          ? { ...invoice, status: 'paid', batchId: 'batch-857' }
          : invoice
      ),
      existingBatches: [{ id: 'batch-857', bankRef: '857', paymentMethod: 'check' }]
    })
    assert.equal(plan.action, 'append')
    assert.deepEqual(plan.invoiceIds, ['b', 'c', 'd'])
  })

  it('does not create a short check when one invoice is missing or already paid', () => {
    const missing = planHarvestCheck({
      check: acadoCheck,
      invoices: acadoInvoices.filter((invoice) => invoice.id !== 'c'),
      existingCheckRefs: []
    })
    assert.equal(missing.action, 'skip_mismatch')
    assert.match(missing.message, /2050106/)

    const paid = planHarvestCheck({
      check: acadoCheck,
      invoices: acadoInvoices.map((invoice) =>
        invoice.id === 'b' ? { ...invoice, status: 'paid' } : invoice
      ),
      existingCheckRefs: []
    })
    assert.equal(paid.action, 'skip_mismatch')
    assert.match(paid.message, /2062886/)
  })

  it('uses a lettered invoice number and the VAT-inclusive total', () => {
    const plan = planHarvestCheck({
      check: {
        checkNumber: '860',
        invoices: [{ invoiceNumber: '2062886', invoiceDate: '8/24/2026', amount: 112.5 }]
      },
      invoices: [
        {
          id: 'lettered',
          invoiceNumber: '2062886A',
          invoiceDate: '2026-08-24',
          amount: 100,
          vat: 12.5,
          status: 'pending'
        }
      ],
      existingCheckRefs: []
    })
    assert.equal(plan.action, 'create')
    assert.deepEqual(plan.invoiceIds, ['lettered'])
    assert.equal(plan.total, 112.5)
    assert.equal(plan.paymentDate, '2026-08-24')
  })

  it('reads Check (# 27) Previously Unpaid and numbered EFT', () => {
    assert.deepEqual(parseCstorePaymentType('Check (# 27)\nPreviously Unpaid'), {
      kind: 'check',
      number: '27'
    })
    assert.deepEqual(parseCstorePaymentType('EFT (# 44)'), { kind: 'eft', number: '44' })
    assert.deepEqual(parseCstorePaymentType('EFT'), { kind: 'eft', number: 'EFT' })
  })

  it('groups October Cstore payment types into checks and EFT', () => {
    const payments = groupCstoreInvoicePayments([
      {
        invoiceNumber: '1161196',
        invoiceDate: '10/30/2026',
        amount: 2308.6,
        paymentType: 'EFT'
      },
      {
        invoiceNumber: '88330',
        invoiceDate: '10/30/2026',
        amount: 45,
        paymentType: 'Check (# 27) Previously Unpaid'
      },
      {
        invoiceNumber: '1459657',
        invoiceDate: '10/30/2026',
        amount: 4317.32,
        paymentType: 'Check (# 37)\nPreviously Unpaid'
      }
    ])
    assert.equal(payments.length, 3)
    const check27 = payments.find((payment) => payment.checkNumber === '27')
    assert.equal(check27?.paymentMethod, 'check')
    assert.deepEqual(
      check27?.invoices.map((invoice) => invoice.invoiceNumber),
      ['88330']
    )
    const eft = payments.find((payment) => payment.paymentMethod === 'eft')
    assert.equal(eft?.checkNumber, 'EFT')
    assert.deepEqual(
      eft?.invoices.map((invoice) => invoice.invoiceNumber),
      ['1161196']
    )
  })
})
