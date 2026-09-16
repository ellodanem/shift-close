export const RELIABILITY_GRADES = ['A', 'B', 'C', 'D', 'F'] as const
export type ReliabilityGrade = (typeof RELIABILITY_GRADES)[number]

export function isReliabilityGrade(value: unknown): value is ReliabilityGrade {
  return typeof value === 'string' && (RELIABILITY_GRADES as readonly string[]).includes(value)
}

export function parseReliabilityGrade(value: unknown): ReliabilityGrade | null {
  if (value == null || value === '') return null
  const upper = String(value).trim().toUpperCase()
  return isReliabilityGrade(upper) ? upper : null
}

export function nameLooksLikeJervis(...parts: Array<string | null | undefined>): boolean {
  return /\bjervis\b/i.test(parts.filter(Boolean).join(' '))
}

/** Placeholder random grade. Nobody except Jervis gets below a C. */
export function randomPlaceholderReliabilityGrade(
  ...nameParts: Array<string | null | undefined>
): ReliabilityGrade {
  if (nameLooksLikeJervis(...nameParts)) {
    return Math.random() < 0.5 ? 'D' : 'F'
  }
  const pool: ReliabilityGrade[] = ['A', 'B', 'C']
  return pool[Math.floor(Math.random() * pool.length)]!
}

export function reliabilityGradeClassName(grade: string | null | undefined): string {
  switch (grade) {
    case 'A':
      return 'bg-emerald-100 text-emerald-800 border-emerald-300'
    case 'B':
      return 'bg-lime-100 text-lime-800 border-lime-300'
    case 'C':
      return 'bg-amber-100 text-amber-800 border-amber-300'
    case 'D':
      return 'bg-orange-100 text-orange-800 border-orange-300'
    case 'F':
      return 'bg-red-100 text-red-800 border-red-300'
    default:
      return 'bg-gray-100 text-gray-500 border-gray-300'
  }
}
