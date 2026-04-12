/**
 * Dashboard widget layout - per-user ready.
 * For now uses localStorage. When users exist, switch to userId-scoped key or DB.
 */
export const DASHBOARD_WIDGET_IDS = [
  'month-summary',
  'fuel-mtd-deposit-block',
  'customer-ar-glance',
  'average-deposit',
  'phase1-status',
  'fuel-volume',
  'recent-fuel-payment'
] as const

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number]

const DEFAULT_LAYOUT: DashboardWidgetId[] = [...DASHBOARD_WIDGET_IDS]

const STORAGE_KEY = 'dashboardLayout'

function getStorageKey(userId?: string): string {
  return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY
}

export function getDefaultLayout(): DashboardWidgetId[] {
  return [...DEFAULT_LAYOUT]
}

/**
 * Group customer A/R + fuel MTD into one row when both are present (side-by-side on large screens).
 */
export function buildDashboardSegments(layout: DashboardWidgetId[]): DashboardWidgetId[][] {
  const hasAr = layout.includes('customer-ar-glance')
  const hasFuel = layout.includes('fuel-mtd-deposit-block')
  const pairActive = hasAr && hasFuel
  const used = new Set<DashboardWidgetId>()
  const out: DashboardWidgetId[][] = []

  for (const id of layout) {
    if (used.has(id)) continue
    if (pairActive && (id === 'customer-ar-glance' || id === 'fuel-mtd-deposit-block')) {
      // Fuel sold left, Customer accounts right (matches dashboard layout)
      out.push(['fuel-mtd-deposit-block', 'customer-ar-glance'])
      used.add('customer-ar-glance')
      used.add('fuel-mtd-deposit-block')
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
    // Migrate: 'upcoming' / 'today-roster' / 'upcoming-roster' → dropped (roster is fixed in dashboard header)
    // Migrate: 'fuel-mtd-sold' -> 'fuel-mtd-deposit-block' (average-deposit is its own widget)
    const migrated = parsed
      .map((id) => {
        if (id === 'upcoming' || id === 'today-roster') return 'upcoming-roster'
        if (id === 'fuel-mtd-sold') return 'fuel-mtd-deposit-block'
        return id
      })
      .filter((id) => id !== 'upcoming-roster')
    const deduped = migrated.filter((id, i) => migrated.indexOf(id) === i)
    const valid = deduped.filter((id): id is DashboardWidgetId =>
      DASHBOARD_WIDGET_IDS.includes(id as DashboardWidgetId)
    )
    const missing = DEFAULT_LAYOUT.filter(id => !valid.includes(id))
    let merged = [...valid, ...missing]
    // Place customer-ar-glance after fuel-mtd-deposit-block when missing (paired row)
    if (missing.includes('customer-ar-glance')) {
      merged = merged.filter((id) => id !== 'customer-ar-glance')
      const fi = merged.indexOf('fuel-mtd-deposit-block')
      if (fi >= 0) merged.splice(fi + 1, 0, 'customer-ar-glance')
      else merged.splice(Math.min(1, merged.length), 0, 'customer-ar-glance')
    }
    if (missing.includes('average-deposit')) {
      merged = merged.filter((id) => id !== 'average-deposit')
      const ci = merged.indexOf('customer-ar-glance')
      if (ci >= 0) merged.splice(ci + 1, 0, 'average-deposit')
      else {
        const fi = merged.indexOf('fuel-mtd-deposit-block')
        if (fi >= 0) merged.splice(fi + 1, 0, 'average-deposit')
        else merged.push('average-deposit')
      }
    }
    return merged
  } catch {
    return getDefaultLayout()
  }
}

export function saveDashboardLayout(layout: DashboardWidgetId[], userId?: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(layout))
  } catch {
    // ignore
  }
}

export function moveWidgetUp(layout: DashboardWidgetId[], id: DashboardWidgetId): DashboardWidgetId[] {
  const i = layout.indexOf(id)
  if (i <= 0) return layout
  const next = [...layout]
  ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
  return next
}

export function moveWidgetDown(layout: DashboardWidgetId[], id: DashboardWidgetId): DashboardWidgetId[] {
  const i = layout.indexOf(id)
  if (i < 0 || i >= layout.length - 1) return layout
  const next = [...layout]
  ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
  return next
}
