/** Minimum time tab must stay hidden before a visibility refetch runs (reduces Neon/DB churn). */
export const VISIBILITY_REFETCH_MIN_HIDDEN_MS = 3 * 60 * 1000

export function shouldRefetchOnVisibility(hiddenAtMs: number | null, now = Date.now()): boolean {
  if (hiddenAtMs == null) return true
  return now - hiddenAtMs >= VISIBILITY_REFETCH_MIN_HIDDEN_MS
}
