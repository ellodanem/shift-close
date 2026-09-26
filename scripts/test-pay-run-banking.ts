import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bankTotalLabel,
  buildBankingPack,
  isCreditUnionBank,
  payrollBankCode
} from '../lib/pay-run-banking'
import { creditUnionLetters, defaultCreditUnionLetterText } from '../lib/pay-run-cu-letter'

describe('pay run banking', () => {
  it('maps staff banks to Pay+ codes', () => {
    assert.equal(payrollBankCode('Bank of Saint Lucia Ltd.', '123'), 'BOSL')
    assert.equal(payrollBankCode('CIBC Caribbean Bank Limited (formerly CIBC FirstCaribbean)', '1'), 'FCIB')
    assert.equal(payrollBankCode('CIBC', '1'), 'FCIB')
    assert.equal(payrollBankCode('Financial Investment and Consultancy Services Ltd', '107'), 'FICS')
    assert.equal(payrollBankCode('National Farmers & General Workers', '88'), 'NFGWCCU')
    assert.equal(payrollBankCode('Cheque', ''), 'CHQ')
    assert.equal(payrollBankCode('', ''), 'CHQ')
  })

  it('rolls FCIB and FICS into CIBC and keeps NFGWCCU unsplit', () => {
    assert.equal(bankTotalLabel('FCIB'), 'CIBC S/Station')
    assert.equal(bankTotalLabel('FICS'), 'CIBC S/Station')
    assert.equal(bankTotalLabel('CIBC'), 'CIBC S/Station')
    assert.equal(bankTotalLabel('NFGWCCU'), 'NFGWCCU')
    assert.equal(bankTotalLabel('CHQ'), 'Cheques')
    assert.equal(bankTotalLabel('BOSL'), 'BOSL S/Station')
  })

  it('ties listing, bank totals, extras, and the CU letter', () => {
    const pack = buildBankingPack(
      [
        { staffName: 'Crestie', bankCode: 'BOSL', accountNo: '1', netPay: 400 },
        { staffName: 'Natasha Sandiford', bankCode: 'BOSL', accountNo: '2', netPay: 400 },
        { staffName: 'Urancia Brown', bankCode: 'BOSL', staffNo: '320576', accountNo: '3', netPay: 381.71 },
        { staffName: 'Elena James', bankCode: 'FICS', accountNo: '107072661', netPay: 489.33 },
        { staffName: 'Orena Stange', bankCode: 'FCIB', staffNo: '343107', accountNo: '4', netPay: 436.8 },
        { staffName: 'Althea Frank', bankCode: 'NFGWCCU', accountNo: '9', netPay: 774.02 },
        { staffName: 'Jervis Byron', bankCode: 'CHQ', staffNo: '416470', accountNo: '', netPay: 500 },
        { staffName: 'Judan Adrian', bankCode: 'CHQ', accountNo: '', netPay: 514.58 }
      ],
      [
        { label: 'Rep', amount: 600 },
        { label: 'CARED', amount: 374.89 }
      ]
    )
    assert.equal(pack.listingTies, true)
    assert.equal(pack.bankTotals.find((t) => t.label === 'BOSL S/Station')?.amount, 1181.71)
    assert.equal(pack.bankTotals.find((t) => t.label === 'CIBC S/Station')?.amount, 926.13)
    assert.equal(pack.bankTotals.find((t) => t.label === 'NFGWCCU')?.amount, 774.02)
    assert.equal(pack.bankTotals.find((t) => t.label === 'Cheques')?.amount, 1014.58)
    assert.equal(pack.staffTotal, 3896.44)
    assert.equal(pack.extraTotal, 974.89)
    assert.equal(pack.bankingTotal, 4871.33)

    const letters = creditUnionLetters(pack)
    assert.equal(letters.length, 1)
    assert.equal(letters[0]?.code, 'NFGWCCU')
    assert.equal(letters[0]?.total, 774.02)
    assert.equal(letters[0]?.settlementAccount, '412102733')
    assert.match(defaultCreditUnionLetterText(letters[0]!, '2026-08-31'), /412102733/)
  })

  it('emails any credit union from a default letter', () => {
    assert.equal(payrollBankCode('Laborie Co-operative Credit Union', '55'), 'LABORIE')
    assert.equal(isCreditUnionBank('LABORIE'), true)
    assert.equal(bankTotalLabel('LABORIE'), 'LABORIE')
    const pack = buildBankingPack([
      {
        staffName: 'Jane Charles',
        bankName: 'Laborie Co-operative Credit Union',
        bankCode: 'LABORIECOOPE',
        accountNo: '55',
        netPay: 120
      },
      { staffName: 'Crestie', bankCode: 'BOSL', accountNo: '1', netPay: 40 }
    ])
    assert.equal(pack.listing.find((row) => row.staffName === 'Jane Charles')?.bankCode, 'LABORIE')
    assert.equal(pack.bankTotals.find((row) => row.label === 'LABORIE')?.amount, 120)
    const letters = creditUnionLetters(pack)
    assert.equal(letters.length, 1)
    assert.equal(letters[0]?.code, 'LABORIE')
    assert.equal(letters[0]?.legalName, 'Laborie Co-operative Credit Union')
    assert.equal(letters[0]?.settlementAccount, '')
    const text = defaultCreditUnionLetterText(letters[0]!, '2026-09-15')
    assert.match(text, /Laborie Co-operative Credit Union/)
    assert.match(text, /your institution/)
  })
})
