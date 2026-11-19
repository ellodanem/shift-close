'use client'

import { useCallback, useEffect, useState } from 'react'
import { QuickBalanceEntryModal, type BalanceEntryForm } from '@/app/components/QuickBalanceEntryModal'

const EMPTY_FORM: BalanceEntryForm = {
  currentBalance: '',
  availableFunds: '',
  totalAutoCurrentBalance: '',
  totalAutoAvailable: ''
}

export function BalanceUpdateModalHost({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<BalanceEntryForm>(EMPTY_FORM)
  const [planned, setPlanned] = useState<number | undefined>()
  const [balanceAfter, setBalanceAfter] = useState<number | undefined>()

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setError(null)
    setLoading(true)
    void fetch('/api/fuel-payments/balance', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Could not load balances.')
        if (cancelled) return
        setForm({
          currentBalance: String(data.currentBalance ?? 0),
          availableFunds: String(data.availableFunds ?? 0),
          totalAutoCurrentBalance: String(data.totalAutoCurrentBalance ?? 0),
          totalAutoAvailable: String(data.totalAutoAvailable ?? 0)
        })
        setPlanned(typeof data.planned === 'number' ? data.planned : undefined)
        setBalanceAfter(typeof data.balanceAfter === 'number' ? data.balanceAfter : undefined)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load balances.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open])

  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/fuel-payments/balance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentBalance: Number(form.currentBalance) || 0,
          availableFunds: Number(form.availableFunds) || 0,
          totalAutoCurrentBalance: Number(form.totalAutoCurrentBalance) || 0,
          totalAutoAvailable: Number(form.totalAutoAvailable) || 0
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not update balances.')
      onClose()
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not update balances.')
    } finally {
      setSaving(false)
    }
  }, [form, onClose])

  return (
    <QuickBalanceEntryModal
      open={open}
      title="Balance Update"
      saving={saving}
      loading={loading}
      error={error}
      form={form}
      onFormChange={setForm}
      planned={planned}
      balanceAfter={balanceAfter}
      onClose={onClose}
      onSave={() => void save()}
    />
  )
}
