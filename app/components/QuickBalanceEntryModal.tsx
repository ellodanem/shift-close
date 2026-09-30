import { formatAmount } from '@/lib/fuelPayments'

export type BalanceEntryForm = {
  currentBalance: string
  availableFunds: string
  totalAutoCurrentBalance: string
  totalAutoAvailable: string
}

const inputClass =
  'min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0'

function AccountFields({
  name,
  detail,
  currentValue,
  availableValue,
  onCurrent,
  onAvailable,
  hint
}: {
  name: string
  detail: string
  currentValue: string
  availableValue: string
  onCurrent: (value: string) => void
  onAvailable: (value: string) => void
  hint: string
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-slate-800">{name}</p>
      <p className="mb-2 text-xs text-slate-500">{detail}</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Current Balance</span>
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={currentValue}
            onChange={(e) => onCurrent(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Available</span>
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={availableValue}
            onChange={(e) => onAvailable(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <p className="mt-1 text-xs text-gray-500">{hint}</p>
    </div>
  )
}

export function QuickBalanceEntryModal({
  open,
  title = 'Quick Balance Entry',
  saving,
  form,
  onFormChange,
  planned,
  balanceAfter,
  note,
  onClose,
  onSave
}: {
  open: boolean
  title?: string
  saving: boolean
  form: BalanceEntryForm
  onFormChange: (form: BalanceEntryForm) => void
  planned?: number
  balanceAfter?: number
  note?: string
  onClose: () => void
  onSave: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center">
      <div className="my-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] text-2xl text-gray-500 hover:text-gray-700 sm:min-h-0 sm:min-w-0"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="space-y-5">
          <AccountFields
            name="Service Station"
            detail="Total Auto · Chequing Account · 200000102146"
            currentValue={form.totalAutoCurrentBalance}
            availableValue={form.totalAutoAvailable}
            onCurrent={(totalAutoCurrentBalance) =>
              onFormChange({ ...form, totalAutoCurrentBalance })
            }
            onAvailable={(totalAutoAvailable) => onFormChange({ ...form, totalAutoAvailable })}
            hint="Available is a suggestion on proposed payments."
          />

          <div className="border-t border-gray-200 pt-5">
            <AccountFields
              name="Westline Ent"
              detail="Chequing Account · 200000316928"
              currentValue={form.currentBalance}
              availableValue={form.availableFunds}
              onCurrent={(currentBalance) => onFormChange({ ...form, currentBalance })}
              onAvailable={(availableFunds) => onFormChange({ ...form, availableFunds })}
              hint="Payment calculations use Available."
            />
          </div>

          {planned != null && balanceAfter != null && (
            <div className="space-y-1 rounded bg-gray-50 p-3 text-sm">
              <div>
                <span className="text-gray-600">Planned: </span>
                <span className="font-semibold text-blue-600">{formatAmount(planned)}</span>
              </div>
              <div>
                <span className="text-gray-600">Balance After: </span>
                <span
                  className={`font-semibold ${balanceAfter >= 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  {formatAmount(balanceAfter)}
                </span>
              </div>
              {note && <p className="pt-1 text-xs text-slate-400">{note}</p>}
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:gap-4">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="min-h-[44px] rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50 sm:min-h-0"
          >
            {saving ? 'Saving...' : 'Save Balance'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded bg-gray-500 px-4 py-2 font-semibold text-white hover:bg-gray-600 sm:min-h-0"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
