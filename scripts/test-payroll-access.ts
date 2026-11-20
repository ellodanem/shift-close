import test from 'node:test'
import assert from 'node:assert/strict'
import { pathnameAllowedForRole } from '../lib/access-control'
import { buildFilteredNavGroups, navItemVisibleForRole } from '../lib/app-nav'
import { shortcutVisibleForRole } from '../lib/home-shortcuts'
import { canAccessPayroll, isPayrollFeaturePath } from '../lib/roles'
import { redactStaffRecord } from '../lib/staff-redact'

const PAYROLL_PATHS = [
  '/payroll',
  '/payroll/abc',
  '/pay-run',
  '/pay-run/abc',
  '/api/pay-runs',
  '/api/pay-runs/abc',
  '/api/pay-runs/settings',
  '/api/staff/abc/payslips',
  '/api/staff/abc/loan',
  '/api/attendance/pay-period/staff-payroll'
]

test('shareholder and accountant cannot use payroll', () => {
  assert.equal(canAccessPayroll('stakeholder'), false)
  assert.equal(canAccessPayroll('accountant'), false)
  for (const role of ['admin', 'manager', 'operations_manager', 'supervisor']) {
    assert.equal(canAccessPayroll(role), true, role)
  }
})

test('payroll feature paths are detected', () => {
  for (const path of PAYROLL_PATHS) {
    assert.equal(isPayrollFeaturePath(path), true, path)
  }
  assert.equal(isPayrollFeaturePath('/staff'), false)
  assert.equal(isPayrollFeaturePath('/api/staff/abc'), false)
  assert.equal(isPayrollFeaturePath('/accounting'), false)
})

test('shareholder and accountant cannot open payroll pages or APIs', () => {
  for (const role of ['stakeholder', 'accountant']) {
    for (const path of PAYROLL_PATHS) {
      assert.equal(pathnameAllowedForRole(path, role), false, `${role} ${path}`)
      assert.equal(navItemVisibleForRole(path, role), false, `${role} nav ${path}`)
    }
    assert.equal(shortcutVisibleForRole('/payroll', role), false, role)
  }
})

test('managers still have payroll', () => {
  for (const path of ['/payroll', '/pay-run', '/api/pay-runs']) {
    assert.equal(pathnameAllowedForRole(path, 'manager'), true, path)
    assert.equal(navItemVisibleForRole(path, 'admin'), true, path)
  }
})

test('accountant keeps books and loses the payroll nav group', () => {
  assert.equal(pathnameAllowedForRole('/accounting', 'accountant'), true)
  assert.equal(pathnameAllowedForRole('/api/accounting', 'accountant'), true)
  const groups = buildFilteredNavGroups('accountant')
  assert.equal(
    groups.some((group) => group.label === 'Payroll' || group.items.some((item) => item.href === '/payroll')),
    false
  )
})

test('shareholder still has staff and not payroll', () => {
  assert.equal(pathnameAllowedForRole('/staff', 'stakeholder'), true)
  assert.equal(pathnameAllowedForRole('/api/staff', 'stakeholder'), true)
  assert.equal(pathnameAllowedForRole('/payroll', 'stakeholder'), false)
  assert.equal(navItemVisibleForRole('/staff', 'stakeholder'), true)
  assert.equal(navItemVisibleForRole('/payroll', 'stakeholder'), false)
})

test('shareholder and accountant staff records hide pay rates', () => {
  const staff = {
    nicNumber: '123',
    bankName: 'RBC',
    accountNumber: '999',
    hourlyRate: 20,
    salariedAmount: 1000,
    staffLoan: 50,
    medicalAmount: 10,
    taxCode: 'A',
    nisExempt: false,
    payeExempt: false,
    taxNumber: 'T1'
  }
  const shareholder = redactStaffRecord(staff, 'stakeholder')
  assert.equal(shareholder.nicNumber, '123')
  assert.equal(shareholder.hourlyRate, null)
  assert.equal(shareholder.bankName, null)
  const accountant = redactStaffRecord(staff, 'accountant')
  assert.equal(accountant.hourlyRate, null)
  const manager = redactStaffRecord(staff, 'manager')
  assert.equal(manager.hourlyRate, 20)
})
