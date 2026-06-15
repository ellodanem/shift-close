import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fromZonedTime } from 'date-fns-tz'
import { buildOperationsChecklist } from '../lib/operations-checklist'
import type { DayReport } from '../lib/types'

function emptyDayReport(date: string, partial?: Partial<DayReport>): DayReport {
  return {
    date,
    dayType: 'Standard',
    status: 'Incomplete',
    shifts: [],
    totals: {
      overShortTotal: 0,
      overShortDisclosedTotal: null,
      totalDeposits: 0,
      totalCredit: 0,
      totalDebit: 0,
      systemCashTotal: 0,
      countCashTotal: 0,
      totalUnleaded: 0,
      totalDiesel: 0
    },
    depositScans: [],
    debitScans: [],
    securityScans: [],
    ...partial
  }
}

describe('operations checklist shift-close group', () => {
  it('groups missed days under Update Shift on Friday', () => {
    const asOf = '2026-06-12'
    const now = fromZonedTime('2026-06-12T10:00:00', 'America/St_Lucia')
    const payload = buildOperationsChecklist({
      asOf,
      now,
      role: 'admin',
      showFinancial: false,
      dayReportsByDate: new Map(),
      comparisonRowsByDate: new Map(),
      stationClosedDates: new Set(),
      bankHolidayDates: new Set(),
      acknowledgements: [],
      customerArUpdatedAt: null,
      vendorInvoicesTouchedThisWeek: 0,
      vendorPendingCount: 0
    })

    const shift = payload.items.find((i) => i.id === 'shift-close')
    assert.ok(shift)
    assert.equal(shift.label, 'Update Shift')
    const workDates = (shift.children ?? []).map((c) => c.workDate)
    assert.ok(workDates.includes('2026-06-10'), 'Wednesday 10th missing')
    assert.ok(workDates.includes('2026-06-11'), 'Thursday 11th missing')
    assert.ok(!workDates.includes('2026-06-12'), 'Friday excluded (today)')
  })

  it('marks partial shift as incomplete yellow', () => {
    const asOf = '2026-06-12'
    const now = fromZonedTime('2026-06-12T10:00:00', 'America/St_Lucia')
    const report = emptyDayReport('2026-06-11', {
      status: 'Incomplete',
      shifts: [
        {
          id: 'a',
          date: '2026-06-11',
          shift: '6-1',
          supervisor: 'Test',
          status: 'closed',
          systemCash: 0,
          systemChecks: 0,
          systemCredit: 0,
          systemDebit: 0,
          otherCredit: 0,
          systemInhouse: 0,
          systemFleet: 0,
          systemMassyCoupons: 0,
          countCash: 0,
          countChecks: 0,
          countCredit: 0,
          countInhouse: 0,
          countFleet: 0,
          countMassyCoupons: 0,
          unleaded: 0,
          diesel: 0,
          deposits: [0],
          notes: '',
          overShortCash: 0,
          overShortTotal: 0,
          totalDeposits: 0,
          createdAt: new Date(),
          hasRedFlag: false
        }
      ]
    })

    const payload = buildOperationsChecklist({
      asOf,
      now,
      role: 'admin',
      showFinancial: false,
      dayReportsByDate: new Map([['2026-06-11', report]]),
      comparisonRowsByDate: new Map(),
      stationClosedDates: new Set(),
      bankHolidayDates: new Set(),
      acknowledgements: [],
      customerArUpdatedAt: null,
      vendorInvoicesTouchedThisWeek: 0,
      vendorPendingCount: 0
    })

    const sub = payload.items.find((i) => i.id === 'shift-close')?.children?.find((c) => c.workDate === '2026-06-11')
    assert.ok(sub)
    assert.equal(sub.status, 'incomplete')
    assert.match(sub.reason ?? '', /Missing shift|1-9/i)
  })

  it('marks reopened shift with reopened status', () => {
    const asOf = '2026-06-12'
    const now = fromZonedTime('2026-06-12T10:00:00', 'America/St_Lucia')
    const report = emptyDayReport('2026-06-10', {
      status: 'Complete',
      shifts: [
        {
          id: 'a',
          date: '2026-06-10',
          shift: '6-1',
          supervisor: 'Test',
          status: 'reopened',
          systemCash: 0,
          systemChecks: 0,
          systemCredit: 0,
          systemDebit: 0,
          otherCredit: 0,
          systemInhouse: 0,
          systemFleet: 0,
          systemMassyCoupons: 0,
          countCash: 0,
          countChecks: 0,
          countCredit: 0,
          countInhouse: 0,
          countFleet: 0,
          countMassyCoupons: 0,
          unleaded: 0,
          diesel: 0,
          deposits: [0],
          notes: '',
          overShortCash: 0,
          overShortTotal: 0,
          totalDeposits: 0,
          createdAt: new Date(),
          hasRedFlag: false
        }
      ]
    })

    const payload = buildOperationsChecklist({
      asOf,
      now,
      role: 'admin',
      showFinancial: false,
      dayReportsByDate: new Map([['2026-06-10', report]]),
      comparisonRowsByDate: new Map(),
      stationClosedDates: new Set(),
      bankHolidayDates: new Set(),
      acknowledgements: [],
      customerArUpdatedAt: null,
      vendorInvoicesTouchedThisWeek: 0,
      vendorPendingCount: 0
    })

    const sub = payload.items.find((i) => i.id === 'shift-close')?.children?.find((c) => c.workDate === '2026-06-10')
    assert.ok(sub)
    assert.equal(sub.status, 'reopened')
  })
})
