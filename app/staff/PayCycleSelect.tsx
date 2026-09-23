'use client'

import { PAY_CYCLE_VALUES, PAY_CYCLE_LABELS, parsePayCycle, type PayCycle } from '@/lib/pay-cycle'

export default function PayCycleSelect({
  value,
  onChange,
  className,
  id
}: {
  value: string
  onChange: (value: PayCycle) => void
  className?: string
  id?: string
}) {
  return (
    <select
      id={id}
      value={parsePayCycle(value)}
      onChange={(e) => onChange(parsePayCycle(e.target.value))}
      className={className}
    >
      {PAY_CYCLE_VALUES.map((cycle) => (
        <option key={cycle} value={cycle}>
          {PAY_CYCLE_LABELS[cycle]}
        </option>
      ))}
    </select>
  )
}
