import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildExpectedRevenueShareText, type ExpectedRevenueShareInput } from '../lib/expected-revenue-share'

const sample: ExpectedRevenueShareInput = {
  startDate: '2026-10-01',
  endDate: '2026-10-02',
  grandTotal: 15345.6,
  totalDeposits: 4000,
  totalDebitAndCredit: 10000.5,
  totalDebit: 8000.5,
  totalCredit: 2000,
  totalFleet: 1000,
  totalVouchers: 345.1,
  shiftCount: 3,
  byDay: [
    {
      date: '2026-10-01',
      grandTotal: 7000,
      depositsTotal: 2000,
      cardTotal: 4500,
      depositsAndCardTotal: 6500
    },
    {
      date: '2026-10-02',
      grandTotal: 8345.6,
      depositsTotal: 2000,
      cardTotal: 5500.5,
      depositsAndCardTotal: 7500.5
    }
  ]
}

describe('expected revenue share text', () => {
  it('includes the full grand total, components, and each day', () => {
    const text = buildExpectedRevenueShareText(sample, false)
    assert.match(text, /^Expected revenue\nOct 1, 2026 – Oct 2, 2026\n3 shifts/)
    assert.match(text, /Grand total: \$15,345\.60/)
    assert.doesNotMatch(text, /excluded/)
    assert.match(text, /Deposits: \$4,000\.00/)
    assert.match(text, /Card: \$10,000\.50/)
    assert.match(text, /Debit \(system\): \$8,000\.50/)
    assert.match(text, /Credit \(other\): \$2,000\.00/)
    assert.match(text, /Fleet: \$1,000\.00/)
    assert.match(text, /Vouchers \/ coupons: \$345\.10/)
    assert.match(text, /Oct 1, 2026 — \$7,000\.00 \(deposits \$2,000\.00, card \$4,500\.00\)/)
    assert.match(text, /Oct 2, 2026 — \$8,345\.60 \(deposits \$2,000\.00, card \$5,500\.50\)/)
  })

  it('uses deposits plus card as the total when fleet and vouchers are excluded', () => {
    const text = buildExpectedRevenueShareText(sample, true)
    assert.match(text, /Grand total: \$14,000\.50/)
    assert.match(text, /Deposits \+ card only \(fleet & vouchers excluded\)/)
    assert.match(text, /Fleet: \$1,000\.00/)
    assert.match(text, /Oct 1, 2026 — \$6,500\.00/)
    assert.match(text, /Oct 2, 2026 — \$7,500\.50/)
  })

  it('omits the by-day section for a single day', () => {
    const text = buildExpectedRevenueShareText(
      {
        ...sample,
        startDate: '2026-10-02',
        endDate: '2026-10-02',
        shiftCount: 1,
        byDay: [sample.byDay[1]]
      },
      false
    )
    assert.match(text, /^Expected revenue\nOct 2, 2026\n1 shift\n/)
    assert.doesNotMatch(text, /By day/)
  })
})
