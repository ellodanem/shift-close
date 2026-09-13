import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  blankReportOnlyStaffSaveError,
  createReportOnlyPayPeriodRow,
  isBlankReportOnlyPayPeriodRow,
  REPORT_ONLY_PAY_PERIOD_STAFF_ID_PREFIX
} from '../lib/pay-period-rows'

describe('pay period report-only rows', () => {
  it('creates a blank added staff row', () => {
    const row = createReportOnlyPayPeriodRow()
    assert.ok(row.staffId.startsWith(REPORT_ONLY_PAY_PERIOD_STAFF_ID_PREFIX))
    assert.equal(row.staffName, '')
    assert.equal(row.transTtl, 0)
    assert.ok(isBlankReportOnlyPayPeriodRow(row))
  })

  it('blocks save while an added staff row has no name', () => {
    const blank = createReportOnlyPayPeriodRow()
    const named = { ...createReportOnlyPayPeriodRow(), staffName: 'Temp worker' }
    const directory = { staffId: 'staff-1', staffName: 'Althea Frank' }
    assert.equal(
      blankReportOnlyStaffSaveError([directory, blank]),
      'Name or delete the blank staff row before saving.'
    )
    assert.equal(
      blankReportOnlyStaffSaveError([directory, blank, createReportOnlyPayPeriodRow()]),
      'Name or delete the 2 blank staff rows before saving.'
    )
    assert.equal(blankReportOnlyStaffSaveError([directory, named]), null)
    assert.equal(
      blankReportOnlyStaffSaveError([directory, { ...blank, staffName: '   ' }]),
      'Name or delete the blank staff row before saving.'
    )
  })
})
