const test = require('node:test')
const assert = require('node:assert/strict')
const { addDays, parseEntryTitleDate, parseSavedBannerDate, planSaves } = require('./cstoreDaySave')

test('addDays crosses month and year boundaries', () => {
  assert.equal(addDays('2026-11-01', -1), '2026-10-31')
  assert.equal(addDays('2027-01-01', -1), '2026-12-31')
  assert.equal(addDays('nope', -1), '')
})

test('parseEntryTitleDate reads the day Cstore opened', () => {
  assert.equal(parseEntryTitleDate('Enter daily report for Monday 11/9/2026'), '2026-11-09')
  assert.equal(parseEntryTitleDate('xx Enter daily report for Friday 12/25/2026 xx'), '2026-12-25')
  assert.equal(parseEntryTitleDate('Daily reports'), null)
})

test('parseSavedBannerDate reads the saved confirmation', () => {
  assert.equal(parseSavedBannerDate('Daily Report for 11/9/2026 has been saved successful'), '2026-11-09')
  assert.equal(parseSavedBannerDate('Daily Report for 11/9/2026 could not be saved'), null)
})

const base = { today: '2026-11-10', max: 3 }

test('planSaves never plans today or later', () => {
  const r = planSaves({
    ...base,
    windowDates: ['2026-11-10', '2026-11-09'],
    unsavedDates: ['2026-11-10'],
    savedDates: ['2026-11-09'],
    eligibleDates: ['2026-11-10']
  })
  assert.deepEqual(r.toSave, [])
})

test('planSaves: the 9th becomes eligible on the 10th', () => {
  const r = planSaves({
    ...base,
    windowDates: ['2026-11-09', '2026-11-08'],
    unsavedDates: ['2026-11-09'],
    savedDates: ['2026-11-08'],
    eligibleDates: ['2026-11-09']
  })
  assert.deepEqual(r.toSave, ['2026-11-09'])
  const sameDay = planSaves({ ...base, today: '2026-11-09', windowDates: ['2026-11-09', '2026-11-08'], unsavedDates: ['2026-11-09'], savedDates: ['2026-11-08'], eligibleDates: ['2026-11-09'] })
  assert.deepEqual(sameDay.toSave, [])
})

test('planSaves skips days that are not in the eligible window', () => {
  const r = planSaves({
    ...base,
    windowDates: ['2026-11-09', '2026-11-08'],
    unsavedDates: ['2026-11-09'],
    savedDates: ['2026-11-08'],
    eligibleDates: []
  })
  assert.deepEqual(r.toSave, [])
  assert.match(r.skipped[0].reason, /save window/)
})

test('planSaves goes oldest first and chains consecutive days', () => {
  const r = planSaves({
    ...base,
    windowDates: ['2026-11-09', '2026-11-08', '2026-11-07', '2026-11-06'],
    unsavedDates: ['2026-11-09', '2026-11-08', '2026-11-07'],
    savedDates: ['2026-11-06'],
    eligibleDates: ['2026-11-09', '2026-11-08', '2026-11-07']
  })
  assert.deepEqual(r.toSave, ['2026-11-07', '2026-11-08', '2026-11-09'])
})

test('planSaves leaves no gap: an unfinished earlier day blocks later days', () => {
  const r = planSaves({
    ...base,
    windowDates: ['2026-11-09', '2026-11-08', '2026-11-07'],
    unsavedDates: ['2026-11-09', '2026-11-08'],
    savedDates: ['2026-11-07'],
    eligibleDates: ['2026-11-09']
  })
  assert.deepEqual(r.toSave, [])
  assert.equal(r.skipped.length, 2)
})

test('planSaves caps the number of days per run', () => {
  const r = planSaves({
    ...base,
    max: 2,
    windowDates: ['2026-11-09', '2026-11-08', '2026-11-07', '2026-11-06'],
    unsavedDates: ['2026-11-09', '2026-11-08', '2026-11-07'],
    savedDates: ['2026-11-06'],
    eligibleDates: ['2026-11-09', '2026-11-08', '2026-11-07']
  })
  assert.deepEqual(r.toSave, ['2026-11-07', '2026-11-08'])
})
