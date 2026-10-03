'use client'

import { useEffect, useRef, useState } from 'react'
import { formatAmount } from '@/lib/fuelPayments'

export type PayBillLine = {
  number: string
  date: string
  amount: number
}

export type PayBillsInput = {
  paymentDate: string
  bankRef: string
  paymentMethod: 'check' | 'eft'
}

function money(amount: number): string {
  return formatAmount(amount)
}

function RefField({
  label,
  value,
  fuel,
  paymentMethod,
  onChange
}: {
  label: string
  value: string
  fuel: boolean
  paymentMethod: 'check' | 'eft'
  onChange: (value: string) => void
}) {
  const [touched, setTouched] = useState(false)
  const missing = touched && !value.trim()
  const bankRef = fuel || paymentMethod === 'eft'
  return (
    <label className="block text-sm">
      <span className="font-medium text-gray-700">
        {label} <span className="text-red-500">*</span>
      </span>
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(event) => onChange(fuel ? event.target.value.replace(/\D/g, '') : event.target.value)}
        onBlur={() => setTouched(true)}
        placeholder={bankRef ? 'e.g. 18921926' : 'e.g. 1234'}
        aria-invalid={missing}
        className={`mt-1 min-h-[44px] w-full rounded-md border px-3 py-2 font-mono focus:outline-none focus:ring-2 sm:min-h-0 ${
          missing ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'
        }`}
      />
      {missing ? (
        <span className="mt-1 block text-xs text-red-600">
          {bankRef ? 'Bank reference is required.' : 'Check number is required.'}
        </span>
      ) : null}
    </label>
  )
}

export function PayBillsModal({
  open,
  payeeName,
  fuel,
  bills,
  paying,
  error,
  defaultDate,
  onClose,
  onPay
}: {
  open: boolean
  payeeName: string
  fuel: boolean
  bills: PayBillLine[]
  paying: boolean
  error: string | null
  defaultDate: string
  onClose: () => void
  onPay: (input: PayBillsInput) => void
}) {
  const [paymentDate, setPaymentDate] = useState(defaultDate)
  const [bankRef, setBankRef] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'check' | 'eft'>('check')
  const wasOpen = useRef(false)
  const total = bills.reduce((sum, bill) => sum + bill.amount, 0)
  const refLabel = fuel || paymentMethod === 'eft' ? 'Bank ref' : 'Check number'
  const refMissing = !bankRef.trim()
  const canSubmit = bills.length > 0 && !!paymentDate && !refMissing && !paying

  useEffect(() => {
    if (open && !wasOpen.current) {
      setPaymentDate(defaultDate)
      setBankRef('')
      setPaymentMethod('check')
    }
    wasOpen.current = open
  }, [open, defaultDate])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !paying) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, paying, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      role="presentation"
      onMouseDown={() => {
        if (!paying) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pay-bills-title"
        className="my-4 max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="pay-bills-title" className="text-xl font-bold text-gray-900">
          Pay {payeeName}
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          {bills.length} bill{bills.length === 1 ? '' : 's'} · {money(total)}. Confirm the reference before this posts to the cashbook.
        </p>

        <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Number</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((bill, index) => (
                <tr key={`${bill.number}:${bill.date}:${index}`} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-mono">{bill.number}</td>
                  <td className="px-3 py-2">{bill.date}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(bill.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form
          className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!canSubmit) return
            onPay({ paymentDate, bankRef: bankRef.trim(), paymentMethod })
          }}
        >
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Payment date</span>
            <input
              type="date"
              value={paymentDate}
              onChange={(event) => setPaymentDate(event.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:min-h-0"
            />
          </label>
          {fuel ? (
            <RefField
              label={refLabel}
              value={bankRef}
              fuel
              paymentMethod={paymentMethod}
              onChange={setBankRef}
            />
          ) : (
            <label className="block text-sm">
              <span className="font-medium text-gray-700">How paid</span>
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value === 'eft' ? 'eft' : 'check')}
                className="mt-1 min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:min-h-0"
              >
                <option value="check">Check</option>
                <option value="eft">EFT</option>
              </select>
            </label>
          )}
          {fuel ? null : (
            <div className="sm:col-span-2">
              <RefField
                label={refLabel}
                value={bankRef}
                fuel={false}
                paymentMethod={paymentMethod}
                onChange={setBankRef}
              />
            </div>
          )}

        {error ? <p className="text-sm text-red-700 sm:col-span-2">{error}</p> : null}

        <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
          <button
            type="button"
            disabled={paying}
            onClick={onClose}
            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {paying ? 'Paying…' : `Pay ${money(total)}`}
          </button>
        </div>
        </form>
      </div>
    </div>
  )
}
