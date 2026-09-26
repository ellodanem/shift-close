import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  averageMonthlyFromHourly,
  buildJobLetter,
  employmentTenure,
  formatJobLetterDate,
  jobLetterLaterName,
  monthlyBasicSalary
} from '../lib/job-letter'

describe('job letter', () => {
  it('formats the letter date like the Total Auto template', () => {
    assert.equal(formatJobLetterDate('2025-07-08'), 'July 8, 2025')
  })

  it('counts completed years up to the letter date', () => {
    assert.deepEqual(employmentTenure('2002-07-08', '2025-07-08'), { years: 23, months: 0 })
    assert.deepEqual(employmentTenure('2002-07-09', '2025-07-08'), { years: 22, months: 11 })
    assert.deepEqual(employmentTenure('2026-01-26', '2026-09-26'), { years: 0, months: 8 })
    assert.equal(employmentTenure(null, '2026-09-26'), null)
  })

  it('uses a courtesy title plus surname on later mentions', () => {
    assert.equal(jobLetterLaterName('Ms. Marjorie Poleon'), 'Ms. Poleon')
    assert.equal(jobLetterLaterName('Eli Houson'), 'Eli Houson')
  })

  it('turns a semi-monthly salary into the monthly figure used in the letter', () => {
    assert.equal(
      monthlyBasicSalary({ payType: 'salaried', payCycle: 'semimonthly', salariedAmount: 1600 }),
      3200
    )
    assert.equal(
      monthlyBasicSalary({ payType: 'salaried', payCycle: 'monthly', salariedAmount: 3200 }),
      3200
    )
    assert.equal(monthlyBasicSalary({ payType: 'hourly', salariedAmount: 3200 }), null)
  })

  it('reproduces the Marjorie template with name, tenure, role, and pay filled in', () => {
    const letter = buildJobLetter(
      {
        name: 'Ms. Marjorie Poleon',
        startDate: '2002-07-08',
        roleName: 'Store Manager',
        payType: 'salaried',
        payCycle: 'monthly',
        salariedAmount: 3200,
        monthlyTravelAllowance: 500
      },
      '2025-07-08'
    )

    assert.match(letter, /^Total Auto Inc\.\nJohn Compton Highway & Cul-de-sac\nGm 674, Castries\nTele\. \(758\) 451-4500\/458-2943\/451-5969/)
    assert.match(letter, /July 8, 2025/)
    assert.match(letter, /The Manager\n\nDear Sir\/Madam,/)
    assert.match(
      letter,
      /This serves to confirm that Ms\. Marjorie Poleon has been employed with Total Auto Inc\. as Store Manager for the past twenty-three \(23\) years\. Ms\. Poleon earns a basic salary of \$3200\.00 plus \$500\.00 traveling allowance per month\./
    )
    assert.match(
      letter,
      /Ms\. Poleon has indicated an interest in doing business with your company\.\nAny courtesies extended would be greatly appreciated\./
    )
    assert.match(letter, /Yours truly,\n\n\nElrus Elcock\nManaging Director$/)
    assert.doesNotMatch(letter, /\[Not provided\]|\[Company Name\]|JOB LETTER/)
  })

  it('fills Eli from the staff record when start date and salary are not on file', () => {
    const letter = buildJobLetter(
      {
        name: 'Eli Houson',
        startDate: null,
        role: 'pump_attendant',
        roleName: 'Pump Attendant',
        payType: 'hourly',
        payCycle: 'semimonthly',
        hourlyRate: 6.75,
        salariedAmount: null
      },
      '2026-09-26'
    )

    assert.equal(averageMonthlyFromHourly(6.75), 1170)
    assert.match(letter, /September 26, 2026/)
    assert.match(
      letter,
      /This serves to confirm that Eli Houson is employed with Total Auto Inc\. as a Pump Attendant\. Eli Houson is paid at the rate of \$6\.75 per hour, resulting in an average monthly salary of one thousand, one hundred seventy dollars \(\$1170\.00\) monthly \(payable bi-monthly\)\./
    )
    assert.match(
      letter,
      /Eli Houson has indicated an interest in doing business with your institution\. Any courtesies extended will be greatly appreciated\./
    )
    assert.doesNotMatch(letter, /for the past|\[Not provided\]|Pump_attendant|Date of Birth/)
  })

  it('reproduces the hourly Crestie letter with years, months, rate, and bi-monthly pay', () => {
    const letter = buildJobLetter(
      {
        name: 'Mr. Crestie Houson',
        startDate: '2023-12-30',
        roleName: 'Customer Sales Representative',
        payType: 'hourly',
        payCycle: 'semimonthly',
        hourlyRate: 6.75
      },
      '2026-07-30'
    )

    assert.match(
      letter,
      /This serves to confirm that Mr\. Crestie Houson is employed with Total Auto Inc\. as a Customer Sales Representative for the past 2 years seven months\. Mr\. Houson is paid at the rate of \$6\.75 per hour, resulting in an average monthly salary of one thousand, one hundred seventy dollars \(\$1170\.00\) monthly \(payable bi-monthly\)\./
    )
    assert.match(
      letter,
      /Mr\. Houson has indicated his interest in doing business with your institution\. Any courtesies extended to him will be greatly appreciated\./
    )
  })

  it('uses months when employment is under a year, and one year in the singular', () => {
    const months = buildJobLetter(
      { name: 'Eli Houson', startDate: '2026-01-26', roleName: 'Pump Attendant' },
      '2026-09-26'
    )
    assert.match(months, /for the past eight \(8\) months/)

    const year = buildJobLetter(
      { name: 'Eli Houson', startDate: '2025-09-26', roleName: 'Pump Attendant' },
      '2026-09-26'
    )
    assert.match(year, /for the past one \(1\) year\./)
  })
})
