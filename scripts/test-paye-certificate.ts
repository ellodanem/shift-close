import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildPayeCertificates,
  filingDeadlineLabel,
  incomeYearOf,
  incomeYearRange,
  payeCertificateFilename,
  payeCertificateForm,
  renderPayeCertificateHtml,
  type PayeCertificateSourceLine,
  type PayeCertificateStaff
} from '../lib/paye-certificate'

function line(overrides: Partial<PayeCertificateSourceLine> = {}): PayeCertificateSourceLine {
  return {
    payDate: '2026-06-30',
    staffId: 'brown',
    staffName: 'Brown Urancia',
    staffNo: '320576',
    taxCode: '225B',
    basicPay: 1000,
    otPay: 0,
    vacationPay: 0,
    extraPay: 0,
    extraLines: [],
    extraDeductions: [],
    nisEmployee: 50,
    paye: 0,
    ...overrides
  }
}

const brown: PayeCertificateStaff = {
  id: 'brown',
  name: 'Brown Urancia',
  address: 'Goodlands',
  startDate: '2026-06-17',
  status: 'active',
  nicNumber: '320576',
  taxCode: '225B',
  taxNumber: ''
}

describe('TD5 / TD4 certificates', () => {
  it('uses TD5 for someone still employed and TD4 once they are inactive', () => {
    assert.equal(payeCertificateForm('active'), 'TD5')
    assert.equal(payeCertificateForm('inactive'), 'TD4')
    assert.equal(payeCertificateForm(null), 'TD5')
  })

  it('treats a calendar year as the income year and files the following March 31', () => {
    assert.deepEqual(incomeYearRange(2026), { startDate: '2026-01-01', endDate: '2026-12-31' })
    assert.equal(incomeYearOf('2026-06-17', '2026-07-31'), 2026)
    assert.equal(incomeYearOf('2026-01-01', '2027-01-15'), null)
    assert.equal(incomeYearOf('2026-08-01', '2026-07-01'), null)
    assert.equal(filingDeadlineLabel(2026), 'March 31, 2027')
    assert.equal(payeCertificateFilename('2026-01-01', '2026-12-31'), 'td5-td4-2026.pdf')
    assert.equal(payeCertificateFilename('2026-06-01', '2026-06-30'), 'td5-td4-2026-06-01-2026-06-30.pdf')
  })

  it('adds approved pay in the range into one certificate', () => {
    const certificates = buildPayeCertificates(
      2026,
      [
        line({ basicPay: 1000, otPay: 40, nisEmployee: 52, paye: 10 }),
        line({
          payDate: '2026-07-15',
          basicPay: 854.03,
          otPay: 34.23,
          nisEmployee: 44.41,
          paye: 0,
          taxCode: '230B',
          extraPay: 25,
          extraLines: [{ label: 'Travel allowance', amount: 25 }]
        })
      ],
      [brown]
    )
    assert.equal(certificates.length, 1)
    const cert = certificates[0]
    assert.equal(cert.form, 'TD5')
    assert.equal(cert.employed, '2026-06-17')
    assert.equal(cert.taxCode, '230B')
    assert.equal(cert.nisNumber, '320576')
    assert.deepEqual(
      cert.earnings.map((row) => [row.label, row.amount]),
      [
        ['Basic', 1854.03],
        ['O/T(one&half)', 74.23]
      ]
    )
    assert.equal(cert.earningsTotal, 1928.26)
    assert.equal(cert.allowances, 25)
    assert.deepEqual(
      cert.deductions.map((row) => [row.label, row.amount]),
      [
        ['N.I.S.', 96.41],
        ['P.A.Y.E.', 10]
      ]
    )
  })

  it('prints a TD4 for an inactive person and uses a typed PAYE amount when none was calculated', () => {
    const certificates = buildPayeCertificates(
      2026,
      [
        line({
          staffId: 'byron',
          staffName: 'Byron Jervis',
          staffNo: '416470',
          basicPay: 521.6,
          nisEmployee: 26.08,
          paye: 0,
          extraDeductions: [{ label: 'PAYE', amount: 8 }]
        })
      ],
      [
        {
          id: 'byron',
          name: 'Byron Jervis',
          address: 'Marigot',
          startDate: '2026-07-31',
          status: 'inactive',
          nicNumber: null,
          taxCode: '',
          taxNumber: '062805'
        }
      ]
    )
    const cert = certificates[0]
    assert.equal(cert.form, 'TD4')
    assert.equal(cert.taxNumber, '062805')
    assert.equal(cert.nisNumber, '416470')
    assert.equal(cert.deductions.find((row) => row.label === 'P.A.Y.E.')?.amount, 8)
    assert.equal(cert.earnings.some((row) => row.label.startsWith('O/T')), false)
  })

  it('leaves out a person with no pay in the range', () => {
    const certificates = buildPayeCertificates(2026, [line({ basicPay: 0, nisEmployee: 0, staffName: 'Zero' })], [])
    assert.deepEqual(certificates, [])
  })

  it('renders the filing line and the form name', () => {
    const certificates = buildPayeCertificates(
      2026,
      [line({ staffName: 'Brown <Urancia>' })],
      [{ ...brown, name: 'Brown <Urancia>' }]
    )
    const html = renderPayeCertificateHtml({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      incomeYear: 2026,
      certificates
    })
    assert.match(html, /TD5/)
    assert.match(html, /Brown &lt;Urancia&gt;/)
    assert.match(html, /06\/17\/2026/)
    assert.match(html, /ATTACH THIS COPY TO YOUR RETURN AND FILE ON OR BEFORE MARCH 31, 2027/)
    assert.match(html, /TOTAL ALLOWANCES/)
    assert.match(html, /1000\.00/)
  })
})
