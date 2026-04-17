import type { Prisma } from '@prisma/client'

/**
 * ZKTeco terminals often send zero-padded numeric user IDs in ATTLOG (e.g. "0007")
 * while Staff.deviceUserId may be stored as "7". Match and group using these variants.
 */
export function deviceUserIdLookupKeys(raw: string): string[] {
  const t = raw.trim()
  if (!t) return []
  const keys = new Set<string>([t])
  if (/^\d+$/.test(t)) {
    keys.add(t.replace(/^0+/, '') || '0')
  }
  return [...keys]
}

/** Same person same calendar day when ids differ only by leading zeros. */
export function deviceUserIdForGrouping(raw: string): string {
  const t = raw.trim()
  if (/^\d+$/.test(t)) return t.replace(/^0+/, '') || '0'
  return t
}

export function expandDeviceUserIdsForDbMatch(ids: string[]): string[] {
  const out = new Set<string>()
  for (const id of ids) {
    for (const k of deviceUserIdLookupKeys(id)) out.add(k)
  }
  return [...out]
}

/** True when terminal id and staff profile id match (handles leading zeros). */
export function deviceUserIdsMatch(deviceUserIdOnLog: string, staffDeviceUserId: string): boolean {
  const a = deviceUserIdLookupKeys(deviceUserIdOnLog)
  const b = new Set(deviceUserIdLookupKeys(staffDeviceUserId))
  return a.some((k) => b.has(k))
}

/** ZKTeco-style numeric user id pool stored in `Staff.deviceUserId`. */
export const DEVICE_USER_ID_MIN = 1
export const DEVICE_USER_ID_MAX = 999

/**
 * Parses a 1–999 slot from stored text. Only all-digit strings count (leading zeros OK).
 * Non-numeric values return null so they do not consume a slot in the auto allocator.
 */
export function parseDeviceUserIdSlot(value: string | null | undefined): number | null {
  if (value == null) return null
  const t = String(value).trim()
  if (!/^\d+$/.test(t)) return null
  const n = parseInt(t, 10)
  if (!Number.isFinite(n) || n < DEVICE_USER_ID_MIN || n > DEVICE_USER_ID_MAX) return null
  return n
}

export function canonicalDeviceUserId(slot: number): string {
  return String(slot)
}

export async function getOccupiedDeviceSlots(
  tx: Prisma.TransactionClient
): Promise<Set<number>> {
  const rows = await tx.staff.findMany({
    where: { deviceUserId: { not: null } },
    select: { deviceUserId: true }
  })
  const occupied = new Set<number>()
  for (const r of rows) {
    const slot = parseDeviceUserIdSlot(r.deviceUserId)
    if (slot != null) occupied.add(slot)
  }
  return occupied
}

export function allocateNextFromOccupied(occupied: Set<number>): string | null {
  for (let i = DEVICE_USER_ID_MIN; i <= DEVICE_USER_ID_MAX; i++) {
    if (!occupied.has(i)) return canonicalDeviceUserId(i)
  }
  return null
}

export async function allocateNextDeviceUserId(
  tx: Prisma.TransactionClient
): Promise<string | null> {
  const occupied = await getOccupiedDeviceSlots(tx)
  return allocateNextFromOccupied(occupied)
}

export type ExplicitDeviceIdResult =
  | { ok: true; normalized: string; slot: number }
  | { ok: false; error: string }

/** Validates explicit input when a client sends a device id (POST/PATCH/map-users). */
export function parseExplicitDeviceUserIdInput(raw: unknown): ExplicitDeviceIdResult {
  const s = raw == null ? '' : String(raw).trim()
  if (!s) {
    return { ok: false, error: 'Device ID cannot be empty when provided.' }
  }
  const slot = parseDeviceUserIdSlot(s)
  if (slot == null) {
    return {
      ok: false,
      error: `Device ID must be a whole number from ${DEVICE_USER_ID_MIN} to ${DEVICE_USER_ID_MAX}.`
    }
  }
  return { ok: true, normalized: canonicalDeviceUserId(slot), slot }
}

/** Returns another staff member's id if they already use this numeric slot, else null. */
export async function findStaffOccupyingSlot(
  tx: Prisma.TransactionClient,
  slot: number,
  excludeStaffId?: string
): Promise<string | null> {
  const rows = await tx.staff.findMany({
    where: excludeStaffId ? { id: { not: excludeStaffId } } : undefined,
    select: { id: true, deviceUserId: true }
  })
  for (const r of rows) {
    if (parseDeviceUserIdSlot(r.deviceUserId) === slot) return r.id
  }
  return null
}
