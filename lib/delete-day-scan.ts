export type DayScanKind = 'deposit' | 'debit' | 'security'

export function confirmDeleteDayScan(): boolean {
  return window.confirm('Delete this photo? This cannot be undone.')
}

export async function deleteDayScan(date: string, url: string, type: DayScanKind): Promise<void> {
  const res = await fetch(`/api/days/${date}/upload`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, type })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(typeof err.error === 'string' ? err.error : 'Delete failed')
  }
}
