import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bankReceiptDate,
  depositComparisonDueDate,
  shiftEntryDueDate,
  weekDueSunday,
  weekKeyMonday
} from '../lib/operations-checklist-due-dates'

const NO_HOLIDAYS = new Set<string>()

describe('operations checklist due dates', () => {
  it('shift entry is work date + 1', () => {
    assert.equal(shiftEntryDueDate('2026-06-08'), '2026-06-09')
  })

  it('deposit comparison — weekend batch due Tuesday', () => {
    assert.equal(depositComparisonDueDate('2026-06-05', NO_HOLIDAYS), '2026-06-09') // Fri → Tue
    assert.equal(depositComparisonDueDate('2026-06-06', NO_HOLIDAYS), '2026-06-09') // Sat → Tue
    assert.equal(depositComparisonDueDate('2026-06-07', NO_HOLIDAYS), '2026-06-09') // Sun → Tue
  })

  it('deposit comparison — weekday chain', () => {
    assert.equal(depositComparisonDueDate('2026-06-08', NO_HOLIDAYS), '2026-06-10') // Mon → Wed
    assert.equal(depositComparisonDueDate('2026-06-09', NO_HOLIDAYS), '2026-06-11') // Tue → Thu
    assert.equal(depositComparisonDueDate('2026-06-10', NO_HOLIDAYS), '2026-06-12') // Wed → Fri
  })

  it('bank receipt for Monday is Tuesday', () => {
    assert.equal(bankReceiptDate('2026-06-08', NO_HOLIDAYS), '2026-06-09')
  })

  it('week key is Monday of Mon–Sun week', () => {
    assert.equal(weekKeyMonday('2026-06-11'), '2026-06-08') // Thu
    assert.equal(weekDueSunday('2026-06-08'), '2026-06-14')
  })

  it('bank holiday pushes Monday deposit due to Thursday', () => {
    const holidays = new Set(['2026-06-09']) // Tue closed
    assert.equal(depositComparisonDueDate('2026-06-08', holidays), '2026-06-11') // Mon → Thu
  })
})
