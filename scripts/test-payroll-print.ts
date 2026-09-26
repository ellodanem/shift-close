import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildGlSummary, buildPayslipLine, payPeriodCycleDay, renderGlHtml, renderPayslipsHtml } from '../lib/payroll-print'

describe('payslips', () => {
  it('uses the period end day as the pay cycle', () => {
    assert.equal(payPeriodCycleDay('2026-08-15'), '15')
    assert.equal(payPeriodCycleDay('2026-08-31'), '31')
  })

  it('lists earnings and deductions the way a payslip does', () => {
    const slip = buildPayslipLine({
      staffName: 'Althea Frank',
      staffNo: '289864',
      taxCode: '220',
      basicPay: 900,
      otPay: 0,
      extraLines: [{ label: 'Commission', amount: 0 }],
      extraDeductions: [],
      nisEmployee: 45,
      medical: 80.98,
      staffLoan: 0,
      shortageReady: 0,
      grossPay: 900,
      totalDeductions: 125.98,
      netPay: 774.02
    })
    assert.ok(slip)
    assert.deepEqual(slip.earnings, [{ label: 'Basic', amount: 900 }])
    assert.deepEqual(slip.deductions, [
      { label: 'N.I.S.', amount: 45 },
      { label: 'Medical Insurance', amount: 80.98 }
    ])
    assert.equal(slip.netPay, 774.02)
    assert.equal(slip.nisNumber, '289864')
  })

  it('keeps overtime and other deductions that have an amount', () => {
    const slip = buildPayslipLine({
      staffName: 'Christine George',
      staffNo: '259713',
      taxCode: '220',
      basicPay: 750,
      otPay: 40,
      extraLines: [
        { label: 'Add duties', amount: 80 },
        { label: '__skipSalary', amount: 0 }
      ],
      extraDeductions: [{ label: 'CARED Loan', amount: 25 }],
      nisEmployee: 41.5,
      medical: 0,
      staffLoan: 100,
      shortageReady: 0,
      grossPay: 870,
      totalDeductions: 166.5,
      netPay: 703.5
    })
    assert.ok(slip)
    assert.deepEqual(
      slip.earnings.map((row) => row.label),
      ['Basic', 'Overtime', 'Add duties']
    )
    assert.deepEqual(
      slip.deductions.map((row) => row.label),
      ['N.I.S.', 'Staff Loan', 'CARED Loan']
    )
  })

  it('skips a person with nothing to pay', () => {
    assert.equal(
      buildPayslipLine({
        staffName: 'Skipped',
        staffNo: null,
        taxCode: '',
        basicPay: 0,
        otPay: 0,
        extraLines: [],
        extraDeductions: [],
        nisEmployee: 0,
        medical: 0,
        staffLoan: 0,
        shortageReady: 0,
        grossPay: 0,
        totalDeductions: 0,
        netPay: 0
      }),
      null
    )
  })

  it('prints the sample fields on the payslip page', () => {
    const html = renderPayslipsHtml({
      startDate: '2026-08-01',
      endDate: '2026-08-15',
      payDate: '2026-08-15',
      lines: [
        {
          staffName: 'Althea Frank',
          staffNo: '289864',
          taxCode: '220',
          basicPay: 900,
          otPay: 0,
          extraLines: [],
          extraDeductions: [],
          nisEmployee: 45,
          medical: 80.98,
          staffLoan: 0,
          shortageReady: 0,
          grossPay: 900,
          totalDeductions: 125.98,
          netPay: 774.02
        },
        {
          staffName: 'Judan Adrian',
          staffNo: '318250',
          taxCode: '225',
          basicPay: 519.06,
          otPay: 0,
          extraLines: [],
          extraDeductions: [],
          nisEmployee: 0,
          medical: 0,
          staffLoan: 0,
          shortageReady: 0,
          grossPay: 519.06,
          totalDeductions: 0,
          netPay: 519.06
        }
      ]
    })
    assert.match(html, /PAYEE/)
    assert.match(html, /Althea Frank/)
    assert.match(html, /PAY DATE:/)
    assert.match(html, /08\/15\/2026/)
    assert.match(html, /PAY CYCLE:<\/span> 15/)
    assert.match(html, /NIS #:/)
    assert.match(html, /289864/)
    assert.match(html, /Medical Insurance/)
    assert.match(html, /N\.I\.S\./)
    assert.match(html, /NET:/)
    assert.match(html, /774\.02/)
    assert.match(html, /519\.06/)
    assert.match(html, /Printed:/)
    assert.match(html, /Page: 1/)
  })
})

describe('G/L summary', () => {
  const station = {
    staffName: 'Station',
    staffNo: null,
    taxCode: '',
    basicPay: 6599.61,
    otPay: 0,
    extraLines: [],
    extraDeductions: [],
    nisEmployee: 304.03,
    medical: 270.33,
    staffLoan: 250,
    shortageReady: 0,
    grossPay: 6599.61,
    totalDeductions: 824.36,
    netPay: 5775.25
  }

  it('rolls the station into Cul de Sac earnings and deductions', () => {
    const summary = buildGlSummary([
      station,
      {
        ...station,
        staffName: 'Parts style',
        basicPay: 80,
        otPay: 40,
        extraLines: [{ label: 'Commission', amount: 25 }],
        extraDeductions: [{ label: 'PAYE', amount: 10 }],
        nisEmployee: 0,
        medical: 0,
        staffLoan: 0,
        grossPay: 145,
        totalDeductions: 10,
        netPay: 135
      }
    ])
    assert.equal(summary.centre, 'CUL DE SAC')
    assert.equal(summary.dept, '004')
    assert.deepEqual(
      summary.earnings.map((row) => row.label),
      ['Basic', 'Overtime', 'Commission']
    )
    assert.equal(summary.earnings[0].amount, 6679.61)
    assert.deepEqual(
      summary.deductions.map((row) => row.label),
      ['P.A.Y.E.', 'N.I.S.', 'Staff Loan', 'Medical Insurance']
    )
    assert.equal(summary.deductionsTotal, 834.36)
  })

  it('prints the analysis heading, centre, and grand totals', () => {
    const html = renderGlHtml({
      startDate: '2026-08-01',
      endDate: '2026-08-15',
      payDate: '2026-08-15',
      lines: [station]
    })
    assert.match(html, /G\/L Accounts \( ANALYSIS \)/)
    assert.match(html, /8\/1\/2026 - 8\/15\/2026/)
    assert.match(html, /CUL DE SAC/)
    assert.match(html, /004/)
    assert.match(html, /CENTRETOTALS/)
    assert.match(html, /GRAND TOTALS/)
    assert.match(html, /6599\.61/)
    assert.match(html, /824\.36/)
    assert.match(html, /Page: 1/)
    assert.match(html, /Page: 2/)
  })
})
