import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  accountFieldsForSync,
  isAccountLocked,
  normalizeCounterparty,
  otherCashbookAccount,
  parseCashbookAccount,
  resolveCashbookAccount
} from '../lib/cashbook-accounts'

describe('resolveCashbookAccount', () => {
  it('sends shift deposits to Westline and shift card income to Service Station', () => {
    assert.deepEqual(resolveCashbookAccount({ origin: 'shift_deposit' }), { account: 'westline', source: 'rule' })
    assert.deepEqual(resolveCashbookAccount({ origin: 'shift_card' }), {
      account: 'service_station',
      source: 'rule'
    })
  })

  it('sends fuel payments to Westline and vendor payments and payroll to Service Station', () => {
    assert.equal(resolveCashbookAccount({ origin: 'fuel_payment' }).account, 'westline')
    assert.equal(resolveCashbookAccount({ origin: 'vendor_payment' }).account, 'service_station')
    assert.equal(resolveCashbookAccount({ origin: 'payroll' }).account, 'service_station')
  })

  it('defaults customer payments to Westline unless a customer rule says otherwise', () => {
    assert.equal(resolveCashbookAccount({ origin: 'customer_payment' }).account, 'westline')
    assert.deepEqual(resolveCashbookAccount({ origin: 'customer_payment', counterpartyRule: 'service_station' }), {
      account: 'service_station',
      source: 'rule'
    })
  })

  it('lets a person override any default', () => {
    assert.deepEqual(resolveCashbookAccount({ origin: 'shift_card', explicit: 'westline' }), {
      account: 'westline',
      source: 'manual'
    })
    assert.deepEqual(resolveCashbookAccount({ origin: 'bank_statement', explicit: 'service_station', explicitSource: 'rule' }), {
      account: 'service_station',
      source: 'rule'
    })
  })

  it('applies category rules to manual entries and falls back to Westline', () => {
    assert.equal(
      resolveCashbookAccount({ origin: 'manual', type: 'income', categoryName: 'Debit Card' }).account,
      'service_station'
    )
    assert.equal(resolveCashbookAccount({ origin: 'manual', type: 'income', categoryName: 'Deposit' }).account, 'westline')
    assert.equal(
      resolveCashbookAccount({
        origin: 'manual',
        type: 'expense',
        categoryName: 'Bank charges',
        description: 'Debit and Credit card charges'
      }).account,
      'service_station'
    )
    assert.deepEqual(resolveCashbookAccount({ origin: 'manual', type: 'expense', categoryName: 'Utilities' }), {
      account: 'westline',
      source: 'default'
    })
  })
})

describe('account locking', () => {
  it('treats manual, confirmed and upload as locked', () => {
    assert.equal(isAccountLocked('manual'), true)
    assert.equal(isAccountLocked('confirmed'), true)
    assert.equal(isAccountLocked('upload'), true)
    assert.equal(isAccountLocked('rule'), false)
    assert.equal(isAccountLocked('default'), false)
    assert.equal(isAccountLocked(null), false)
  })

  it('does not let a sync overwrite a chosen or backfilled account', () => {
    const resolved = { account: 'westline' as const, source: 'rule' as const }
    assert.deepEqual(accountFieldsForSync({ account: 'service_station', accountSource: 'manual' }, resolved), {})
    assert.deepEqual(accountFieldsForSync({ account: 'service_station', accountSource: 'confirmed' }, resolved), {})
    assert.deepEqual(accountFieldsForSync({ account: 'service_station', accountSource: 'backfill' }, resolved), {})
    assert.deepEqual(accountFieldsForSync({ account: 'service_station', accountSource: 'rule' }, resolved), {
      account: 'westline',
      accountSource: 'rule'
    })
    assert.deepEqual(accountFieldsForSync(null, resolved), { account: 'westline', accountSource: 'rule' })
  })
})

describe('helpers', () => {
  it('parses accounts and finds the other one', () => {
    assert.equal(parseCashbookAccount(undefined), undefined)
    assert.equal(parseCashbookAccount('service_station'), 'service_station')
    assert.throws(() => parseCashbookAccount('petty_cash'), /Invalid cashbook account/)
    assert.equal(otherCashbookAccount('westline'), 'service_station')
    assert.equal(otherCashbookAccount('service_station'), 'westline')
  })

  it('normalizes counterparty names', () => {
    assert.equal(normalizeCounterparty('  Massy   Stores '), 'massy stores')
    assert.equal(normalizeCounterparty(null), '')
  })
})
