'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { APP_ROLES } from '@/lib/roles'
import { useAuth } from '@/app/components/AuthContext'

interface AppUserRow {
  id: string
  username: string
  email: string
  firstName: string | null
  lastName: string | null
  role: string
  isSuperAdmin: boolean
  createdAt: string
  updatedAt: string
}

export default function SettingsUsersPage() {
  const { canManageUsers } = useAuth()
  const [users, setUsers] = useState<AppUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    username: '',
    email: '',
    firstName: '',
    lastName: '',
    password: '',
    role: 'supervisor' as string
  })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    role: '',
    password: ''
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/users', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load users')
      setUsers(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (canManageUsers) void load()
  }, [canManageUsers, load])

  if (!canManageUsers) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <p className="text-gray-700">You do not have access to user accounts.</p>
        <Link href="/settings" className="text-blue-600 mt-4 inline-block">
          ← Settings
        </Link>
      </div>
    )
  }

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Create failed')
      setForm({ username: '', email: '', firstName: '', lastName: '', password: '', role: 'supervisor' })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  const saveEdit = async (id: string) => {
    setError(null)
    try {
      const body: Record<string, string> = {
        email: editForm.email,
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        role: editForm.role
      }
      if (editForm.password.trim()) body.password = editForm.password
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Save failed')
      setEditingId(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const remove = async (u: AppUserRow) => {
    if (u.isSuperAdmin) return
    if (!window.confirm(`Delete user ${u.username}?`)) return
    setError(null)
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(typeof data.error === 'string' ? data.error : 'Delete failed')
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link href="/settings" className="text-sm text-blue-600 hover:underline">
            ← Settings
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">User accounts</h1>
          <p className="text-sm text-gray-600 mt-1">Create and manage logins. Super admin cannot be edited or deleted.</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Add user</h2>
          <form onSubmit={createUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
              <input
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
              <input
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                required
                minLength={8}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {APP_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create user'}
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <h2 className="text-lg font-semibold text-gray-900 p-4 border-b border-gray-100">Users</h2>
          {loading ? (
            <p className="p-4 text-gray-500">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2">Name</th>
                    <th className="text-left px-4 py-2">Username</th>
                    <th className="text-left px-4 py-2">Email</th>
                    <th className="text-left px-4 py-2">Role</th>
                    <th className="text-right px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-gray-100">
                      <td className="px-4 py-2 text-gray-800">
                        {[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td className="px-4 py-2 font-medium">
                        {u.username}
                        {u.isSuperAdmin && (
                          <span className="ml-2 text-xs bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">Super admin</span>
                        )}
                      </td>
                      <td className="px-4 py-2">{u.email}</td>
                      <td className="px-4 py-2 capitalize">{u.role.replace('_', ' ')}</td>
                      <td className="px-4 py-2 text-right">
                        {u.isSuperAdmin ? (
                          <span className="text-gray-400 text-xs">—</span>
                        ) : editingId === u.id ? (
                          <div className="flex flex-col gap-2 items-end">
                            <input
                              placeholder="First name"
                              value={editForm.firstName}
                              onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))}
                              className="border rounded px-2 py-1 text-xs w-48"
                            />
                            <input
                              placeholder="Last name"
                              value={editForm.lastName}
                              onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))}
                              className="border rounded px-2 py-1 text-xs w-48"
                            />
                            <input
                              type="email"
                              value={editForm.email}
                              onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                              className="border rounded px-2 py-1 text-xs w-48"
                            />
                            <select
                              value={editForm.role}
                              onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                              className="border rounded px-2 py-1 text-xs"
                            >
                              {APP_ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                            <input
                              type="password"
                              placeholder="New password (optional)"
                              value={editForm.password}
                              onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                              className="border rounded px-2 py-1 text-xs w-48"
                            />
                            <div className="flex gap-2">
                              <button type="button" className="text-blue-600 text-xs" onClick={() => void saveEdit(u.id)}>
                                Save
                              </button>
                              <button type="button" className="text-gray-600 text-xs" onClick={() => setEditingId(null)}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-x-2">
                            <button
                              type="button"
                              className="text-blue-600 hover:underline"
                              onClick={() => {
                                setEditingId(u.id)
                                setEditForm({
                                  email: u.email,
                                  firstName: u.firstName ?? '',
                                  lastName: u.lastName ?? '',
                                  role: u.role,
                                  password: ''
                                })
                              }}
                            >
                              Edit
                            </button>
                            <button type="button" className="text-red-600 hover:underline" onClick={() => void remove(u)}>
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
