'use client'

import { PAY_TYPE_VALUES, PAY_TYPE_LABELS, parsePayType, type PayType } from '@/lib/pay-run'

export default function PayTypeSelect({
  value,
  onChange,
  className,
  id
}: {
  value: string
  onChange: (value: PayType) => void
  className?: string
  id?: string
}) {
  return (
    <select
      id={id}
      value={parsePayType(value)}
      onChange={(e) => onChange(parsePayType(e.target.value))}
      className={className}
    >
      {PAY_TYPE_VALUES.map((type) => (
        <option key={type} value={type}>
          {PAY_TYPE_LABELS[type]}
        </option>
      ))}
    </select>
  )
}
