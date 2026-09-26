'use client'

export type CreditUnionLetterDraft = {
  code: string
  to: string
  subject: string
  message: string
  letterText: string
  summary: string
}

export function CreditUnionLetterDialog({
  draft,
  busy,
  error,
  onChange,
  onClose,
  onSend
}: {
  draft: CreditUnionLetterDraft | null
  busy: boolean
  error: string | null
  onChange: (draft: CreditUnionLetterDraft) => void
  onClose: () => void
  onSend: () => void
}) {
  if (!draft) return null
  const patch = (next: Partial<CreditUnionLetterDraft>) => onChange({ ...draft, ...next })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Email {draft.code} letter</h2>
        <p className="mt-1 text-sm text-slate-600">
          To is empty on purpose — fill the credit union address. Edit the letter, then send. The salary list
          {draft.summary ? ` (${draft.summary})` : ''} and signature are added under it on the attached PDF.
        </p>
        {error ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        <label className="mt-4 block text-sm font-medium text-slate-700">
          To
          <input
            type="email"
            value={draft.to}
            onChange={(e) => patch({ to: e.target.value })}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder="credit-union@example.com"
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Subject
          <input
            type="text"
            value={draft.subject}
            onChange={(e) => patch({ subject: e.target.value })}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Email message
          <textarea
            value={draft.message}
            onChange={(e) => patch({ message: e.target.value })}
            rows={3}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Letter
          <textarea
            value={draft.letterText}
            onChange={(e) => patch({ letterText: e.target.value })}
            rows={10}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-serif text-sm"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-slate-100 px-3 py-1.5 text-sm text-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onSend}
            className="rounded-md bg-violet-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
