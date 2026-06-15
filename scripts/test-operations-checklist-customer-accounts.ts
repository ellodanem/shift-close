import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fromZonedTime } from 'date-fns-tz'
import { validateCustomerAccountsCompleteAck } from '../lib/customer-accounts-checklist-ack'
import {
  buildCustomerAccountsGroup,
  evaluateCustomerAccountsWeek
} from '../lib/operations-checklist-customer-accounts'
import { weeklySundayTimingStatus } from '../lib/operations-checklist-due-dates'

describe('operations checklist customer accounts', () => {
  it('is not due before Sunday', () => {
    const sunday = '2026-06-14'
    const saturday = fromZonedTime('2026-06-13T12:00:00', 'America/St_Lucia')
    assert.equal(weeklySundayTimingStatus('2026-06-13', sunday, saturday), 'not_due')
  })

  it('is due on Sunday after grace', () => {
    const sunday = '2026-06-14'
    const sundayMorning = fromZonedTime('2026-06-14T10:00:00', 'America/St_Lucia')
    assert.equal(weeklySundayTimingStatus('2026-06-14', sunday, sundayMorning), 'due')
  })

  it('requires charges for eligibility', () => {
    const weekKey = '2026-06-08'
    const evalOk = evaluateCustomerAccountsWeek(weekKey, [
      {
        weekKey,
        year: 2026,
        month: 6,
        accountCount: 40,
        accountsWithCharges: 12
      }
    ])
    assert.equal(evalOk.eligible, true)

    const evalZero = evaluateCustomerAccountsWeek(weekKey, [
      {
        weekKey,
        year: 2026,
        month: 6,
        accountCount: 40,
        accountsWithCharges: 0
      }
    ])
    assert.equal(evalZero.eligible, false)
    assert.equal(evalZero.zeroCharges, true)
  })

  it('validates manual complete requires eligible csv', () => {
    const weekKey = '2026-06-08'
    const blocked = validateCustomerAccountsCompleteAck({ weekKey, importLogs: [] })
    assert.equal(blocked.ok, false)

    const allowed = validateCustomerAccountsCompleteAck({
      weekKey,
      importLogs: [
        {
          weekKey,
          year: 2026,
          month: 6,
          accountCount: 10,
          accountsWithCharges: 2
        }
      ]
    })
    assert.equal(allowed.ok, true)
  })

  it('allows zero-charge override with note', () => {
    const weekKey = '2026-06-08'
    const result = validateCustomerAccountsCompleteAck({
      weekKey,
      importLogs: [
        {
          weekKey,
          year: 2026,
          month: 6,
          accountCount: 10,
          accountsWithCharges: 0
        }
      ],
      overrideZeroCharges: true,
      note: 'Station closed Wed-Fri due to storm'
    })
    assert.equal(result.ok, true)
  })

  it('builds grouped item with backlog', () => {
    const asOf = '2026-06-15'
    const now = fromZonedTime('2026-06-15T10:00:00', 'America/St_Lucia')
    const payload = buildCustomerAccountsGroup({
      asOf,
      now,
      importLogs: [],
      completeAcks: new Set()
    })
    assert.equal(payload.id, 'customer-accounts')
    assert.ok((payload.children?.length ?? 0) >= 2)
  })
})
