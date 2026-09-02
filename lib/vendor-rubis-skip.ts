/** Rubis West Indies = fuel/LPG; handled in Fuel Payments, not vendor harvest. */
export const RUBIS_WEST_INDIES_VENDOR = /rubis\s*west\s*indies/i

export const RUBIS_VENDOR_SKIP_REASON =
  'Rubis West Indies is skipped — LPG/fuel invoices belong in Fuel Payments'

export function isRubisWestIndiesVendor(name: string): boolean {
  return RUBIS_WEST_INDIES_VENDOR.test(String(name || '').trim())
}
