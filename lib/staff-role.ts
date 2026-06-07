/** Normalize a staff role display name or legacy string to a comparable key. */
export function normalizeStaffRoleKey(role: string): string {
  return role
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

/** Map a staff_roles.name value to the legacy staff.role string. */
export function legacyRoleFromStaffRoleName(name: string): string {
  return normalizeStaffRoleKey(name)
}

export type StaffRoleLike = {
  role?: string | null
  staffRole?: { name?: string | null } | null
}

/** Effective role key for a staff record (prefers linked staffRole over legacy role). */
export function getStaffRoleKey(staff: StaffRoleLike): string {
  const fromRelation = staff.staffRole?.name?.trim()
  if (fromRelation) return normalizeStaffRoleKey(fromRelation)
  return normalizeStaffRoleKey(staff.role ?? '')
}

/** Active staff who may be assigned as shift supervisor. */
export function isShiftSupervisorCandidate(staff: StaffRoleLike & { status?: string | null }): boolean {
  if (staff.status !== 'active') return false
  const key = getStaffRoleKey(staff)
  return key === 'supervisor' || key === 'manager'
}

const SHIFT_SUPERVISOR_SORT_ORDER: Record<string, number> = {
  supervisor: 1,
  manager: 2
}

export function compareShiftSupervisorCandidates(a: StaffRoleLike, b: StaffRoleLike): number {
  const orderA = SHIFT_SUPERVISOR_SORT_ORDER[getStaffRoleKey(a)] ?? 99
  const orderB = SHIFT_SUPERVISOR_SORT_ORDER[getStaffRoleKey(b)] ?? 99
  return orderA - orderB
}
