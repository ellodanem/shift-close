import type { ShiftCashCheckSummary, ShiftCountSystemRow } from '@/app/shifts/ShiftCountSystemGrid'

type CountSystemFields = {
  countCash: number
  systemCash: number
  countChecks: number
  systemChecks: number
  countCredit: number
  systemCredit: number
  countInhouse: number
  systemInhouse: number
  countFleet: number
  systemFleet: number
  countMassyCoupons: number
  systemMassyCoupons: number
}

function n(v: number): number {
  return Number.isNaN(v) ? 0 : v
}

function diff(count: number, system: number): number {
  return n(count) - n(system)
}

export function buildCountSystemRows(
  data: CountSystemFields,
  options?: {
    overShortCash?: number
    overShortTotal?: number
    checksOverShort?: number
    highlights?: { count?: Set<string>; system?: Set<string> }
  }
): { rows: ShiftCountSystemRow[]; summary: ShiftCashCheckSummary } {
  const highlights = options?.highlights

  const rows: ShiftCountSystemRow[] = [
    {
      key: 'cash',
      label: 'Cash',
      count: data.countCash,
      system: data.systemCash,
      overShort: options?.overShortCash ?? diff(data.countCash, data.systemCash),
      countHighlight: highlights?.count?.has('countCash'),
      systemHighlight: highlights?.system?.has('systemCash')
    },
    {
      key: 'checks',
      label: 'Checks',
      count: data.countChecks,
      system: data.systemChecks,
      overShort:
        options?.checksOverShort ??
        (options?.overShortTotal != null && options?.overShortCash != null
          ? options.overShortTotal - options.overShortCash
          : diff(data.countChecks, data.systemChecks)),
      countHighlight: highlights?.count?.has('countChecks'),
      systemHighlight: highlights?.system?.has('systemChecks')
    },
    {
      key: 'credits',
      label: 'Credits',
      count: data.countCredit,
      system: data.systemCredit,
      overShort: diff(data.countCredit, data.systemCredit),
      countHighlight: highlights?.count?.has('countCredit'),
      systemHighlight: highlights?.system?.has('systemCredit')
    },
    {
      key: 'inhouse',
      label: 'In-House',
      count: data.countInhouse,
      system: data.systemInhouse,
      overShort: diff(data.countInhouse, data.systemInhouse),
      countHighlight: highlights?.count?.has('countInhouse'),
      systemHighlight: highlights?.system?.has('systemInhouse')
    },
    {
      key: 'fleets',
      label: 'Fleets',
      count: data.countFleet,
      system: data.systemFleet,
      overShort: diff(data.countFleet, data.systemFleet),
      countHighlight: highlights?.count?.has('countFleet'),
      systemHighlight: highlights?.system?.has('systemFleet')
    },
    {
      key: 'massy',
      label: 'Massy Coupons',
      count: data.countMassyCoupons,
      system: data.systemMassyCoupons,
      overShort: diff(data.countMassyCoupons, data.systemMassyCoupons),
      countHighlight: highlights?.count?.has('countMassyCoupons'),
      systemHighlight: highlights?.system?.has('systemMassyCoupons')
    }
  ]

  const summary: ShiftCashCheckSummary = {
    countTotal: n(data.countCash) + n(data.countChecks),
    systemTotal: n(data.systemCash) + n(data.systemChecks),
    overShortTotal: options?.overShortTotal ?? diff(n(data.countCash) + n(data.countChecks), n(data.systemCash) + n(data.systemChecks))
  }

  return { rows, summary }
}

export function correctionHighlights(
  changedFields: Set<string>
): { count: Set<string>; system: Set<string> } {
  const count = new Set<string>()
  const system = new Set<string>()
  for (const f of changedFields) {
    if (f.startsWith('count')) count.add(f)
    if (f.startsWith('system')) system.add(f)
  }
  return { count, system }
}
