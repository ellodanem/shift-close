const test = require('node:test')
const assert = require('node:assert/strict')
const { printableUrl, recentDates, cstoreDate } = require('./cstoreDayReport')

test('cstoreDate turns YYYY-MM-DD into MM/DD/YYYY', () => {
  assert.equal(cstoreDate('2026-11-06'), '11/06/2026')
  assert.throws(() => cstoreDate('11/06/2026'))
})

test('printableUrl matches the Cstore print page address', () => {
  assert.equal(
    printableUrl('https://secure.cstorepro.com', '2026-11-06'),
    'https://secure.cstorepro.com/EmagineNETCOSM/Content/Daily/DailyReportGetPrintable.aspx?inReportDate=11/06/2026&&inPageType=1'
  )
})

test('recentDates lists the last days newest first, across a month and year boundary', () => {
  assert.deepEqual(recentDates('2026-11-07', 3), ['2026-11-07', '2026-11-06', '2026-11-05'])
  assert.deepEqual(recentDates('2027-01-02', 4), ['2027-01-02', '2027-01-01', '2026-12-31', '2026-12-30'])
  assert.deepEqual(recentDates('nope', 3), [])
})
