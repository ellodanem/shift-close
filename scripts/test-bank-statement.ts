import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { jsPDF } from 'jspdf'
import {
  findPosCommissions,
  findStatementChecks,
  isCommissionAlreadyBooked,
  matchStatementChecks,
  parseStatementText,
  type UncashedCandidate
} from '../lib/bank-statement'
import { extractStatementText } from '../lib/bank-statement-pdf'

const STATEMENT = `
WESTLINE ENT  Account 200000316928
Statement period 01 Oct 2026 to 31 Oct 2026
Date Description Debit Credit Balance
Balance brought forward 10,000.00
02/10/2026 CHEQUE 001234 1,500.00 8,500.00
03/10/2026 POS- COMMISSION - 4471 12.35 8,487.65
03/10/2026 CASH DEPOSIT 2,000.00 10,487.65
05/10/2026 CHQ PAID 5588
JOHN SMITH 250.00 10,237.65
07/10/2026 CHEQUE DEPOSIT 300.00 10,537.65
09/10/2026 POS- COMMISSION - 4472 8.10 10,529.55
Page 1 of 1
`

const uncashed = (over: Partial<UncashedCandidate> & Pick<UncashedCandidate, 'id' | 'bankRef' | 'totalAmount'>): UncashedCandidate => ({
  payee: 'Vendor',
  paymentDate: '2026-09-28',
  source: 'vendor',
  ...over
})

describe('parseStatementText', () => {
  const parsed = parseStatementText(STATEMENT)

  it('reads dated rows with amounts', () => {
    assert.equal(parsed.transactions.length, 6)
    assert.equal(parsed.periodStart, '2026-10-01')
    assert.equal(parsed.periodEnd, '2026-10-31')
    assert.deepEqual(parsed.transactions[0], {
      date: '2026-10-02',
      description: 'CHEQUE 001234',
      amount: 1500,
      balance: 8500,
      direction: 'debit'
    })
  })

  it('uses the running balance to tell credits from debits', () => {
    assert.equal(parsed.transactions[2].direction, 'credit')
  })

  it('joins a description that wraps onto the next line', () => {
    assert.equal(parsed.transactions[3].description, 'CHQ PAID 5588 JOHN SMITH')
  })

  it('handles day-month dates without a year', () => {
    const tx = parseStatementText('Statement 2026\n14 Mar CHEQUE 77 90.00 910.00').transactions
    assert.equal(tx[0].date, '2026-03-14')
  })
})

describe('findStatementChecks', () => {
  const checks = findStatementChecks(parseStatementText(STATEMENT).transactions)

  it('finds paid checks and ignores deposits', () => {
    assert.equal(checks.length, 2)
    assert.deepEqual(checks[0].numbers, ['1234'])
    assert.deepEqual(checks[1].numbers.includes('5588'), true)
    assert.equal(checks[0].date, '2026-10-02')
  })
})

describe('findPosCommissions', () => {
  it('finds every POS commission with its reference', () => {
    const found = findPosCommissions(parseStatementText(STATEMENT).transactions)
    assert.deepEqual(
      found.map((c) => [c.date, c.amount, c.reference, c.description]),
      [
        ['2026-10-03', 12.35, '4471', 'POS COMMISSION - 4471'],
        ['2026-10-09', 8.1, '4472', 'POS COMMISSION - 4472']
      ]
    )
  })

  it('detects commissions already in the cashbook', () => {
    const [first, second] = findPosCommissions(parseStatementText(STATEMENT).transactions)
    const existing = [{ date: '2026-10-03', description: 'POS Commission - 4471', amount: 12.35 }]
    assert.equal(isCommissionAlreadyBooked(first, existing), true)
    assert.equal(isCommissionAlreadyBooked(second, existing), false)
  })
})

describe('matchStatementChecks', () => {
  const checks = findStatementChecks(parseStatementText(STATEMENT).transactions)

  it('matches by check number (ignoring leading zeros) and amount', () => {
    const rows = matchStatementChecks(
      checks,
      [uncashed({ id: 'vendor:a', bankRef: '1234', totalAmount: 1500 })],
      []
    )
    assert.equal(rows[0].status, 'matched')
    assert.equal(rows[0].candidates[0].id, 'vendor:a')
    assert.equal(rows[1].status, 'not_found')
  })

  it('flags an amount that differs', () => {
    const rows = matchStatementChecks(checks, [uncashed({ id: 'v', bankRef: '1234', totalAmount: 1400 })], [])
    assert.equal(rows[0].status, 'amount_mismatch')
  })

  it('reports checks that are already cashed', () => {
    const rows = matchStatementChecks(checks, [], [{ bankRef: '#1234', totalAmount: 1500 }])
    assert.equal(rows[0].status, 'already_cleared')
  })

  it('asks the user to choose when two checks share number and amount', () => {
    const rows = matchStatementChecks(
      checks,
      [
        uncashed({ id: 'vendor:a', bankRef: '1234', totalAmount: 1500 }),
        uncashed({ id: 'cashbook:b', bankRef: '1234', totalAmount: 1500, source: 'cashbook' })
      ],
      []
    )
    assert.equal(rows[0].status, 'ambiguous')
    assert.equal(rows[0].candidates.length, 2)
  })
})

describe('PDF extraction', () => {
  it('keeps table columns on one row', async () => {
    const doc = new jsPDF()
    doc.setFontSize(10)
    const rows: Array<[string, string, string, string]> = [
      ['02/10/2026', 'CHEQUE 001234', '1,500.00', '8,500.00'],
      ['03/10/2026', 'POS- COMMISSION - 4471', '12.35', '8,487.65']
    ]
    doc.text('Statement period 01 Oct 2026 to 31 Oct 2026', 10, 15)
    doc.text('Balance brought forward 10,000.00', 10, 25)
    rows.forEach(([date, description, amount, balance], i) => {
      const y = 40 + i * 8
      doc.text(date, 10, y)
      doc.text(description, 40, y)
      doc.text(amount, 130, y)
      doc.text(balance, 165, y)
    })
    const bytes = new Uint8Array(doc.output('arraybuffer'))
    const text = await extractStatementText(bytes)
    const parsed = parseStatementText(text)
    assert.equal(parsed.transactions.length, 2)
    assert.equal(parsed.transactions[0].direction, 'debit')
    assert.equal(findStatementChecks(parsed.transactions).length, 1)
    assert.equal(findPosCommissions(parsed.transactions)[0].reference, '4471')
  })
})
