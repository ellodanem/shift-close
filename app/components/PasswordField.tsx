'use client'

import { useState } from 'react'

export function PasswordField({
  value,
  onChange,
  placeholder,
  className,
  inputClassName,
  minLength,
  required,
  autoComplete = 'new-password'
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  inputClassName?: string
  minLength?: number
  required?: boolean
  /** Use `current-password` on login; default `new-password` for account forms. */
  autoComplete?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className={`relative flex w-full items-center ${className ?? ''}`}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClassName ?? 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm pr-14'}
        autoComplete={autoComplete}
        minLength={minLength}
        required={required}
      />
      <button
        type="button"
        className="absolute right-2 text-xs font-medium text-gray-600 hover:text-gray-900"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}
