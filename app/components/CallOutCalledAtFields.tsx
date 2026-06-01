'use client'

import {
  CALL_OUT_TIME_SELECT_OPTIONS,
  type CalledAtParts
} from '@/lib/call-outs'

type CallOutCalledAtFieldsProps = {
  value: CalledAtParts
  onChange: (next: CalledAtParts) => void
  labelClassName?: string
  fieldClassName?: string
}

export default function CallOutCalledAtFields({
  value,
  onChange,
  labelClassName = 'block text-sm font-medium text-gray-700 mb-1',
  fieldClassName = 'border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400'
}: CallOutCalledAtFieldsProps) {
  const hasValue = Boolean(value.date || value.time)

  return (
    <div>
      <label className={labelClassName}>
        Called at <span className="text-gray-400 font-normal">(optional)</span>
      </label>
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="date"
          value={value.date}
          onChange={(e) => onChange({ ...value, date: e.target.value })}
          className={`flex-1 min-w-[8.5rem] ${fieldClassName}`}
          aria-label="Called at date"
        />
        <select
          value={value.time}
          onChange={(e) => onChange({ ...value, time: e.target.value })}
          className={`flex-1 min-w-[7.5rem] ${fieldClassName}`}
          aria-label="Called at time"
        >
          {CALL_OUT_TIME_SELECT_OPTIONS.map((opt) => (
            <option key={opt.value || 'empty'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onChange({ date: '', time: '' })}
          disabled={!hasValue}
          className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          Clear
        </button>
      </div>
    </div>
  )
}
