import Link from 'next/link'
import { formatAmount } from '@/lib/fuelPayments'

const WESTLINE_ACCOUNT = { name: 'Westline Ent', kind: 'Chequing account', number: '200000316928' }
const SERVICE_STATION_ACCOUNT = { name: 'Service Station', kind: 'Total Auto / Chequing account', number: '200000102146' }

export type OperatingBalance = {
  currentBalance: number
  availableFunds: number
  planned: number
  balanceAfter: number
  uncashedChecksTotal?: number
  phantom?: number
  totalAutoCurrentBalance?: number
  totalAutoAvailable?: number
  serviceStationUncashedChecksTotal?: number
  serviceStationPhantom?: number
}

function money(amount: number): string {
  return `XCD ${formatAmount(amount)}`
}

function UncashedPhantom({ uncashed, phantom, title }: { uncashed: number; phantom: number; title: string }) {
  if (uncashed <= 0) return null

  return <>
    <Link href="/vendor-payments/uncashed-checks" className="font-semibold text-amber-700 hover:text-amber-800 hover:underline" title="Checks issued but not yet cleared by the bank">
      Uncashed <span className="tabular-nums font-normal">{money(uncashed)}</span>
    </Link>
    <span title={title}>
      <span className="font-semibold text-slate-700">Phantom</span>{' '}
      <span className={`tabular-nums font-semibold ${phantom >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{money(phantom)}</span>
    </span>
  </>
}

function AccountPreview({ name, available }: { name: string; available: number }) {
  return <div className="flex min-w-0 items-center justify-between gap-3">
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-600 text-xs font-semibold text-white" aria-hidden>$</span>
      <span className="truncate text-sm font-semibold text-slate-900">{name}</span>
    </span>
    <span className="shrink-0 text-right">
      <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">Available</span>
      <span className="block text-sm font-bold tabular-nums text-slate-900">{money(available)}</span>
    </span>
  </div>
}

function AccountDetails({ name, kind, number, currentBalance, available, children }: {
  name: string
  kind: string
  number: string
  currentBalance: number
  available: number
  children?: React.ReactNode
}) {
  return <section className="min-w-0 p-4" aria-label={`${name} balance details`}>
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="font-semibold text-slate-900">{name}</p>
        <p className="mt-1 text-xs text-slate-500">{kind} / {number}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Available</p>
        <p className="mt-1 text-base font-bold tabular-nums text-slate-900">{money(available)}</p>
        <p className="mt-1 text-xs tabular-nums text-slate-500">Balance {money(currentBalance)}</p>
      </div>
    </div>
    {children ? <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-slate-100 pt-2.5 text-xs text-slate-600">{children}</div> : null}
  </section>
}

export function OperatingBalanceCard({ balance, note }: { balance: OperatingBalance; note?: string }) {
  const uncashed = balance.uncashedChecksTotal ?? 0
  const phantom = balance.phantom ?? 0
  const serviceStationUncashed = balance.serviceStationUncashedChecksTotal ?? 0
  const serviceStationPhantom = balance.serviceStationPhantom ?? 0

  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Funding accounts">
    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Funding accounts</h2>
        <p className="text-xs text-slate-500">Available funds for fuel and vendor payments</p>
      </div>
      <Link href="/vendor-payments/uncashed-checks" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline">Check status</Link>
    </div>
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 sm:divide-x sm:divide-slate-200">
          <AccountPreview name={SERVICE_STATION_ACCOUNT.name} available={balance.totalAutoAvailable ?? 0} />
          <div className="sm:pl-3"><AccountPreview name={WESTLINE_ACCOUNT.name} available={balance.availableFunds} /></div>
        </div>
        <span className="shrink-0 text-xs font-semibold text-indigo-600 group-open:hidden">Details</span>
        <span className="hidden shrink-0 text-xs font-semibold text-indigo-600 group-open:inline">Hide</span>
      </summary>
      <div className="grid divide-y divide-slate-200 border-t border-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <AccountDetails name={SERVICE_STATION_ACCOUNT.name} kind={SERVICE_STATION_ACCOUNT.kind} number={SERVICE_STATION_ACCOUNT.number} currentBalance={balance.totalAutoCurrentBalance ?? 0} available={balance.totalAutoAvailable ?? 0}>
          <UncashedPhantom uncashed={serviceStationUncashed} phantom={serviceStationPhantom} title="Phantom equals Service Station available minus uncashed vendor checks. Outstanding vendor checks are reserved on both accounts until the check clears." />
        </AccountDetails>
        <AccountDetails name={WESTLINE_ACCOUNT.name} kind={WESTLINE_ACCOUNT.kind} number={WESTLINE_ACCOUNT.number} currentBalance={balance.currentBalance} available={balance.availableFunds}>
          <span><span className="font-semibold text-slate-700">Planned</span> <span className="tabular-nums">{money(balance.planned)}</span></span>
          <span><span className="font-semibold text-slate-700">After</span> <span className={`tabular-nums font-semibold ${balance.balanceAfter >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{money(balance.balanceAfter)}</span></span>
          <UncashedPhantom uncashed={uncashed} phantom={phantom} title="Phantom equals Westline available minus uncashed checks. Outstanding vendor checks are reserved on both accounts until the check clears. Cashbook checks are reserved on Westline only." />
          {note ? <span className="text-slate-400">{note}</span> : null}
        </AccountDetails>
      </div>
    </details>
  </section>
}
