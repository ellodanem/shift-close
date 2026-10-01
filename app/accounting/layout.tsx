import { AccountingShell } from './books-context'

export default function AccountingLayout({ children }: { children: React.ReactNode }) {
  return <AccountingShell>{children}</AccountingShell>
}
