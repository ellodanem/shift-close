'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function ResetForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== password2) {
      setError('Passwords do not match')
      return
    }
    if (!token) {
      setError('Missing reset token')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Reset failed')
        return
      }
      setDone(true)
    } catch {
      setError('Reset failed')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <p className="text-green-800 font-medium mb-4">Password updated. You can sign in.</p>
        <Link href="/login" className="text-blue-600 hover:underline">
          Go to login
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {!token && <p className="text-sm text-amber-800">Invalid or missing link. Request a new reset from the login page.</p>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          minLength={8}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
        <input
          type="password"
          autoComplete="new-password"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          minLength={8}
          required
        />
      </div>
      <button
        type="submit"
        disabled={loading || !token}
        className="w-full py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Saving…' : 'Set password'}
      </button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-gray-200 p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-4">Reset password</h1>
        <Suspense fallback={<p className="text-sm text-gray-600">Loading…</p>}>
          <ResetForm />
        </Suspense>
        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-blue-600 hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  )
}
