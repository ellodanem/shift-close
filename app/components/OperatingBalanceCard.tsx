import Link from 'next/link'
import { formatAmount } from '@/lib/fuelPayments'

/** Republic chequing account this screen reads from. */
const WESTLINE_ACCOUNT = {
  name: 'Westline Ent',
  kind: 'Chequing Account',
  number: '200000316928'
}

export type OperatingBalance = {
  currentBalance: number
  availableFunds: number
  planned: number
  balanceAfter: number
  uncashedChecksTotal?: number
  phantom?: number
}

function money(amount: number): string {
  return `XCD ${formatAmount(amount)}`
}

export function OperatingBalanceCard({
  balance,
  note
}: {
  balance: OperatingBalance
  note?: string
}) {
  const uncashed = balance.uncashedChecksTotal ?? 0
  const showUncashed = uncashed > 0
  const phantom = balance.phantom ?? 0

  return (
    <section
      className="mb-4 overflow-hidden rounded-lg border border-gray-200 bg-white"
      aria-label={`${WESTLINE_ACCOUNT.name} balance`}
    >
      <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-600 text-lg font-semibold text-white"
            aria-hidden
          >
            $
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-slate-800">{WESTLINE_ACCOUNT.name}</p>
            <p className="text-sm text-slate-500">{WESTLINE_ACCOUNT.kind}</p>
            <p className="text-sm text-slate-400">{WESTLINE_ACCOUNT.number}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 border-t border-gray-200 pt-3 sm:min-w-[22rem] sm:border-t-0 sm:pt-0">
          <div className="border-r border-gray-200 pr-3 text-right sm:pr-4">
            <p className="text-xs font-medium text-slate-500">Current Balance</p>
            <p className="mt-1 text-sm tabular-nums text-slate-700 sm:text-base">
              {money(balance.currentBalance)}
            </p>
          </div>
          <div className="pl-3 text-right sm:pl-4">
            <p className="text-xs font-medium text-slate-500">Available</p>
            <p className="mt-1 text-sm tabular-nums text-slate-700 sm:text-base">
              {money(balance.availableFunds)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-gray-200 px-4 py-2.5 text-sm text-slate-600">
        <span>
          <span className="font-semibold text-slate-700">Planned</span>{' '}
          <span className="tabular-nums">{money(balance.planned)}</span>
        </span>
        <span>
          <span className="font-semibold text-slate-700">After</span>{' '}
          <span
            className={`tabular-nums font-semibold ${
              balance.balanceAfter >= 0 ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {money(balance.balanceAfter)}
          </span>
        </span>
        {showUncashed && (
          <>
            <Link
              href="/vendor-payments/uncashed-checks"
              className="font-semibold text-amber-700 hover:text-amber-800 hover:underline"
              title="Total of vendor checks issued but not yet cleared by the bank"
            >
              Uncashed{' '}
              <span className="tabular-nums font-normal">{money(uncashed)}</span>
            </Link>
            <span title="Phantom = Available − Uncashed checks. A heads-up of actual spendable funds.">
              <span className="font-semibold text-slate-700">Phantom</span>{' '}
              <span
                className={`tabular-nums font-semibold ${
                  phantom >= 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {money(phantom)}
              </span>
            </span>
          </>
        )}
        {note && <span className="text-xs text-slate-400">{note}</span>}
      </div>
    </section>
  )
}
