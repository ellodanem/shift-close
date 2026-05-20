import { deviceUserIdLookupKeys } from '@/lib/device-user-id'

export type StaffDeviceMatch = { id: string; name: string; deviceUserId: string }

export function buildStaffDeviceMap(
  allStaff: Array<{ id: string; name: string; deviceUserId: string | null }>
): Map<string, StaffDeviceMatch> {
  const staffMap = new Map<string, StaffDeviceMatch>()
  for (const s of allStaff) {
    if (!s.deviceUserId?.trim()) continue
    const canon = s.deviceUserId.trim()
    const payload: StaffDeviceMatch = { id: s.id, name: s.name, deviceUserId: canon }
    for (const k of deviceUserIdLookupKeys(canon)) {
      staffMap.set(k, payload)
    }
  }
  return staffMap
}

export function lookupStaffDevice(
  staffMap: Map<string, StaffDeviceMatch>,
  rawFromLine: string
): StaffDeviceMatch | undefined {
  for (const k of deviceUserIdLookupKeys(rawFromLine)) {
    const m = staffMap.get(k)
    if (m) return m
  }
  return undefined
}
