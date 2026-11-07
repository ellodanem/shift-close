import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseCstoreDailyReportHtml, parseMoneyCell } from '../lib/parse-cstore-daily-report'
import { parseCstoreHtmlImport } from '../lib/cstore-day-report'

/**
 * Fixtures are modeled on the Cstore printable Daily Report for Friday 11/6/2026 (saved before deposits
 * were typed). They are hand-built from the page layout, not captured HTML, so a real saved page should
 * be dropped in here once available.
 */

const td = (v: string) => `<td>${v}</td>`
const tr = (...cells: string[]) => `<tr>${cells.map(td).join('')}</tr>`

const salesAndCollections = [
  tr('Type', 'Count', 'Amount', 'Type', 'Count', 'Amount'),
  tr('Total Grocery:', '', '$ 2,881.22', 'Total deposits:', '', '$ 0.00'),
  tr('Sales Tax:', '', '$ 0.00', 'Cash Purchases:', '', '$ 0.00'),
  tr('Regular Amt Sold:', '', '$ 35,090.93', 'Pending invoices paid:', '', '$ 0.00'),
  tr('Plus Amt Sold:', '', '$ 0.00', 'Credit card batches:', '', '$ 1,925.08'),
  tr('Super Amt Sold:', '', '$ 0.00', 'Cash Expenses:', '', '$ 0.00'),
  tr('Diesel Amt Sold:', '', '$ 18,865.42', 'Cust account sales:', '', '$ 2,652.00'),
  tr('Total Gas Amt Sold:', '', '$ 53,956.35', 'M.T. cash payout amount:', '', '$ 0.00'),
  tr('Cust account pay-in:', '', '$ 0.00', 'Credit card 2 batch:', '', '$ 0.00'),
  tr('Closing Cash:', '', '$ 0.00', 'Closing Checks:', '', '$ 0.00')
].join('')

const totalsSeparateRows = [
  tr('Total Sales', '$56,837.57', 'Total Collections', '$4,577.08'),
  tr('', '', 'Short Over', '-$52,260.49')
].join('')

const totalsStacked = `<tr><td>Total Sales</td><td>$56,837.57</td><td>Total Collections<br>Short Over</td><td>$4,577.08<br>-$52,260.49</td></tr>`

const tank = [
  tr('Daily Tank Report (gal)'),
  tr('Grade', 'Regular', 'Plus', 'Super', 'Diesel'),
  tr('Opening', '12,500.0', '0.0', '0.0', '7,155.0'),
  tr('Purchase', '0.0', '0.0', '0.0', '0.0'),
  tr('Sold', '9,258.9', '0.0', '0.0', '4,977.7'),
  tr('Closing', '3,321.1', '0.0', '0.0', '2,177.3'),
  tr('Stinches', '0.0', '0.0', '0.0', '0.0'),
  tr('O/S', '-5.7', '0.0', '0.0', '-16.8')
].join('')

const page = (totals: string) =>
  `<html><body><div>Daily Report</div><div>Zeed#: 794 Friday 11/6/2026</div><table>${salesAndCollections}${totals}</table><table>${tank}</table></body></html>`

describe('parseMoneyCell', () => {
  it('reads dollars, negatives and blanks', () => {
    assert.equal(parseMoneyCell('$ 2,881.22'), 2881.22)
    assert.equal(parseMoneyCell('-$52,260.49'), -52260.49)
    assert.equal(parseMoneyCell('$-52,260.49'), -52260.49)
    assert.equal(parseMoneyCell('(1,000.50)'), -1000.5)
    assert.equal(parseMoneyCell(''), null)
    assert.equal(parseMoneyCell('Total Sales'), null)
  })
})

describe('parseCstoreDailyReportHtml', () => {
  for (const [name, totals] of [
    ['totals in separate rows', totalsSeparateRows],
    ['totals stacked in one cell', totalsStacked]
  ] as const) {
    it(`reads sales, collections and tanks (${name})`, () => {
      const r = parseCstoreDailyReportHtml(page(totals))
      assert.equal(r.ok, true)
      if (!r.ok) return
      const d = r.report
      assert.equal(d.date, '2026-11-06')
      assert.equal(d.grocery, 2881.22)
      assert.equal(d.salesTax, 0)
      assert.equal(d.regularAmt, 35090.93)
      assert.equal(d.dieselAmt, 18865.42)
      assert.equal(d.totalSales, 56837.57)
      assert.equal(d.depositsTyped, 0)
      assert.equal(d.fleetBatch, 1925.08)
      assert.equal(d.creditDebitBatch, 0)
      assert.equal(d.custAccountSales, 2652)
      assert.equal(d.totalCollections, 4577.08)
      assert.equal(d.shortOver, -52260.49)
      assert.equal(d.regularLitres, 9258.9)
      assert.equal(d.dieselLitres, 4977.7)
      assert.equal(d.tank.regular.opening, 12500)
      assert.equal(d.tank.regular.closing, 3321.1)
      assert.equal(d.tank.regular.os, -5.7)
      assert.equal(d.tank.diesel.os, -16.8)
    })
  }

  it('sums Plus and Super into the regular (unleaded) figures', () => {
    const html = page(totalsSeparateRows)
      .replace('Plus Amt Sold:</td><td></td><td>$ 0.00', 'Plus Amt Sold:</td><td></td><td>$ 100.00')
      .replace(/(<td>Sold<\/td><td>9,258.9<\/td>)<td>0.0<\/td>/, '$1<td>10.0</td>')
    const r = parseCstoreDailyReportHtml(html)
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.report.regularAmt, 35190.93)
    assert.equal(r.report.regularLitres, 9268.9)
  })

  it('reports what is missing instead of guessing', () => {
    const r = parseCstoreDailyReportHtml('<html><body>Daily Report<table><tr><td>Total Sales</td><td>$1.00</td></tr></table></body></html>')
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.code, 'missing_labels')
    assert.deepEqual(r.missing, ['Total Collections', 'Short Over'])
  })

  it('rejects pages that are not the report', () => {
    const r = parseCstoreDailyReportHtml('<html><body>Please sign in</body></html>')
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.code, 'not_a_report')
  })
})

describe('parseCstoreHtmlImport', () => {
  it('builds an agent import for the requested date and flags a day with no deposits as incomplete', () => {
    const r = parseCstoreHtmlImport('2026-11-06', page(totalsSeparateRows))
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.value.date, '2026-11-06')
    assert.equal(r.value.source, 'agent')
    assert.equal(r.value.fleetBatch, 1925.08)
    assert.equal(r.complete, false)
  })

  it('is complete once deposits are typed', () => {
    const html = page(totalsSeparateRows).replace('Total deposits:</td><td></td><td>$ 0.00', 'Total deposits:</td><td></td><td>$ 32,997.37')
    const r = parseCstoreHtmlImport('2026-11-06', html)
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.value.depositsTyped, 32997.37)
    assert.equal(r.complete, true)
  })

  it('is not ready when the page is for another day', () => {
    const r = parseCstoreHtmlImport('2026-11-05', page(totalsSeparateRows))
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.code, 'not_ready')
  })

  it('is not ready when nothing was sold (no saved report)', () => {
    const empty = `<html><body>Daily Report <table>${tr('Total Sales', '$0.00', 'Total Collections', '$0.00')}${tr('', '', 'Short Over', '$0.00')}</table></body></html>`
    const r = parseCstoreHtmlImport('2026-11-06', empty)
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.code, 'not_ready')
  })
})
