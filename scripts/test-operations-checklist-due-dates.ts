import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fromZonedTime } from 'date-fns-tz'
import {
  bankReceiptDate,
  depositComparisonDueDate,
  shiftEntryDueDate,
  shiftEntryOverdueDate,
  shiftEntryTimingStatus,
  weekDueSunday,
  weekKeyMonday
} from '../lib/operations-checklist-due-dates'

const NO_HOLIDAYS = new Set<string>()

describe('operations checklist due dates', () => {
  it('shift entry is work date + 1', () => {
    assert.equal(shiftEntryDueDate('2026-06-08'), '2026-06-09')
    assert.equal(shiftEntryOverdueDate('2026-06-08'), '2026-06-10')
  })

  it('shift timing — not due on work day or before 6 AM on due day', () => {
    const beforeGrace = fromZonedTime('2026-06-09T05:30:00', 'America/St_Lucia')
    assert.equal(shiftEntryTimingStatus('2026-06-08', '2026-06-08', beforeGrace), 'not_due')
    assert.equal(shiftEntryTimingStatus('2026-06-09', '2026-06-08', beforeGrace), 'not_due')

    const afterGrace = fromZonedTime('2026-06-09T08:00:00', 'America/St_Lucia')
    assert.equal(shiftEntryTimingStatus('2026-06-09', '2026-06-08', afterGrace), 'due')
  })

  it('shift timing — overdue from W+2', () => {
    const now = fromZonedTime('2026-06-10T09:00:00', 'America/St_Lucia')
    assert.equal(shiftEntryTimingStatus('2026-06-10', '2026-06-08', now), 'overdue')
  })

  it('Sunday work follows next-day rule', () => {
    const sunday = '2026-06-14'
    assert.equal(shiftEntryDueDate(sunday), '2026-06-15')
    const mondayMorning = fromZonedTime('2026-06-15T09:00:00', 'America/St_Lucia')
    assert.equal(shiftEntryTimingStatus('2026-06-15', sunday, mondayMorning), 'due')
  })

  it('deposit comparison — weekend batch due Tuesday', () => {
    assert.equal(depositComparisonDueDate('2026-06-05', NO_HOLIDAYS), '2026-06-09')
    assert.equal(depositComparisonDueDate('2026-06-06', NO_HOLIDAYS), '2026-06-09')
    assert.equal(depositComparisonDueDate('2026-06-07', NO_HOLIDAYS), '2026-06-09')
  })

  it('deposit comparison — weekday chain', () => {
    assert.equal(depositComparisonDueDate('2026-06-08', NO_HOLIDAYS), '2026-06-10')
    assert.equal(depositComparisonDueDate('2026-06-09', NO_HOLIDAYS), '2026-06-11')
    assert.equal(depositComparisonDueDate('2026-06-10', NO_HOLIDAYS), '2026-06-12')
  })

  it('bank receipt for Monday is Tuesday', () => {
    assert.equal(bankReceiptDate('2026-06-08', NO_HOLIDAYS), '2026-06-09')
  })

  it('week key is Monday of Mon–Sun week', () => {
    assert.equal(weekKeyMonday('2026-06-11'), '2026-06-08')
    assert.equal(weekDueSunday('2026-06-08'), '2026-06-14')
  })

  it('bank holiday pushes Monday deposit due to Thursday', () => {
    const holidays = new Set(['2026-06-09'])
    assert.equal(depositComparisonDueDate('2026-06-08', holidays), '2026-06-11')
  })
})
