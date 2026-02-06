'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatAmount } from '@/lib/fuelPayments'

interface Balance {
  id: string
  currentBalance: number
  availableFunds: number
  planned: number
  balanceAfter: number
}

export default function BalancePage() {
  const router = useRouter()
  const [balance, setBalance] = useState<Balance | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    currentBalance: '',
    availableFunds: ''
  })

  useEffect(() => {
    fetchBalance()
  }, [])

  const fetchBalance = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/fuel-payments/balance')
      if (res.ok) {
        const data = await res.json()
        setBalance(data)
        setFormData({
          currentBalance: data.currentBalance.toString(),
          availableFunds: data.availableFunds.toString()
        })
      } else {
        console.error('Failed to fetch balance')
      }
    } catch (error) {
      console.error('Error fetching balance:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/fuel-payments/balance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentBalance: parseFloat(formData.currentBalance) || 0,
          availableFunds: parseFloat(formData.availableFunds) || 0
        })
      })

      if (res.ok) {
        const data = await res.json()
        setBalance(data)
        alert('Balance updated successfully!')
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to update balance')
        setSaving(false)
      }
    } catch (error) {
      console.error('Error updating balance:', error)
      alert('Failed to update balance')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading balance...</p>
      </div>
    )
  }

  if (!balance) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Balance</h1>
            <p className="text-sm text-gray-600 mt-1">
              View and update current balance and available funds
            </p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => router.push('/fuel-payments')}
              className="px-4 py-2 bg-gray-500 text-white rounded font-semibold hover:bg-gray-600"
            >
              ← Back
            </button>
          </div>
        </div>

        {/* Balance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Current Balance
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.currentBalance}
              onChange={(e) => setFormData({ ...formData, currentBalance: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-semibold"
            />
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Available Funds
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.availableFunds}
              onChange={(e) => setFormData({ ...formData, availableFunds: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-semibold"
            />
          </div>
        </div>

        {/* Calculated Values */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Calculated Values</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600 mb-1">Planned</p>
              <p className="text-2xl font-bold text-blue-600">
                {formatAmount(balance.planned)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                (From active simulation)
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Balance After</p>
              <p className={`text-2xl font-bold ${
                balance.balanceAfter >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {formatAmount(balance.balanceAfter)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                (Available - Planned)
              </p>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="bg-white rounded-lg shadow p-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Balance'}
          </button>
        </div>
      </div>
    </div>
  )
}

