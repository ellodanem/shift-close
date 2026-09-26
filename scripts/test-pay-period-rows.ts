import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  attendanceForStaff,
  blankReportOnlyStaffSaveError,
  createReportOnlyPayPeriodRow,
  formatSickDays,
  isBlankReportOnlyPayPeriodRow,
  payPeriodAttendanceFromRows,
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

describe('pay period attendance columns', () => {
  it('reads vacation and sick days the same way as the attendance report', () => {
    const raw = JSON.stringify([
      { staffId: 'jovita', staffName: 'Jovita Henry', vacation: '********', sickLeaveDays: 0 },
      { staffId: 'elena', staffName: 'Elena James', vacation: '', sickLeaveDays: 5 },
      { staffId: 'sylvana', staffName: 'Sylvana Aimable', sickLeaveDays: '7' }
    ])
    const byKey = payPeriodAttendanceFromRows(raw)
    assert.deepEqual(attendanceForStaff(byKey, 'jovita', 'Jovita Henry'), {
      vacation: '********',
      sickLeaveDays: 0
    })
    assert.deepEqual(attendanceForStaff(byKey, null, 'Elena James'), {
      vacation: '',
      sickLeaveDays: 5
    })
    assert.equal(attendanceForStaff(byKey, 'sylvana', 'Someone Else').sickLeaveDays, 7)
    assert.deepEqual(attendanceForStaff(byKey, 'missing', 'Nobody'), { vacation: '', sickLeaveDays: 0 })
    assert.equal(formatSickDays(12), '12')
    assert.equal(formatSickDays(1.5), '1.5')
  })
})
