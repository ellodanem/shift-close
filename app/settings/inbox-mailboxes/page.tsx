'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

type Mailbox = {
  id: string
  key: string
  label: string
  emailAddress: string
  imapHost: string
  imapPort: number
  imapSecure: boolean
  imapUser: string
  authMethod: string
  hasPassword: boolean
  hasOAuth: boolean
  requiresMicrosoftSignIn: boolean
  enabled: boolean
  sortOrder: number
  lastSyncAt: string | null
  lastSyncError: string | null
  lastSyncCount: number
}

type MsDevice = {
  mailboxId: string
  deviceCode: string
  userCode: string
  verificationUri: string
  message: string
  interval: number
}

const emptyForm = {
  id: '',
  key: '',
  label: '',
  emailAddress: '',
  imapHost: 'imap.gmail.com',
  imapPort: 993,
  imapSecure: true,
  imapUser: '',
  imapPass: '',
  enabled: true,
  sortOrder: 0
}

export default function InboxMailboxesSettingsPage() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [microsoftConfigured, setMicrosoftConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState(false)
  const [msDevice, setMsDevice] = useState<MsDevice | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/inbox/mailboxes')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setMailboxes(data.mailboxes || [])
      setMicrosoftConfigured(Boolean(data.microsoftConfigured))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current)
    }
  }, [load])

  const startEdit = (m: Mailbox) => {
    setEditing(true)
    setForm({
      id: m.id,
      key: m.key,
      label: m.label,
      emailAddress: m.emailAddress,
      imapHost: m.requiresMicrosoftSignIn ? 'outlook.office365.com' : m.imapHost,
      imapPort: m.imapPort,
      imapSecure: m.imapSecure,
      imapUser: m.imapUser,
      imapPass: m.hasPassword ? '********' : '',
      enabled: m.enabled,
      sortOrder: m.sortOrder
    })
    setSuccess(null)
    setError(null)
    setMsDevice(null)
  }

  const editingMailbox = mailboxes.find((m) => m.id === form.id)
  const editingNeedsMs = Boolean(editingMailbox?.requiresMicrosoftSignIn)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/inbox/mailboxes', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          form.id
            ? {
                id: form.id,
                label: form.label,
                emailAddress: form.emailAddress,
                imapHost: form.imapHost,
                imapPort: form.imapPort,
                imapSecure: form.imapSecure,
                imapUser: form.imapUser,
                imapPass: form.imapPass,
                enabled: form.enabled,
                sortOrder: form.sortOrder
              }
            : {
                action: 'upsert',
                key: form.key,
                label: form.label,
                emailAddress: form.emailAddress,
                imapHost: form.imapHost,
                imapPort: form.imapPort,
                imapSecure: form.imapSecure,
                imapUser: form.imapUser,
                imapPass: form.imapPass,
                enabled: form.enabled,
                sortOrder: form.sortOrder
              }
        )
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setSuccess('Mailbox saved.')
      setEditing(false)
      setForm(emptyForm)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/inbox/mailboxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          id: form.id || undefined,
          imapHost: form.imapHost,
          imapPort: form.imapPort,
          imapSecure: form.imapSecure,
          imapUser: form.imapUser,
          imapPass: form.imapPass
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Test failed')
      setSuccess(`Connected — ${data.folders} folders visible.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed')
    } finally {
      setSaving(false)
    }
  }

  const pollMicrosoft = useCallback(
    async (device: MsDevice) => {
      try {
        const res = await fetch('/api/inbox/mailboxes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'microsoftPoll',
            id: device.mailboxId,
            deviceCode: device.deviceCode
          })
        })
        const data = await res.json()
        if (data.status === 'pending' || data.status === 'slow_down') {
          const wait = (data.status === 'slow_down' ? device.interval + 5 : device.interval) * 1000
          pollRef.current = setTimeout(() => void pollMicrosoft(device), wait)
          return
        }
        if (!res.ok || data.status === 'error') {
          setMsDevice(null)
          setError(data.error || 'Microsoft sign-in failed')
          return
        }
        setMsDevice(null)
        setSuccess(
          data.test?.ok
            ? 'Microsoft sign-in complete — IMAP connected.'
            : `Microsoft sign-in saved.${data.test?.error ? ` Test: ${data.test.error}` : ''}`
        )
        await load()
      } catch (err) {
        setMsDevice(null)
        setError(err instanceof Error ? err.message : 'Microsoft sign-in failed')
      }
    },
    [load]
  )

  const startMicrosoftSignIn = async (mailboxId: string) => {
    setError(null)
    setSuccess(null)
    setSaving(true)
    try {
      const res = await fetch('/api/inbox/mailboxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'microsoftStart', id: mailboxId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not start Microsoft sign-in')
      const device: MsDevice = {
        mailboxId,
        deviceCode: data.deviceCode,
        userCode: data.userCode,
        verificationUri: data.verificationUri,
        message: data.message,
        interval: Number(data.interval || 5)
      }
      setMsDevice(device)
      pollRef.current = setTimeout(() => void pollMicrosoft(device), device.interval * 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start Microsoft sign-in')
    } finally {
      setSaving(false)
    }
  }

  const syncAll = async () => {
    setSyncing(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/inbox/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      const errLine =
        Array.isArray(data.errors) && data.errors.length ? ` Issues: ${data.errors.join('; ')}` : ''
      setSuccess(`Synced — imported ${data.imported} new message(s).${errLine}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const toggleEnabled = async (m: Mailbox) => {
    if (!m.enabled) {
      if (m.requiresMicrosoftSignIn && !m.hasOAuth) {
        setError('Sign in with Microsoft before enabling the O/S mailbox.')
        startEdit(m)
        return
      }
      if (!m.requiresMicrosoftSignIn && !m.hasPassword) {
        setError('Set an IMAP app password before enabling this mailbox.')
        startEdit(m)
        return
      }
    }
    setError(null)
    const res = await fetch('/api/inbox/mailboxes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: m.id, enabled: !m.enabled })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setError(data.error || 'Could not update')
    await load()
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
        <p className="text-gray-600">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 sm:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Inbox mailboxes</h1>
            <p className="mt-1 text-sm text-gray-500">
              Gmail uses an App Password. Outlook.com uses Microsoft Modern Auth (OAuth2) — passwords are disabled.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/inbox"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Open Inbox
            </Link>
            <button
              type="button"
              onClick={() => void syncAll()}
              disabled={syncing}
              className="rounded-md bg-violet-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-60"
            >
              {syncing ? 'Syncing…' : 'Sync all enabled'}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}
        {success ? (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {success}
          </div>
        ) : null}

        {msDevice ? (
          <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
            <p className="font-semibold">Complete Microsoft sign-in</p>
            <p className="mt-1">{msDevice.message}</p>
            <p className="mt-3 text-lg font-bold tracking-wider">{msDevice.userCode}</p>
            <a
              href={msDevice.verificationUri}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block font-medium text-violet-800 underline"
            >
              {msDevice.verificationUri}
            </a>
            <p className="mt-2 text-xs text-violet-800">Waiting for you to approve… this page will update automatically.</p>
          </div>
        ) : null}

        {!microsoftConfigured ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Set <code className="rounded bg-white px-1">MICROSOFT_IMAP_CLIENT_ID</code> in Vercel env to enable
            Outlook OAuth (Azure App Registration → personal Microsoft accounts → Allow public client flows = Yes).
          </div>
        ) : null}

        <div className="mb-6 space-y-3">
          {mailboxes.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-gray-900">{m.label}</h2>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      m.enabled ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {m.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  {m.requiresMicrosoftSignIn ? (
                    m.hasOAuth ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                        Microsoft signed in
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                        Needs Microsoft sign-in
                      </span>
                    )
                  ) : !m.hasPassword ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Needs password
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-sm text-gray-600">{m.emailAddress}</p>
                <p className="mt-1 text-xs text-gray-400">
                  {m.imapHost}:{m.imapPort}
                  {m.requiresMicrosoftSignIn ? ' · OAuth2' : ' · App password'}
                  {m.lastSyncAt
                    ? ` · Last sync ${new Date(m.lastSyncAt).toLocaleString()} (${m.lastSyncCount} new)`
                    : ' · Never synced'}
                </p>
                {m.lastSyncError ? <p className="mt-1 text-xs text-red-600">{m.lastSyncError}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {m.requiresMicrosoftSignIn ? (
                  <button
                    type="button"
                    onClick={() => void startMicrosoftSignIn(m.id)}
                    disabled={saving || !microsoftConfigured}
                    className="rounded-md bg-sky-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-800 disabled:opacity-50"
                  >
                    Sign in with Microsoft
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void toggleEnabled(m)}
                  className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  {m.enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(m)}
                  className="rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-800 hover:bg-violet-100"
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            {editing ? (form.id ? `Edit ${form.label || form.key}` : 'New mailbox') : 'Edit a mailbox'}
          </h2>
          {!editing ? (
            <p className="text-sm text-gray-500">
              Gmail: Edit → paste App Password → Enable → Sync. Outlook (O/S): Sign in with Microsoft (no password).
            </p>
          ) : (
            <form onSubmit={save} className="space-y-3">
              {editingNeedsMs ? (
                <div className="rounded-md border border-sky-100 bg-sky-50 px-3 py-2 text-sm text-sky-950">
                  Outlook.com IMAP:{' '}
                  <span className="font-medium">outlook.office365.com:993 SSL/TLS + OAuth2</span> (Microsoft
                  Support). Password login is disabled — use Sign in with Microsoft on the card above.
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-gray-600">Label</span>
                  <input
                    className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5"
                    value={form.label}
                    onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                    required
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-600">Email address</span>
                  <input
                    type="email"
                    className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5"
                    value={form.emailAddress}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        emailAddress: e.target.value,
                        imapUser: f.imapUser || e.target.value
                      }))
                    }
                    required
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-600">IMAP host</span>
                  <input
                    className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5"
                    value={form.imapHost}
                    onChange={(e) => setForm((f) => ({ ...f, imapHost: e.target.value }))}
                    required
                    readOnly={editingNeedsMs}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-600">IMAP user</span>
                  <input
                    className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5"
                    value={form.imapUser}
                    onChange={(e) => setForm((f) => ({ ...f, imapUser: e.target.value }))}
                    required
                  />
                </label>
                {!editingNeedsMs ? (
                  <label className="block text-sm sm:col-span-2">
                    <span className="text-gray-600">IMAP app password</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5"
                      value={form.imapPass}
                      onChange={(e) => setForm((f) => ({ ...f, imapPass: e.target.value }))}
                      placeholder={form.id ? 'Leave ******** to keep current' : 'Required'}
                    />
                  </label>
                ) : null}
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                />
                Enabled for sync
              </label>
              <div className="flex flex-wrap gap-2 pt-1">
                {editingNeedsMs && form.id ? (
                  <button
                    type="button"
                    onClick={() => void startMicrosoftSignIn(form.id)}
                    disabled={saving || !microsoftConfigured}
                    className="rounded-md bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
                  >
                    Sign in with Microsoft
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void testConnection()}
                    disabled={saving}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Test connection
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-violet-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false)
                    setForm(emptyForm)
                    setMsDevice(null)
                  }}
                  className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="mt-6 space-y-4 rounded-lg border border-amber-100 bg-amber-50/60 p-4 text-sm text-amber-950">
          <div>
            <p className="font-semibold">Gmail (Station / Management)</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Turn on 2-Step Verification.</li>
              <li>
                Create an App Password at{' '}
                <a className="underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">
                  myaccount.google.com/apppasswords
                </a>
                .
              </li>
              <li>Paste it here, enable, Sync.</li>
            </ol>
          </div>
          <div>
            <p className="font-semibold">Outlook.com (O/S) — Microsoft Support settings</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>IMAP: <code className="rounded bg-white px-1">outlook.office365.com</code> port <code className="rounded bg-white px-1">993</code> SSL/TLS</li>
              <li>Auth: <strong>OAuth2 / Modern Auth</strong> (password login returns “Login is disabled”)</li>
              <li>
                Enable IMAP in Outlook.com: Settings → Mail → Forwarding and IMAP → turn IMAP on (
                <a
                  className="underline"
                  href="https://support.microsoft.com/en-us/office/pop-imap-and-smtp-settings-for-outlook-com-d088b986-291d-42b8-9564-9c414e2aa040"
                  target="_blank"
                  rel="noreferrer"
                >
                  Microsoft docs
                </a>
                )
              </li>
              <li>
                Azure: App registration → supported account types include personal Microsoft accounts → Authentication →
                Allow public client flows = Yes → copy Client ID into Vercel{' '}
                <code className="rounded bg-white px-1">MICROSOFT_IMAP_CLIENT_ID</code>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
