'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { formatAmount } from '@/lib/fuelPayments'
import {
  calculateAmountVatFromTotal,
  DEFAULT_VAT_RATE,
  sumAmountVatStrings,
  vendorInvoiceTotal
} from '@/lib/vendorVat'

interface VendorInvoiceAmountFieldsProps {
  isVatRegistered: boolean
  vatRate?: number
  amount: string
  vat: string
  onAmountChange: (value: string) => void
  onVatChange: (value: string) => void
  /** When true, render the VAT calculator beside the modal title (parent provides header row). */
  showCalculatorInHeader?: boolean
  calculatorSlot?: (calculator: ReactNode) => ReactNode
}

function VatCalculatorControls({
  totalInput,
  onTotalInputChange,
  onCalculate,
  vatRate
}: {
  totalInput: string
  onTotalInputChange: (value: string) => void
  onCalculate: () => void
  vatRate: number
}) {
  const ratePct = (vatRate > 0 ? vatRate : DEFAULT_VAT_RATE) * 100

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[8rem]">
        <label className="mb-1 block text-xs font-medium text-gray-600">Total (incl. VAT)</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={totalInput}
          onChange={(e) => onTotalInputChange(e.target.value)}
          placeholder="0.00"
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <button
        type="button"
        onClick={onCalculate}
        className="rounded bg-gray-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gray-900"
      >
        Calculate
      </button>
      <span className="pb-1.5 text-xs text-gray-500">@ {ratePct}% VAT</span>
    </div>
  )
}

export function VendorInvoiceAmountFields({
  isVatRegistered,
  vatRate = DEFAULT_VAT_RATE,
  amount,
  vat,
  onAmountChange,
  onVatChange,
  showCalculatorInHeader = false,
  calculatorSlot
}: VendorInvoiceAmountFieldsProps) {
  const [totalInput, setTotalInput] = useState('')

  useEffect(() => {
    if (!isVatRegistered) return
    const synced = sumAmountVatStrings(amount, vat)
    if (synced) setTotalInput(synced)
  }, [amount, vat, isVatRegistered])

  const handleCalculate = () => {
    const total = parseFloat(totalInput)
    if (Number.isNaN(total) || total <= 0) {
      alert('Please enter a valid total')
      return
    }
    const { amount: amt, vat: vatVal } = calculateAmountVatFromTotal(total, vatRate)
    onAmountChange(String(amt))
    onVatChange(String(vatVal))
    setTotalInput(total.toFixed(2))
  }

  const calculator = isVatRegistered ? (
    <VatCalculatorControls
      totalInput={totalInput}
      onTotalInputChange={setTotalInput}
      onCalculate={handleCalculate}
      vatRate={vatRate}
    />
  ) : null

  const amountNum = parseFloat(amount)
  const vatNum = parseFloat(vat)
  const previewTotal =
    !Number.isNaN(amountNum) && isVatRegistered
      ? vendorInvoiceTotal(amountNum, Number.isNaN(vatNum) ? 0 : vatNum)
      : null

  if (!isVatRegistered) {
    return (
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Amount <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          required
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    )
  }

  if (showCalculatorInHeader && calculatorSlot && calculator) {
    return (
      <>
        {calculatorSlot(calculator)}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Amount <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              required
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">VAT / prepaid tax</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={vat}
              onChange={(e) => onVatChange(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        {previewTotal != null && (
          <p className="text-sm text-gray-600">
            Total payable:{' '}
            <span className="font-semibold text-gray-900">{formatAmount(previewTotal)}</span>
          </p>
        )}
      </>
    )
  }

  return (
    <div className="space-y-3">
      {calculator && !showCalculatorInHeader && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3">{calculator}</div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Amount <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            required
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">VAT / prepaid tax</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={vat}
            onChange={(e) => onVatChange(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      {previewTotal != null && (
        <p className="text-sm text-gray-600">
          Total payable:{' '}
          <span className="font-semibold text-gray-900">{formatAmount(previewTotal)}</span>
        </p>
      )}
    </div>
  )
}

/** Standalone calculator for modal header layout. */
export function VendorInvoiceVatCalculatorHeader({
  isVatRegistered,
  vatRate = DEFAULT_VAT_RATE,
  amount,
  vat,
  onAmountChange,
  onVatChange
}: Omit<VendorInvoiceAmountFieldsProps, 'showCalculatorInHeader' | 'calculatorSlot'>) {
  const [totalInput, setTotalInput] = useState('')

  useEffect(() => {
    if (!isVatRegistered) return
    const synced = sumAmountVatStrings(amount, vat)
    if (synced) setTotalInput(synced)
  }, [amount, vat, isVatRegistered])

  if (!isVatRegistered) return null

  const handleCalculate = () => {
    const total = parseFloat(totalInput)
    if (Number.isNaN(total) || total <= 0) {
      alert('Please enter a valid total')
      return
    }
    const { amount: amt, vat: vatVal } = calculateAmountVatFromTotal(total, vatRate)
    onAmountChange(String(amt))
    onVatChange(String(vatVal))
    setTotalInput(total.toFixed(2))
  }

  return (
    <VatCalculatorControls
      totalInput={totalInput}
      onTotalInputChange={setTotalInput}
      onCalculate={handleCalculate}
      vatRate={vatRate}
    />
  )
}
