import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { compareSheet, type AppEntry } from '../lib/cashbook-compare'
import { parseCashbookSheet, parseSheetDate, parseSheetNumber, suggestSheetDate } from '../lib/cashbook-sheet'

const NONE = ['', '', '', '', '', '', '', '', '']

function sheetRows(title: string, header: string, body: unknown[][]): unknown[][] {
  return [
    [' ', '', '', '', title],
    ['', '', '', '', header],
    ['', '', '', '', 'FOR PERIOD ENDED October 31, 2026'],
    [...NONE],
    [...NONE],
    ['', 'DEBITS', '', '', '', '', '', 'CREDIT', '', 'Rec. Gen', 'Rec. Gas', 'Vat', 'Mtnce', 'Bank ', 'Salaries'],
    ['DATE', '', 'Cr Card', 'Dr Card', 'AMT', 'DATE', 'CHQ#', '', 'AMT', '3021', '3022', '', '7441.04', 'Charges', ''],
    ...body
  ]
}

function row(left: unknown[], right: unknown[], cats: unknown[] = []): unknown[] {
  const l = [...left, '', '', '', '', ''].slice(0, 5)
  const r = [...right, '', '', '', ''].slice(0, 4)
  return [...l, ...r, ...cats]
}

function entry(partial: Partial<AppEntry> & Pick<AppEntry, 'id' | 'date'>): AppEntry {
  return {
    account: 'westline',
    description: 'Entry',
    ref: null,
    creditAmt: 0,
    debitCash: 0,
    debitCheck: 0,
    debitEcard: 0,
    debitDcard: 0,
    shiftIncomeKind: null,
    transferGroupId: null,
    ...partial
  }
}

describe('sheet values', () => {
  it('reads the accountant number and date formats', () => {
    assert.equal(parseSheetNumber('1,874.40 '), 1874.4)
    assert.equal(parseSheetNumber('(20,000.00)'), -20000)
    assert.equal(parseSheetNumber('3615.00'), 3615)
    assert.equal(parseSheetNumber(''), null)
    assert.equal(parseSheetNumber('zz'), null)
    assert.equal(parseSheetDate('02.10.26'), '2026-10-02')
    assert.equal(parseSheetDate('31.11.26'), null)
    assert.equal(parseSheetDate('02.10.206'), null)
  })

  it('only guesses a typo when the fix is clear', () => {
    const period = { year: 2026, month: 10 }
    assert.equal(suggestSheetDate('02.10.206', period), '2026-10-02')
    assert.equal(suggestSheetDate('20.26.26', period), '2026-10-20')
    assert.equal(suggestSheetDate('02.10.999', period), null)
  })
})

describe('sheet layout', () => {
  const rows = sheetRows('WESTLINE ENTERPRISE LTD', 'CASH BOOK - Republic Bank Account #200000316928', [
    row(['B/F', '', '', '', '1,000.00'], ['02.10.206', '20892720 ', 'Rubis West Indies Ltd', '600.00'], ['100.00', '500.00']),
    row(['01.10.26', '', '', '', '200.00'], ['06.10.26', 'BANK', 'Service charge', '10.00'], ['', '', '', '', '10.00']),
    row(['02.10.26', 'CPJ', '', '', '50.00'], ['', '', '', '0.00']),
    row(['03.10.26', '', '', '', '(70.00)'], ['07.10.26', '', 'Plumber', '5.00']),
    row(['', '', '', '', '999.00'], ['', '', '', '35.00']),
    row([''], ['', 'zz', '', ''])
  ])

  it('reads both sides, the opening balance and the footing', () => {
    const parsed = parseCashbookSheet(rows)
    assert.equal(parsed.account, 'westline')
    assert.equal(parsed.periodEnd, '2026-10-31')
    assert.equal(parsed.openingBalance, 1000)
    // 1000 + (200 + 50 - 70) - (600 + 10 + 5)
    assert.equal(parsed.closingBalance, 565)
    assert.equal(parsed.lines.filter((line) => line.side === 'in').length, 3)
    assert.equal(parsed.lines.filter((line) => line.side === 'out').length, 3)
    const cpj = parsed.lines.find((line) => line.label === 'CPJ')
    assert.equal(cpj?.amount, 50)
    assert.equal(parsed.lines.find((line) => line.negative)?.amount, 70)
  })

  it('repairs the typo date, keeps the category columns and warns', () => {
    const parsed = parseCashbookSheet(rows)
    const rubis = parsed.lines.find((line) => line.description.startsWith('Rubis'))
    assert.equal(rubis?.date, '2026-10-02')
    assert.equal(rubis?.ref, '20892720')
    assert.deepEqual(
      rubis?.categories.map((category) => [category.name, category.code, category.amount]),
      [
        ['Rec. Gen', '3021', 100],
        ['Rec. Gas', '3022', 500]
      ]
    )
    assert.ok(rubis?.warnings.some((warning) => warning.includes('02.10.206')))
    const plumber = parsed.lines.find((line) => line.description === 'Plumber')
    assert.ok(plumber?.warnings.some((warning) => warning.includes('No reference')))
    const charge = parsed.lines.find((line) => line.ref === 'BANK')
    assert.deepEqual(charge?.categories.map((category) => category.name), ['Bank Charges'])
  })

  it('refuses a file that is not a cash book', () => {
    const parsed = parseCashbookSheet([['hello'], ['world']])
    assert.equal(parsed.lines.length, 0)
    assert.ok(parsed.warnings[0].includes('does not look like'))
  })
})

function westline(body: unknown[][]) {
  const parsed = parseCashbookSheet(sheetRows('WESTLINE ENTERPRISE LTD', 'Republic Bank Account #200000316928', body))
  return parsed
}

function run(
  parsed: ReturnType<typeof parseCashbookSheet>,
  entries: AppEntry[],
  extra: { otherLines?: ReturnType<typeof parseCashbookSheet>['lines'] } = {}
) {
  return compareSheet({
    account: (parsed.account ?? 'westline') as 'westline' | 'service_station',
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
    openingBalance: parsed.openingBalance,
    closingBalance: parsed.closingBalance,
    lines: parsed.lines,
    entries,
    otherLines: extra.otherLines
  })
}

describe('comparison', () => {
  it('matches what is there and raises one task for what is not', () => {
    const parsed = westline([
      row(['B/F', '', '', '', '124,611.95'], ['', '', '', '']),
      row(['01.10.26', '', '', '', '11,837.73'], ['13.10.26', '12', 'Neil Samuel - repairs', '350.00']),
      row(['02.10.26', '', '', '', '20,000.00'], ['13.10.26', '13', 'Petrus Francois - repairs', '250.00'])
    ])
    const result = run(parsed, [
      entry({ id: 'dep', date: '2026-10-01', creditAmt: 11837.73 }),
      entry({ id: 'chq', date: '2026-10-12', debitCheck: 350, ref: '12' })
    ])
    assert.equal(result.counts.matched, 2)
    const kinds = result.tasks.map((task) => [task.kind, task.amount])
    assert.deepEqual(kinds.sort(), [
      ['missing_entry', 20000],
      ['missing_entry', 250]
    ].sort())
    const cheque = result.tasks.find((task) => task.amount === 250)
    assert.equal(cheque?.payload.prefill?.paymentMethod, 'check')
    assert.equal(cheque?.payload.prefill?.type, 'expense')
    assert.equal(cheque?.route, 'cashbook')
  })

  it('turns bank charges into one-click tasks and points vendor cheques at the vendor screen', () => {
    const parsed = westline([
      row(['B/F', '', '', '', '0.00'], ['05.10.26', 'Bank', 'Service charge', '137.00'], ['', '', '', '', '137.00']),
      row([''], ['13.10.26', '13', 'Acado', '5,554.78'], ['5,554.78'])
    ])
    const { tasks } = run(parsed, [])
    assert.equal(tasks.find((task) => task.ref === 'Bank')?.canCreate, true)
    const vendor = tasks.find((task) => task.ref === '13')
    assert.equal(vendor?.canCreate, false)
    assert.equal(vendor?.route, 'vendor_payment')
  })

  it('flags an entry that is on the other account, and an amount that differs', () => {
    const parsed = westline([
      row(['B/F', '', '', '', '0.00'], ['13.10.26', '877', 'Supplier', '300.00']),
      row(['03.10.26', '', '', '', '500.00'], ['', '', '', ''])
    ])
    const result = run(parsed, [
      entry({ id: 'wrong', account: 'service_station', date: '2026-10-13', debitCheck: 300, ref: '877' }),
      entry({ id: 'dep', date: '2026-10-03', creditAmt: 480 })
    ])
    const wrong = result.tasks.find((task) => task.kind === 'wrong_account')
    assert.equal(wrong?.payload.entryId, 'wrong')
    assert.equal(wrong?.payload.toAccount, 'westline')
    const differs = result.tasks.find((task) => task.kind === 'amount_differs')
    assert.equal(differs?.payload.entryId, 'dep')
    assert.equal(differs?.payload.appAmount, 480)
    assert.equal(result.tasks.filter((task) => task.kind === 'extra_in_app').length, 0)
  })

  it('reports what the cashbook has that the sheet does not', () => {
    const parsed = westline([row(['B/F', '', '', '', '124,611.95'], ['', '', '', ''])])
    const result = run(parsed, [
      entry({ id: 'x', date: '2026-10-09', creditAmt: 75, description: 'Mystery' }),
      entry({ id: 'outside', date: '2026-09-09', creditAmt: 75 })
    ])
    assert.deepEqual(result.tasks.map((task) => task.payload.entryId), ['x'])
  })

  it('compares card sales by day, because the cashbook holds one entry per shift', () => {
    const parsed = parseCashbookSheet(
      sheetRows('TOTAL AUTO INC. - Service Station', 'CASH BOOK - Republic Bank', [
        row(['B/F', '', '', '', '30,063.25'], ['', '', '', '']),
        row(['01.10.26', '', '3615.00', '210.00', '3,825.00'], ['', '', '', '']),
        row(['02.10.26', '', '9593.36', '2514.91', '12,108.27'], ['', '', '', '']),
        row(['03.10.26', '', '100.00', '', ''], ['', '', '', ''])
      ])
    )
    assert.equal(parsed.account, 'service_station')
    const card = (id: string, date: string, kind: 'credit' | 'debit', amount: number) =>
      entry({ id, date, account: 'service_station', creditAmt: amount, shiftIncomeKind: kind })
    const result = run(parsed, [
      card('a', '2026-10-01', 'credit', 2000),
      card('b', '2026-10-01', 'credit', 1615),
      card('c', '2026-10-01', 'debit', 210),
      card('d', '2026-10-02', 'credit', 9000)
    ])
    const days = result.tasks.filter((task) => task.kind === 'card_day')
    assert.deepEqual(
      days.map((task) => [task.date, task.payload.cardKind, task.payload.appAmount]),
      [
        ['2026-10-02', 'credit', 9000],
        ['2026-10-02', 'debit', 0],
        ['2026-10-03', 'credit', 0]
      ]
    )
    assert.equal(result.counts.cardDays, 3)
  })

  it('recognises a transfer from both sheets and creates one task when neither end exists', () => {
    const service = parseCashbookSheet(
      sheetRows('TOTAL AUTO INC. - Service Station', 'CASH BOOK - Republic Bank', [
        row(['B/F', '', '', '', '30,063.25'], ['', '', '', '']),
        row(['02.10.26', '', '', '', '(20,000.00)'], ['', '', '', ''])
      ])
    )
    const west = westline([
      row(['B/F', '', '', '', '124,611.95'], ['', '', '', '']),
      row(['02.10.26', '', '', '', '20,000.00'], ['', '', '', ''])
    ])
    const fromService = run(service, [])
    const fromWestline = run(west, [], { otherLines: service.lines })
    const a = fromService.tasks.find((task) => task.kind === 'missing_transfer')
    const b = fromWestline.tasks.find((task) => task.kind === 'missing_transfer')
    assert.ok(a && b)
    assert.equal(a.fingerprint, b.fingerprint)
    assert.deepEqual(a.payload.transfer, { from: 'service_station', to: 'westline', date: '2026-10-02', amount: 20000 })
    assert.equal(a.canCreate, true)
    assert.equal(fromWestline.tasks.filter((task) => task.kind === 'missing_entry').length, 0)

    const linked = [
      entry({ id: 'out', account: 'service_station', date: '2026-10-02', debitEcard: 20000, transferGroupId: 'g' }),
      entry({ id: 'in', account: 'westline', date: '2026-10-02', creditAmt: 20000, transferGroupId: 'g' })
    ]
    assert.equal(run(service, linked).tasks.length, 0)
    assert.equal(run(west, linked, { otherLines: service.lines }).tasks.length, 0)
  })

  it('keeps two identical lines as two tasks with different fingerprints', () => {
    const parsed = westline([
      row(['B/F', '', '', '', '124,611.95'], ['05.10.26', 'BANK', 'Batch fee', '50.00']),
      row([''], ['05.10.26', 'BANK', 'Batch fee', '50.00'])
    ])
    const { tasks } = run(parsed, [])
    assert.equal(tasks.length, 2)
    assert.notEqual(tasks[0].fingerprint, tasks[1].fingerprint)
  })

  it('raises sheet problems as tasks and checks the opening balance', () => {
    const parsed = westline([
      row(['B/F', '', '', '', '124,000.00'], ['02.10.206', '20892720', 'Rubis West Indies Ltd', '600.00'])
    ])
    const result = run(parsed, [entry({ id: 'r', date: '2026-10-02', debitEcard: 600, ref: '20892720' })])
    const kinds = result.tasks.map((task) => task.kind).sort()
    assert.deepEqual(kinds, ['opening_balance', 'sheet_issue'])
    assert.equal(result.counts.matched, 1)
  })
})
