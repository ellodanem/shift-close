'use client'

import { useEffect, useState } from 'react'
import {
  RELIABILITY_GRADES,
  parseReliabilityGrade,
  reliabilityGradeClassName,
  type ReliabilityGrade
} from '@/lib/staff-reliability'

const TITLE = 'Reliability score (placeholder — will be calculated later)'

export default function StaffReliabilityGrade({
  staffId,
  grade,
  persist = true,
  size = 'md',
  onChange
}: {
  staffId?: string
  grade: string | null | undefined
  persist?: boolean
  size?: 'sm' | 'md'
  onChange?: (grade: ReliabilityGrade) => void
}) {
  const [value, setValue] = useState<ReliabilityGrade | ''>(() => parseReliabilityGrade(grade) ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValue(parseReliabilityGrade(grade) ?? '')
  }, [grade])

  const save = async (next: ReliabilityGrade) => {
    const previous = value
    setValue(next)
    onChange?.(next)
    if (!staffId || !persist) return
    setSaving(true)
    try {
      const res = await fetch(`/api/staff/${staffId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reliabilityGrade: next })
      })
      if (!res.ok) {
        throw new Error('Failed to save reliability score')
      }
    } catch (error) {
      console.error(error)
      setValue(previous)
      if (previous) onChange?.(previous as ReliabilityGrade)
    } finally {
      setSaving(false)
    }
  }

  const sizeClass =
    size === 'sm'
      ? 'h-6 w-6 text-[11px]'
      : 'h-7 w-7 text-xs sm:h-8 sm:w-8 sm:text-sm'

  return (
    <label className="relative inline-flex shrink-0" title={TITLE} onClick={(e) => e.stopPropagation()}>
      <span className="sr-only">Reliability score</span>
      <select
        aria-label="Reliability score"
        value={value}
        disabled={saving}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation()
          const next = parseReliabilityGrade(e.target.value)
          if (next) void save(next)
        }}
        className={`appearance-none rounded border font-bold text-center cursor-pointer leading-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 ${sizeClass} ${reliabilityGradeClassName(
          value || null
        )}`}
      >
        {!value && <option value="">–</option>}
        {RELIABILITY_GRADES.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
    </label>
  )
}
