/**
 * Dashboard widget layout - per-user ready.
 * For now uses localStorage. When users exist, switch to userId-scoped key or DB.
 */
export const DASHBOARD_WIDGET_IDS = [
  'month-summary',
  'phase1-status',
  'upcoming',
  'today-roster',
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

export function loadDashboardLayout(userId?: string): DashboardWidgetId[] {
  if (typeof window === 'undefined') return getDefaultLayout()
  try {
    const raw = localStorage.getItem(getStorageKey(userId))
    if (!raw) return DEFAULT_LAYOUT
    const parsed = JSON.parse(raw) as string[]
    if (!Array.isArray(parsed)) return DEFAULT_LAYOUT
    const valid = parsed.filter((id): id is DashboardWidgetId =>
      DASHBOARD_WIDGET_IDS.includes(id as DashboardWidgetId)
    )
    const missing = DEFAULT_LAYOUT.filter(id => !valid.includes(id))
    return [...valid, ...missing]
  } catch {
    return DEFAULT_LAYOUT
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
