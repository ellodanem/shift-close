'use client'

import {
  SAINT_LUCIA_BANK_GROUPS,
  isKnownSaintLuciaBank
} from '@/lib/saint-lucia-banks'

const OTHER = '__other__'

type BankSelectProps = {
  value: string
  onChange: (value: string) => void
  className?: string
  id?: string
}

export default function BankSelect({ value, onChange, className, id }: BankSelectProps) {
  const trimmed = value.trim()
  const isOther = trimmed !== '' && !isKnownSaintLuciaBank(trimmed)
  const selectValue = trimmed === '' ? '' : isOther ? OTHER : trimmed

  return (
    <div className="space-y-2">
      <select
        id={id}
        value={selectValue}
        onChange={(e) => {
          const next = e.target.value
          if (next === '') onChange('')
          else if (next === OTHER) onChange(isOther ? trimmed : '')
          else onChange(next)
        }}
        className={className}
      >
        <option value="">Select a bank…</option>
        {SAINT_LUCIA_BANK_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.banks.map((bank) => (
              <option key={bank} value={bank}>
                {bank}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={OTHER}>Other…</option>
      </select>
      {selectValue === OTHER && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={className}
          placeholder="Enter bank name"
          autoFocus={!trimmed}
        />
      )}
    </div>
  )
}
