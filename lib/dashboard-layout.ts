/**
 * Dashboard widget layout - per-user ready.
 * For now uses localStorage. When users exist, switch to userId-scoped key or DB.
 */
export const DASHBOARD_WIDGET_IDS = [
  'month-summary',
  'fuel-mtd-deposit-block',
  'customer-ar-glance',
  'fuel-volume',
  'average-deposit',
  'recent-fuel-payment',
  'phase1-status'
] as const

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number]

/** Rendered fixed under month filters (not reorderable). Kept in layout for role gating only. */
export const DASHBOARD_PINNED_TOP_WIDGET_IDS: readonly DashboardWidgetId[] = ['fuel-mtd-deposit-block']

const DEFAULT_LAYOUT: DashboardWidgetId[] = [...DASHBOARD_WIDGET_IDS]

export function isPinnedTopDashboardWidget(id: DashboardWidgetId): boolean {
  return (DASHBOARD_PINNED_TOP_WIDGET_IDS as readonly string[]).includes(id)
}

/** Pinned widgets first (stable order), then the rest in their relative order. */
export function normalizeDashboardLayout(layout: DashboardWidgetId[]): DashboardWidgetId[] {
  const pinned = DASHBOARD_PINNED_TOP_WIDGET_IDS.filter((w) => layout.includes(w))
  const rest = layout.filter((w) => !isPinnedTopDashboardWidget(w))
  return [...pinned, ...rest]
}

const STORAGE_KEY = 'dashboardLayout'

function getStorageKey(userId?: string): string {
  return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY
}

export function getDefaultLayout(): DashboardWidgetId[] {
  return normalizeDashboardLayout([...DEFAULT_LAYOUT])
}

/** Keep customer A/R snapshot directly under monthly summary. */
export function ensureCustomerArAfterSummary(
  layout: DashboardWidgetId[]
): DashboardWidgetId[] {
  if (
    !layout.includes('month-summary') ||
    !layout.includes('customer-ar-glance')
  ) {
    return layout
  }
  const next: DashboardWidgetId[] = layout.filter((id) => id !== 'customer-ar-glance')
  const summaryIdx = next.indexOf('month-summary')
  if (summaryIdx < 0) return layout
  next.splice(summaryIdx + 1, 0, 'customer-ar-glance')
  return next
}

/**
 * Pair average deposit + recent fuel payment on one row; all other widgets full width.
 */
export function buildDashboardSegments(layout: DashboardWidgetId[]): DashboardWidgetId[][] {
  const used = new Set<DashboardWidgetId>()
  const out: DashboardWidgetId[][] = []

  for (const id of layout) {
    if (used.has(id)) continue
    if (
      id === 'average-deposit' &&
      layout.includes('recent-fuel-payment')
    ) {
      out.push(['average-deposit', 'recent-fuel-payment'])
      used.add('average-deposit')
      used.add('recent-fuel-payment')
      continue
    }
    if (id === 'recent-fuel-payment' && used.has('average-deposit')) {
      continue
    }
    out.push([id])
    used.add(id)
  }
  return out
}

export function loadDashboardLayout(userId?: string): DashboardWidgetId[] {
  if (typeof window === 'undefined') return getDefaultLayout()
  try {
    const raw = localStorage.getItem(getStorageKey(userId))
    if (!raw) return getDefaultLayout()
    const parsed = JSON.parse(raw) as string[]
    if (!Array.isArray(parsed)) return getDefaultLayout()
    const migrated = parsed
      .map((id) => {
        if (id === 'upcoming' || id === 'today-roster') return 'upcoming-roster'
        if (id === 'fuel-mtd-sold') return 'fuel-mtd-deposit-block'
        return id
      })
      .filter((id) => id !== 'upcoming-roster')
    const deduped = migrated.filter((id, i) => migrated.indexOf(id) === i)
    const withoutStale = deduped.filter((id) => id !== 'stale-ar-accounts')
    const valid = withoutStale.filter((id): id is DashboardWidgetId =>
      DASHBOARD_WIDGET_IDS.includes(id as DashboardWidgetId)
    )
    const missing = DEFAULT_LAYOUT.filter((id) => !valid.includes(id))
    let merged = [...valid, ...missing]
    if (missing.includes('customer-ar-glance')) {
      merged = merged.filter((id) => id !== 'customer-ar-glance')
      const si = merged.indexOf('month-summary')
      if (si >= 0) merged.splice(si + 1, 0, 'customer-ar-glance')
      else merged.splice(Math.min(1, merged.length), 0, 'customer-ar-glance')
    }
    if (missing.includes('average-deposit')) {
      merged = merged.filter((id) => id !== 'average-deposit')
      const vi = merged.indexOf('fuel-volume')
      if (vi >= 0) merged.splice(vi + 1, 0, 'average-deposit')
      else merged.push('average-deposit')
    }
    return normalizeDashboardLayout(ensureCustomerArAfterSummary(merged))
  } catch {
    return getDefaultLayout()
  }
}

export function saveDashboardLayout(layout: DashboardWidgetId[], userId?: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(
      getStorageKey(userId),
      JSON.stringify(
        normalizeDashboardLayout(ensureCustomerArAfterSummary(layout))
      )
    )
  } catch {
    // ignore
  }
}

export function moveWidgetUp(layout: DashboardWidgetId[], id: DashboardWidgetId): DashboardWidgetId[] {
  const normalized = normalizeDashboardLayout(layout)
  if (isPinnedTopDashboardWidget(id)) return normalized
  const pinned = DASHBOARD_PINNED_TOP_WIDGET_IDS.filter((w) => normalized.includes(w))
  const tail = normalized.filter((w) => !isPinnedTopDashboardWidget(w))
  const i = tail.indexOf(id)
  if (i <= 0) return normalized
  const nextTail = [...tail]
  ;[nextTail[i - 1], nextTail[i]] = [nextTail[i], nextTail[i - 1]]
  return normalizeDashboardLayout(ensureCustomerArAfterSummary([...pinned, ...nextTail]))
}

export function moveWidgetDown(layout: DashboardWidgetId[], id: DashboardWidgetId): DashboardWidgetId[] {
  const normalized = normalizeDashboardLayout(layout)
  if (isPinnedTopDashboardWidget(id)) return normalized
  const pinned = DASHBOARD_PINNED_TOP_WIDGET_IDS.filter((w) => normalized.includes(w))
  const tail = normalized.filter((w) => !isPinnedTopDashboardWidget(w))
  const i = tail.indexOf(id)
  if (i < 0 || i >= tail.length - 1) return normalized
  const nextTail = [...tail]
  ;[nextTail[i], nextTail[i + 1]] = [nextTail[i + 1], nextTail[i]]
  return normalizeDashboardLayout(ensureCustomerArAfterSummary([...pinned, ...nextTail]))
}
