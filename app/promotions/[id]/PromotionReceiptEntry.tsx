'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatReceiptAmount } from '@/lib/promotion-receipts'

type DriverProfile = {
  key: string
  name: string
  staffId: string | null
  receiptCount: number
  lastBus: string
  lastPhone: string
  lastReceiptDate: string | null
}

type ReceiptRow = {
  id: string
  receiptDate: string
  entrantName: string
  staffId: string | null
  amount: number
  busRegistration: string
  phone: string
  createdAt: string
}

const fieldClass =
  'min-h-[44px] w-full rounded-md border border-slate-300 px-3 py-2 text-base sm:min-h-0 sm:text-sm'
const btnPrimary =
  'min-h-[44px] w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50 sm:w-auto sm:min-h-0'
const btnSecondary =
  'min-h-[44px] w-full rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50 sm:w-auto sm:min-h-0'

function formatShortDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return ymd
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

type Props = {
  promotionId: string
  onError: (message: string | null) => void
}

export default function PromotionReceiptEntry({ promotionId, onError }: Props) {
  const [receiptDate, setReceiptDate] = useState('')
  const [entrantName, setEntrantName] = useState('')
  const [staffId, setStaffId] = useState('')
  const [amount, setAmount] = useState('')
  const [busRegistration, setBusRegistration] = useState('')
  const [phone, setPhone] = useState('')
  const [showOptional, setShowOptional] = useState(false)

  const [drivers, setDrivers] = useState<DriverProfile[]>([])
  const [recentNames, setRecentNames] = useState<string[]>([])
  const [recentReceipts, setRecentReceipts] = useState<ReceiptRow[]>([])
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [nameOpen, setNameOpen] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)

  const amountRef = useRef<HTMLInputElement | null>(null)

  const loadDrivers = useCallback(() => {
    fetch(`/api/promotions/${promotionId}/receipts/drivers`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load drivers')
        setDrivers(Array.isArray(data.drivers) ? data.drivers : [])
        setRecentNames(Array.isArray(data.recentNames) ? data.recentNames : [])
      })
      .catch((err) => onError(err instanceof Error ? err.message : 'Failed to load drivers'))
  }, [promotionId, onError])

  const loadRecentReceipts = useCallback(() => {
    const params = new URLSearchParams({ limit: '25' })
    if (receiptDate) params.set('date', receiptDate)
    fetch(`/api/promotions/${promotionId}/receipts?${params}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load receipts')
        setRecentReceipts(Array.isArray(data) ? data : [])
      })
      .catch((err) => onError(err instanceof Error ? err.message : 'Failed to load receipts'))
  }, [promotionId, receiptDate, onError])

  useEffect(() => {
    loadDrivers()
  }, [loadDrivers])

  useEffect(() => {
    loadRecentReceipts()
  }, [loadRecentReceipts])

  const nameSuggestions = useMemo(() => {
    const q = entrantName.trim().toLowerCase()
    if (!q) return drivers.slice(0, 8)
    return drivers.filter((d) => d.name.toLowerCase().includes(q)).slice(0, 8)
  }, [drivers, entrantName])

  const applyDriver = (driver: DriverProfile) => {
    setEntrantName(driver.name)
    setStaffId(driver.staffId ?? '')
    setBusRegistration(driver.lastBus)
    setPhone(driver.lastPhone)
    if (driver.lastBus || driver.lastPhone) setShowOptional(true)
    setNameOpen(false)
    setTimeout(() => amountRef.current?.focus(), 0)
  }

  const pickRecentName = (name: string) => {
    const driver = drivers.find((d) => d.name.toLowerCase() === name.toLowerCase())
    if (driver) applyDriver(driver)
    else {
      setEntrantName(name)
      setStaffId('')
      setNameOpen(false)
      setTimeout(() => amountRef.current?.focus(), 0)
    }
  }

  const clearForm = () => {
    setEntrantName('')
    setStaffId('')
    setAmount('')
    setBusRegistration('')
    setPhone('')
    setSuccess(null)
    setEditingId(null)
  }

  const startEdit = (receipt: ReceiptRow) => {
    setEditingId(receipt.id)
    setReceiptDate(receipt.receiptDate)
    setEntrantName(receipt.entrantName)
    setStaffId(receipt.staffId ?? '')
    setAmount(String(receipt.amount))
    setBusRegistration(receipt.busRegistration)
    setPhone(receipt.phone)
    if (receipt.busRegistration || receipt.phone) setShowOptional(true)
    setSuccess(null)
    onError(null)
  }

  const cancelEdit = () => {
    clearForm()
  }

  const saveReceipt = async (sameDriver: boolean) => {
    if (!receiptDate) {
      onError('Receipt date is required')
      return
    }
    if (!entrantName.trim()) {
      onError('Driver name is required')
      return
    }
    if (!amount.trim()) {
      onError('Amount is required')
      return
    }

    setSaving(true)
    onError(null)
    setSuccess(null)
    try {
      const isEdit = !!editingId
      const url = isEdit
        ? `/api/promotions/${promotionId}/receipts/${editingId}`
        : `/api/promotions/${promotionId}/receipts`
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptDate,
          entrantName: entrantName.trim(),
          staffId: staffId || undefined,
          amount,
          busRegistration,
          phone
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save receipt')

      if (isEdit) {
        setSuccess(`Updated receipt for ${data.entrantName}.`)
        clearForm()
      } else {
        setSuccess(
          `Saved. ${data.entrantName} now has ${data.driverReceiptCount} receipt${
            data.driverReceiptCount === 1 ? '' : 's'
          } in this promotion.`
        )
        if (sameDriver) {
          setAmount('')
        } else {
          clearForm()
        }
      }

      loadDrivers()
      loadRecentReceipts()
      if (!isEdit && sameDriver) amountRef.current?.focus()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save receipt')
    } finally {
      setSaving(false)
    }
  }

  const removeReceipt = async (receiptId: string) => {
    try {
      const res = await fetch(`/api/promotions/${promotionId}/receipts/${receiptId}`, {
        method: 'DELETE'
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to remove receipt')
      loadDrivers()
      loadRecentReceipts()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to remove receipt')
    }
  }

  const addAgain = (receipt: ReceiptRow) => {
    setReceiptDate(receipt.receiptDate)
    setEntrantName(receipt.entrantName)
    setStaffId(receipt.staffId ?? '')
    setBusRegistration(receipt.busRegistration)
    setPhone(receipt.phone)
    setAmount('')
    if (receipt.busRegistration || receipt.phone) setShowOptional(true)
    setSuccess(null)
    setTimeout(() => amountRef.current?.focus(), 0)
  }

  const dateSummary = useMemo(() => {
    if (!receiptDate) return null
    const forDate = recentReceipts.filter((r) => r.receiptDate === receiptDate)
    if (forDate.length === 0) return null
    const total = forDate.reduce((sum, r) => sum + r.amount, 0)
    const unique = new Set(forDate.map((r) => r.entrantName.toLowerCase())).size
    return {
      count: forDate.length,
      total,
      drivers: unique
    }
  }, [recentReceipts, receiptDate])

  return (
    <section className="space-y-4">
      {recentNames.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Recent drivers
          </p>
          <div className="flex flex-wrap gap-2">
            {recentNames.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => pickRecentName(name)}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-blue-50 hover:border-blue-200"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`rounded-xl border ${editingId ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200 bg-white'} p-4 shadow-sm`}>
          <h2 className="text-sm font-semibold text-slate-800">
            {editingId ? 'Edit receipt' : 'New receipt'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {editingId
              ? 'Change the fields below and save.'
              : 'Set the receipt date first when entering your backlog. Pick a driver, then enter the amount.'}
          </p>

          <div className="mt-4 grid gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Receipt date</span>
              <input
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className={fieldClass}
                required
              />
            </label>

            <label className="relative block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Driver name</span>
              <input
                value={entrantName}
                onChange={(e) => {
                  setEntrantName(e.target.value)
                  setStaffId('')
                  setNameOpen(true)
                }}
                onFocus={() => setNameOpen(true)}
                onBlur={() => setTimeout(() => setNameOpen(false), 150)}
                className={fieldClass}
                placeholder="Start typing a name"
                autoComplete="off"
              />
              {nameOpen && nameSuggestions.length > 0 ? (
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                  {nameSuggestions.map((driver) => (
                    <li key={driver.key}>
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyDriver(driver)}
                      >
                        <span className="font-medium text-slate-900">{driver.name}</span>
                        {driver.receiptCount > 0 ? (
                          <span className="ml-2 text-xs text-slate-500">
                            {driver.receiptCount} receipt{driver.receiptCount === 1 ? '' : 's'}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Amount (TT$)</span>
              <input
                ref={amountRef}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={fieldClass}
                placeholder="0.00"
                inputMode="decimal"
              />
              <span className="mt-1 block text-xs text-slate-500">Amount of fuel taken that day</span>
            </label>

            <button
              type="button"
              onClick={() => setShowOptional((v) => !v)}
              className="text-left text-sm font-medium text-blue-700 hover:text-blue-900"
            >
              {showOptional ? 'Hide optional fields' : 'Bus / phone (optional)'}
            </button>

            {showOptional ? (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">
                    Bus / registration number
                  </span>
                  <input
                    value={busRegistration}
                    onChange={(e) => setBusRegistration(e.target.value)}
                    className={fieldClass}
                    placeholder="Optional"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Phone number</span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={fieldClass}
                    placeholder="Optional"
                  />
                </label>
              </>
            ) : null}
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {editingId ? (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveReceipt(false)}
                  className={btnPrimary}
                >
                  {saving ? 'Saving…' : 'Update receipt'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={cancelEdit}
                  className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 sm:w-auto sm:min-h-0"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveReceipt(false)}
                  className={btnPrimary}
                >
                  {saving ? 'Saving…' : 'Save receipt'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveReceipt(true)}
                  className={btnSecondary}
                >
                  Save &amp; same driver
                </button>
              </>
            )}
          </div>

          {success ? (
            <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {success}
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">
            {receiptDate ? `Receipts on ${formatShortDate(receiptDate)}` : 'Recent receipts'}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {receiptDate
              ? 'Showing receipts for the selected date.'
              : 'Pick a receipt date to filter this list.'}
          </p>

          {recentReceipts.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No receipts yet.</p>
          ) : (
            <ul className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto">
              {recentReceipts.map((receipt) => (
                <li
                  key={receipt.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{receipt.entrantName}</p>
                    <p className="text-xs text-slate-600">
                      {formatShortDate(receipt.receiptDate)}
                      {' · '}
                      {receipt.busRegistration || 'no bus'}
                      {' · '}
                      <span className="font-medium">${formatReceiptAmount(receipt.amount)}</span>
                    </p>
                    <p className="text-xs text-slate-400">{formatTime(receipt.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(receipt)}
                      className="text-xs font-medium text-amber-700 hover:text-amber-900"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => addAgain(receipt)}
                      className="text-xs font-medium text-blue-700 hover:text-blue-900"
                    >
                      Add again
                    </button>
                    <button
                      type="button"
                      onClick={() => removeReceipt(receipt.id)}
                      className="text-xs font-medium text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {dateSummary ? (
            <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">
              {formatShortDate(receiptDate)}: {dateSummary.count} receipt
              {dateSummary.count === 1 ? '' : 's'} · ${formatReceiptAmount(dateSummary.total)} ·{' '}
              {dateSummary.drivers} driver{dateSummary.drivers === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
