import { prisma } from '@/lib/prisma'

/** Notes marker for a payee created from an overhead item, not a supplier. */
export const OVERHEAD_PAYEE_NOTE = 'overhead-payee'

export function isOverheadPayeeNote(notes: string | null | undefined): boolean {
  return (notes ?? '').trim() === OVERHEAD_PAYEE_NOTE
}

function placeholderEmail(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
  return `${slug || 'item'}@placeholder.local`
}

/** Reuse a vendor with this name, or create a hidden overhead payee so bills for the item pay together. */
export async function findOrCreateOverheadPayee(name: string) {
  const trimmed = name.trim()
  const existing = await prisma.vendor.findFirst({
    where: { name: { equals: trimmed, mode: 'insensitive' } }
  })
  if (existing) return existing
  return prisma.vendor.create({
    data: {
      name: trimmed,
      notificationEmail: placeholderEmail(trimmed),
      notes: OVERHEAD_PAYEE_NOTE
    }
  })
}
