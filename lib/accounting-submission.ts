import type { NextRequest } from 'next/server'
import { isAccountantRole } from '@/lib/roles'
import { getSessionFromRequest } from '@/lib/session'

/** Whether a request comes from the accountant-only role. */
export async function isAccountantRequest(request: NextRequest): Promise<boolean> {
  const session = await getSessionFromRequest(request)
  return isAccountantRole(session?.role ?? '')
}
