'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import BankSelect from '../BankSelect'
import { useAuth } from '@/app/components/AuthContext'

interface StaffRole {
  id: string
  name: string
  badgeColor?: string | null
  sortOrder: number
}

function initialsFor(firstName: string, lastName: string, fallback: string) {
  const a = firstName.trim().charAt(0)
  const b = lastName.trim().charAt(0)
  const initials = `${a}${b}`.toUpperCase()
  if (initials.trim()) return initials
  return fallback.trim().charAt(0).toUpperCase() || '?'
}

export default function NewStaffPage() {
  const router = useRouter()
  const { canViewStaffSensitive } = useAuth()
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    startDate: '',
    status: 'active',
    roleId: '',
    nicNumber: '',
    address: '',
    bankName: '',
    accountNumber: '',
    mobileNumber: '',
    notes: '',
    punchExempt: false
  })
  const [roles, setRoles] = useState<StaffRole[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingRoles, setLoadingRoles] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const displayName =
    [formData.firstName, formData.lastName].filter(Boolean).join(' ').trim() || 'New staff member'
  const selectedRole = useMemo(
    () => roles.find((r) => r.id === formData.roleId) ?? null,
    [roles, formData.roleId]
  )
  const statusActive = formData.status === 'active'

  const inputClass =
    'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  useEffect(() => {
    fetch('/api/staff-roles')
      .then((res) => res.json())
      .then((data: StaffRole[]) => {
        setRoles(data)
        if (data.length > 0) {
          const defaultRole = data.find((r) => r.name.toLowerCase() === 'cashier') || data[0]
          setFormData((prev) => ({ ...prev, roleId: defaultRole.id }))
        }
        setLoadingRoles(false)
      })
      .catch((err) => {
        console.error('Error fetching roles:', err)
        setLoadingRoles(false)
      })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          dateOfBirth: formData.dateOfBirth || null,
          startDate: formData.startDate || null,
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          ...(canViewStaffSensitive
            ? {}
            : { nicNumber: undefined, bankName: undefined, accountNumber: undefined })
        })
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        const detail =
          typeof errorData.details === 'string' && errorData.details.trim() !== ''
            ? ` ${errorData.details}`
            : ''
        throw new Error((errorData.error || 'Failed to create staff') + detail)
      }

      const created = await res.json().catch(() => null)
      if (created?.id) {
        router.push(`/staff/${created.id}`)
      } else {
        router.push('/staff')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create staff')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-4 sm:pt-6 pb-4">
          <nav className="mb-4 text-sm text-gray-500" aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link href="/staff" className="text-blue-600 hover:text-blue-800">
                  Staff
                </Link>
              </li>
              <li aria-hidden="true">›</li>
              <li className="text-gray-700 font-medium">Add staff member</li>
            </ol>
          </nav>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4 min-w-0">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-100 text-base font-semibold text-slate-700"
                  aria-hidden
                >
                  {initialsFor(formData.firstName, formData.lastName, displayName)}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold text-gray-900 truncate">{displayName}</h1>
                    <span
                      className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                        statusActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {statusActive ? 'Active' : 'Inactive'}
                    </span>
                    {formData.punchExempt && (
                      <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-700">
                        Punch exempt
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                    {selectedRole && (
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                        style={{ backgroundColor: selectedRole.badgeColor || '#64748b' }}
                      >
                        {selectedRole.name}
                      </span>
                    )}
                    {formData.startDate && <span>Starts {formData.startDate}</span>}
                    <span>Device ID assigned on save</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push('/staff')}
                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded font-medium hover:bg-gray-50 shrink-0"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-4 sm:py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <p className="text-sm text-gray-600">
            A clock device ID (1–999) is assigned automatically when you save. Inactive staff still keep
            their numbers; deleting a staff member frees their number for reuse.
          </p>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded text-red-800">{error}</div>
          )}

          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5">Personal & role</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className={inputClass}
                  placeholder="First name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className={inputClass}
                  placeholder="Last name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date of birth</label>
                <input
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                  className={inputClass}
                />
              </div>
              {canViewStaffSensitive && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">NIC number</label>
                  <input
                    type="text"
                    value={formData.nicNumber}
                    onChange={(e) => setFormData({ ...formData, nicNumber: e.target.value })}
                    className={inputClass}
                    placeholder="National ID / NIC"
                  />
                </div>
              )}
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className={inputClass}
                  placeholder="Home address"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mobile (WhatsApp)</label>
                <input
                  type="tel"
                  value={formData.mobileNumber}
                  onChange={(e) => setFormData({ ...formData, mobileNumber: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. +1 242 555 1234"
                />
                <p className="text-xs text-gray-500 mt-0.5">
                  Used for roster WhatsApp links. Include country code.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role <span className="text-red-500">*</span>
                </label>
                {loadingRoles ? (
                  <div className={`${inputClass} bg-gray-50 text-gray-500`}>Loading roles...</div>
                ) : (
                  <select
                    required
                    value={formData.roleId}
                    onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
                    className={inputClass}
                  >
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className={inputClass}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className={inputClass}
                  placeholder="Additional notes about this staff member"
                />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5">Attendance</h2>
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.punchExempt}
                  onChange={(e) => setFormData({ ...formData, punchExempt: e.target.checked })}
                  className="mt-1 rounded border-gray-300"
                />
                <span>
                  <span className="text-sm font-medium text-gray-900">Punch exemption (no clock)</span>
                  <span className="block text-xs text-gray-600 mt-0.5">
                    Exclude from pay period hours report. Present/absent treats them as present unless
                    marked absent for the day.
                  </span>
                </span>
              </label>
            </div>
          </section>

          {canViewStaffSensitive && (
            <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-5">Payroll</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bank</label>
                  <BankSelect
                    value={formData.bankName}
                    onChange={(bankName) => setFormData({ ...formData, bankName })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account number</label>
                  <input
                    type="text"
                    value={formData.accountNumber}
                    onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                    className={inputClass}
                    placeholder="Bank account number"
                  />
                </div>
              </div>
            </section>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push('/staff')}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded font-semibold hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? 'Creating...' : 'Create staff member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
