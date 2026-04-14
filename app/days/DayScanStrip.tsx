'use client'

import { useEffect, useRef, useState, type RefObject, type Ref } from 'react'
import {
  IconDebitCard,
  IconDepositSlip,
  IconMenu,
  IconShield
} from '@/app/components/IconDropdown'

function scanLabelFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname
    const last = path.split('/').filter(Boolean).pop()
    if (last) return decodeURIComponent(last)
  } catch {
    /* ignore */
  }
  const fallback = url.split('/').pop()
  return fallback ? decodeURIComponent(fallback.split('?')[0]) : 'Document'
}

type ScanKind = 'deposit' | 'debit' | 'security'

export default function DayScanStrip({
  date,
  depositScans,
  debitScans,
  securityScans,
  securityScanWaived,
  securityScanWaiverNote,
  onRefresh,
  onOpenPreview
}: {
  date: string
  depositScans: string[]
  debitScans: string[]
  securityScans: string[]
  securityScanWaived: boolean
  securityScanWaiverNote: string
  onRefresh: () => void
  onOpenPreview: (url: string, title: string) => void
}) {
  const [uploading, setUploading] = useState<ScanKind | null>(null)
  const [savingWaiver, setSavingWaiver] = useState(false)
  const [waiverNoteDraft, setWaiverNoteDraft] = useState(securityScanWaiverNote)

  useEffect(() => {
    setWaiverNoteDraft(securityScanWaiverNote)
  }, [securityScanWaiverNote, date])
  const depInput = useRef<HTMLInputElement>(null)
  const debInput = useRef<HTMLInputElement>(null)
  const secInput = useRef<HTMLInputElement>(null)

  const toOptions = (urls: string[], prefix: string) =>
    urls.map((url, i) => {
      const name = scanLabelFromUrl(url)
      const short = name.length > 48 ? `${name.slice(0, 46)}…` : name
      return {
        value: url,
        label: urls.length > 1 ? `${prefix} · file ${i + 1} · ${short}` : short
      }
    })

  const depositOpts = toOptions(depositScans, 'Deposit')
  const debitOpts = toOptions(debitScans, 'Debit / credit')
  const securityOpts = toOptions(securityScans, 'Security')

  const uploadFiles = async (files: FileList | null, type: ScanKind) => {
    if (!files?.length) return
    setUploading(type)
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('type', type)
        const res = await fetch(`/api/days/${date}/upload`, { method: 'POST', body: formData })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(typeof err.error === 'string' ? err.error : 'Upload failed')
        }
      }
      onRefresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(null)
      if (type === 'deposit' && depInput.current) depInput.current.value = ''
      if (type === 'debit' && debInput.current) debInput.current.value = ''
      if (type === 'security' && secInput.current) secInput.current.value = ''
    }
  }

  const deleteUrl = async (url: string, type: ScanKind) => {
    if (!window.confirm('Delete this file? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/days/${date}/upload`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, type })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(typeof err.error === 'string' ? err.error : 'Delete failed')
        return
      }
      onRefresh()
    } catch {
      alert('Delete failed')
    }
  }

  const saveSecurityWaiver = async (waived: boolean, note: string) => {
    setSavingWaiver(true)
    try {
      const res = await fetch(`/api/days/${encodeURIComponent(date)}/security-scan-waiver`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waived, note })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(typeof err.error === 'string' ? err.error : 'Save failed')
      }
      onRefresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not update security waiver')
    } finally {
      setSavingWaiver(false)
    }
  }

  const uploadFooter = (kind: ScanKind, inputRef: RefObject<HTMLInputElement | null>) => (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef as Ref<HTMLInputElement>}
        type="file"
        accept="image/jpeg,image/png,image/jpg,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => void uploadFiles(e.target.files, kind)}
      />
      <button
        type="button"
        className="w-full rounded-md bg-slate-100 px-2 py-1.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-200 disabled:opacity-50"
        disabled={uploading !== null}
        onClick={() => inputRef.current?.click()}
      >
        {uploading === kind ? 'Uploading…' : '+ Upload file'}
      </button>
    </div>
  )

  return (
    <>
    <div className="grid grid-cols-1 gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-3 sm:grid-cols-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Deposits</span>
        <IconMenu
          ariaLabel="Deposit slips: preview or manage"
          icon={<IconDepositSlip className="text-blue-700" />}
          triggerClassName="border-blue-200 bg-blue-50/90 hover:bg-blue-50 hover:border-blue-300"
          options={depositOpts.map((o) => ({ value: o.value, label: o.label }))}
          emptyHint="No deposit scans yet"
          allowEmptyOpen
          onPick={(url, label) => onOpenPreview(url, label)}
          onDelete={(url) => void deleteUrl(url, 'deposit')}
          footer={uploadFooter('deposit', depInput)}
        />
        {depositScans.length === 0 ? (
          <span className="text-[11px] text-blue-600/75">No deposit scans</span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Credit &amp; debit</span>
        <IconMenu
          ariaLabel="Other Items scans: preview or manage"
          icon={<IconDebitCard className="text-violet-700" />}
          triggerClassName="border-violet-200 bg-violet-50/90 hover:bg-violet-50 hover:border-violet-300"
          options={debitOpts.map((o) => ({ value: o.value, label: o.label }))}
          emptyHint="No debit scans yet"
          allowEmptyOpen
          onPick={(url, label) => onOpenPreview(url, label)}
          onDelete={(url) => void deleteUrl(url, 'debit')}
          footer={uploadFooter('debit', debInput)}
        />
        {debitScans.length === 0 ? (
          <span className="text-[11px] text-violet-600/75">No debit scans</span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Security</span>
        <IconMenu
          ariaLabel="Security slips: preview or manage"
          icon={<IconShield className="text-emerald-700" />}
          triggerClassName="border-emerald-200 bg-emerald-50/90 hover:bg-emerald-50 hover:border-emerald-300"
          options={securityOpts.map((o) => ({ value: o.value, label: o.label }))}
          emptyHint="No security scans yet"
          allowEmptyOpen
          onPick={(url, label) => onOpenPreview(url, label)}
          onDelete={(url) => void deleteUrl(url, 'security')}
          footer={uploadFooter('security', secInput)}
        />
        {securityScans.length === 0 ? (
          <span
            className={`text-[11px] ${securityScanWaived ? 'text-amber-800/90 font-medium' : 'text-emerald-700/70'}`}
          >
            {securityScanWaived ? 'No scan — marked without pickup' : 'No security scans'}
          </span>
        ) : null}
      </div>
    </div>
    {securityScans.length === 0 ? (
      <div className="border-b border-slate-100 bg-slate-50/30 px-4 py-3">
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
            checked={securityScanWaived}
            disabled={savingWaiver}
            onChange={(e) => void saveSecurityWaiver(e.target.checked, waiverNoteDraft)}
          />
          <span className="text-sm text-slate-800 leading-snug">
            No security pickup — deposit was still dropped off; mark security as recorded without a slip.
            {savingWaiver ? <span className="text-slate-500"> Saving…</span> : null}
          </span>
        </label>
        {securityScanWaived ? (
          <div className="mt-2 ml-7 max-w-xl">
            <label className="block text-[11px] font-medium text-slate-600 mb-0.5" htmlFor={`sec-waiver-note-${date}`}>
              Optional note
            </label>
            <input
              id={`sec-waiver-note-${date}`}
              type="text"
              className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm text-slate-900"
              placeholder="e.g. manual bank drop, security off duty"
              value={waiverNoteDraft}
              disabled={savingWaiver}
              onChange={(e) => setWaiverNoteDraft(e.target.value)}
              onBlur={() => {
                if (!securityScanWaived) return
                if (waiverNoteDraft === securityScanWaiverNote) return
                void saveSecurityWaiver(true, waiverNoteDraft)
              }}
            />
          </div>
        ) : null}
      </div>
    ) : null}
    </>
  )
}
