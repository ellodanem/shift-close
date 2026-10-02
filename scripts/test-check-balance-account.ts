import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  chargedVendorBalanceAccount,
  DEFAULT_VENDOR_CHECK_BALANCE,
  parseCheckBalanceAccount,
  phantomBalances
} from '../lib/checkBalanceAccount'

describe('vendor check balances', () => {
  it('reserves uncashed vendor checks on both phantoms, and cashbook checks on Westline only', () => {
    const phantoms = phantomBalances({
      westlineAvailable: 1000,
      serviceStationAvailable: 800,
      vendorUncashed: 150,
      cashbookUncashed: 40
    })

    assert.equal(phantoms.serviceStationUncashedChecksTotal, 150)
    assert.equal(phantoms.serviceStationPhantom, 650)
    assert.equal(phantoms.uncashedChecksTotal, 190)
    assert.equal(phantoms.phantom, 810)
  })

  it('defaults a vendor check to Service Station and rejects an unknown account', () => {
    assert.equal(DEFAULT_VENDOR_CHECK_BALANCE, 'service_station')
    assert.equal(parseCheckBalanceAccount(undefined), undefined)
    assert.equal(parseCheckBalanceAccount('westline'), 'westline')
    assert.throws(() => parseCheckBalanceAccount('payroll'), /Invalid balance account/)
  })

  it('charges a cleared vendor check to the chosen account, and older checks to Westline', () => {
    assert.equal(
      chargedVendorBalanceAccount({
        paymentMethod: 'check',
        clearedAt: null,
        clearedBalanceAccount: null
      }),
      null
    )
    assert.equal(
      chargedVendorBalanceAccount({
        paymentMethod: 'check',
        clearedAt: new Date('2026-10-01'),
        clearedBalanceAccount: 'service_station'
      }),
      'service_station'
    )
    assert.equal(
      chargedVendorBalanceAccount({
        paymentMethod: 'check',
        clearedAt: new Date('2026-09-01'),
        clearedBalanceAccount: null
      }),
      'westline'
    )
    assert.equal(
      chargedVendorBalanceAccount({
        paymentMethod: 'eft',
        clearedAt: new Date('2026-10-01'),
        clearedBalanceAccount: 'service_station'
      }),
      'westline'
    )
  })
})
