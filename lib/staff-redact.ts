import { canViewStaffSensitiveFields } from '@/lib/roles'

export function redactStaffRecord<
  T extends {
    nicNumber?: unknown
    bankName?: unknown
    accountNumber?: unknown
    hourlyRate?: unknown
    salariedAmount?: unknown
    staffLoan?: unknown
    medicalAmount?: unknown
    taxCode?: unknown
  }
>(staff: T, role: string): T {
  if (canViewStaffSensitiveFields(role)) return staff
  return {
    ...staff,
    nicNumber: null,
    bankName: null,
    accountNumber: null,
    hourlyRate: null,
    salariedAmount: null,
    staffLoan: null,
    medicalAmount: null,
    taxCode: null
  }
}
