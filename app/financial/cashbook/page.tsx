'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/components/AuthContext'
import {
  CASHBOOK_ACCOUNTS,
  CASHBOOK_ACCOUNT_INFO,
  cashbookAccountLabel,
  resolveCashbookAccount,
  type CashbookAccount
} from '@/lib/cashbook-accounts'

const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'eft', label: 'EFT' },
  { value: 'direct_debit', label: 'Direct debit' },
  { value: 'debit_credit', label: 'Debit/Credit' }
] as const

interface CashbookCategory {
  id: string
  name: string
  code: string | null
  type: string
}

interface CashbookApiAllocation {
  id: string
  amount: number
  category: CashbookCategory
}

interface CashbookApiEntry {
  id: string
  date: string
  ref: string | null
  description: string
  debitCash: number
  debitCheck?: number
  debitEcard: number
  debitDcard: number
  creditAmt: number
  paymentMethod?: string | null
  account?: string
  accountSource?: string
  transferGroupId?: string | null
  customerArPaymentId?: string | null
  vendorPaymentBatchId?: string | null
  allocations: CashbookApiAllocation[]
}

interface EntryForm {
  date: string
  ref: string
  description: string
  categoryId: string
  amount: number
  paymentMethod: string
  account: CashbookAccount
}

const ACCOUNT_BADGE: Record<CashbookAccount, string> = {
  westline: 'bg-sky-100 text-sky-800',
  service_station: 'bg-amber-100 text-amber-800'
}

function AccountBadge({ account, review }: { account?: string; review?: boolean }) {
  const known = account === 'westline' || account === 'service_station'
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
        known ? ACCOUNT_BADGE[account as CashbookAccount] : 'bg-gray-100 text-gray-600'
      }`}
      title={review ? 'Assigned automatically. Please review.' : undefined}
    >
      {cashbookAccountLabel(account)}
      {review ? ' •' : ''}
    </span>
  )
}

interface DuplicateMatch {
  id: string
  date: string
  amount: number
  category: string
  description: string
}

function formatMonthInput(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function firstOfMonth(month: string): string {
  return `${month}-01`
}

function lastOfMonth(month: string): string {
  const [yearStr, monthStr] = month.split('-')
  const y = Number(yearStr)
  const m = Number(monthStr)
  if (!y || !m) return month
  const date = new Date(y, m, 0)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${mm}-${dd}`
}

function inferType(entry: CashbookApiEntry): 'income' | 'expense' {
  if ((entry.creditAmt ?? 0) > 0) return 'income'
  return 'expense'
}

function inferAmount(entry: CashbookApiEntry): number {
  const alloc = entry.allocations[0]
  if (alloc) return alloc.amount
  if ((entry.creditAmt ?? 0) > 0) return entry.creditAmt
  return (entry.debitCash ?? 0) + (entry.debitCheck ?? 0) + (entry.debitEcard ?? 0) + (entry.debitDcard ?? 0)
}

function inferPaymentMethod(entry: CashbookApiEntry): string {
  if (entry.paymentMethod) return entry.paymentMethod
  if ((entry.debitCheck ?? 0) > 0) return 'check'
  if ((entry.debitEcard ?? 0) > 0) return 'eft'
  if ((entry.debitDcard ?? 0) > 0) return 'debit_credit'
  return 'cash'
}

function isBankChargesCategory(categoryId: string, categories: CashbookCategory[]): boolean {
  const cat = categories.find((c) => c.id === categoryId)
  return !!cat && /bank\s*charges?/i.test(cat.name)
}

function isCardTransactionsCategory(categoryId: string, categories: CashbookCategory[]): boolean {
  const cat = categories.find((c) => c.id === categoryId)
  return !!cat && /^(credit\s*card|debit\s*card)$/i.test(cat.name.trim())
}

function isDepositCategory(categoryId: string, categories: CashbookCategory[]): boolean {
  const cat = categories.find((c) => c.id === categoryId)
  return !!cat && /^deposit$/i.test(cat.name.trim())
}

function typeLabel(entry: CashbookApiEntry, type: 'income' | 'expense'): string {
  if (entry.transferGroupId) return 'Transfer'
  return type === 'income' ? 'Income' : 'Expense'
}

function typeBadgeClass(entry: CashbookApiEntry, type: 'income' | 'expense'): string {
  if (entry.transferGroupId) return 'bg-slate-200 text-slate-800'
  return type === 'income' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function formatPaymentLabel(value: string): string {
  const opt = PAYMENT_OPTIONS.find((o) => o.value === value)
  return opt?.label ?? value
}

const CASHBOOK_SORT_KEY = 'cashbook-sort-date'

const emptyForm: EntryForm = {
  date: '',
  ref: '',
  description: '',
  categoryId: '',
  amount: 0,
  paymentMethod: 'cash',
  account: 'westline'
}

export default function CashbookPage() {
  const router = useRouter()
  const { isStakeholder } = useAuth()
  const readOnly = isStakeholder
  const [categories, setCategories] = useState<CashbookCategory[]>([])
  const [entries, setEntries] = useState<CashbookApiEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [month, setMonth] = useState<string>(() => formatMonthInput(new Date()))
  const [modalOpen, setModalOpen] = useState<'income' | 'expense' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<EntryForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatCode, setNewCatCode] = useState('')
  const [newCatType, setNewCatType] = useState<'income' | 'expense'>('expense')
  const [descriptionSuggestions, setDescriptionSuggestions] = useState<string[]>([])
  const [descriptionSuggestionsOpen, setDescriptionSuggestionsOpen] = useState(false)
  const [descriptionSuggestionsLoading, setDescriptionSuggestionsLoading] = useState(false)
  const descriptionInputRef = useRef<HTMLInputElement>(null)
  const descriptionDropdownRef = useRef<HTMLDivElement>(null)
  const [dateSort, setDateSort] = useState<'asc' | 'desc'>(() => {
    if (typeof window === 'undefined') return 'desc'
    const saved = localStorage.getItem(CASHBOOK_SORT_KEY)
    return saved === 'asc' || saved === 'desc' ? saved : 'desc'
  })
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [accountFilter, setAccountFilter] = useState<'' | CashbookAccount>('')
  const [reviewOnly, setReviewOnly] = useState(false)
  const [accountTouched, setAccountTouched] = useState(false)
  const [prefillTask, setPrefillTask] = useState<{ id: string; hint: string } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState<string | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferForm, setTransferForm] = useState({
    date: '',
    amount: 0,
    from: 'service_station' as CashbookAccount,
    to: 'westline' as CashbookAccount,
    ref: '',
    note: ''
  })
  const [duplicateModal, setDuplicateModal] = useState<{
    matches: DuplicateMatch[]
    payload: Record<string, unknown>
    addAnother: boolean
  } | null>(null)

  const dateRange = useMemo(
    () => ({ startDate: firstOfMonth(month), endDate: lastOfMonth(month) }),
    [month]
  )

  const incomeCategories = useMemo(() => categories.filter((c) => c.type === 'income'), [categories])
  const expenseCategories = useMemo(() => categories.filter((c) => c.type === 'expense'), [categories])

  const sortedEntries = useMemo(() => {
    const arr = [...entries]
    arr.sort((a, b) => {
      const cmp = a.date.localeCompare(b.date)
      return dateSort === 'desc' ? -cmp : cmp
    })
    return arr
  }, [entries, dateSort])

  const toggleDateSort = () => {
    const next = dateSort === 'asc' ? 'desc' : 'asc'
    setDateSort(next)
    try {
      localStorage.setItem(CASHBOOK_SORT_KEY, next)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!modalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalOpen])

  const fetchDescriptionSuggestions = useCallback(
    async (q: string) => {
      if (!modalOpen) return
      setDescriptionSuggestionsLoading(true)
      try {
        const params = new URLSearchParams({ type: modalOpen })
        if (q.trim()) params.set('q', q.trim())
        const res = await fetch(`/api/financial/cashbook/description-suggestions?${params}`)
        if (res.ok) {
          const data: string[] = await res.json()
          setDescriptionSuggestions(data)
          setDescriptionSuggestionsOpen(true)
        }
      } catch {
        setDescriptionSuggestions([])
      } finally {
        setDescriptionSuggestionsLoading(false)
      }
    },
    [modalOpen]
  )

  useEffect(() => {
    if (!modalOpen) {
      setDescriptionSuggestionsOpen(false)
      setDescriptionSuggestions([])
      return
    }
    const t = setTimeout(() => fetchDescriptionSuggestions(form.description), 150)
    return () => clearTimeout(t)
  }, [modalOpen, form.description, fetchDescriptionSuggestions])

  const excludeDescription = async (desc: string) => {
    if (!modalOpen) return
    try {
      await fetch('/api/financial/cashbook/description-exclusions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc, type: modalOpen })
      })
      setDescriptionSuggestions((prev) => prev.filter((d) => d !== desc))
    } catch {
      // ignore
    }
  }

  const entriesUrl = useMemo(() => {
    const params = new URLSearchParams({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate
    })
    if (typeFilter === 'income' || typeFilter === 'expense') params.set('type', typeFilter)
    if (categoryFilter) params.set('categoryId', categoryFilter)
    if (accountFilter) params.set('account', accountFilter)
    if (reviewOnly) params.set('review', '1')
    return `/api/financial/cashbook/entries?${params.toString()}`
  }, [dateRange.startDate, dateRange.endDate, typeFilter, categoryFilter, accountFilter, reviewOnly])

  const fetchEntries = useCallback(async () => {
    const res = await fetch(entriesUrl)
    if (res.ok) {
      const data: CashbookApiEntry[] = await res.json()
      setEntries(data)
    }
  }, [entriesUrl])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [catRes, entryRes] = await Promise.all([
          fetch('/api/financial/cashbook/categories'),
          fetch(entriesUrl)
        ])
        if (!catRes.ok) throw new Error('Failed to load categories')
        if (!entryRes.ok) throw new Error('Failed to load entries')
        const catData: CashbookCategory[] = await catRes.json()
        setCategories(catData)
        const entryData: CashbookApiEntry[] = await entryRes.json()
        setEntries(entryData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load cashbook')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [entriesUrl])

  // A task from the spreadsheet comparison opens the add form already filled in.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const taskId = params.get('task')
    const type = params.get('type')
    const date = params.get('date') ?? ''
    if (!taskId || (type !== 'income' && type !== 'expense') || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    const account = params.get('account') === 'service_station' ? 'service_station' : 'westline'
    const method = params.get('pm') ?? 'cash'
    setMonth(date.slice(0, 7))
    setModalOpen(type)
    setEditingId(null)
    setAccountTouched(true)
    setPrefillTask({ id: taskId, hint: params.get('hint') ?? '' })
    setForm({
      date,
      ref: params.get('ref') ?? '',
      description: params.get('desc') ?? '',
      categoryId: '',
      amount: Number(params.get('amount')) || 0,
      paymentMethod: PAYMENT_OPTIONS.some((option) => option.value === method) ? method : 'cash',
      account
    })
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const completePrefillTask = async () => {
    if (!prefillTask) return
    const id = prefillTask.id
    setPrefillTask(null)
    try {
      await fetch(`/api/financial/cashbook/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done', resolution: 'Entered in the cashbook.' })
      })
    } catch {
      // The next re-check closes it anyway, because the entry now matches the sheet.
    }
  }

  const openAddModal = (type: 'income' | 'expense') => {
    setModalOpen(type)
    setEditingId(null)
    setPrefillTask(null)
    setAccountTouched(false)
    setForm({
      ...emptyForm,
      date: dateRange.startDate,
      categoryId: '',
      paymentMethod: 'cash',
      account: accountFilter || resolveCashbookAccount({ origin: 'manual', type }).account
    })
    if (accountFilter) setAccountTouched(true)
  }

  const openEditModal = (entry: CashbookApiEntry) => {
    const type = inferType(entry)
    setModalOpen(type)
    setEditingId(entry.id)
    setAccountTouched(false)
    const alloc = entry.allocations[0]
    setForm({
      date: entry.date,
      ref: entry.ref ?? '',
      description: entry.description ?? '',
      categoryId: alloc?.category.id ?? '',
      amount: inferAmount(entry),
      paymentMethod: type === 'expense' ? inferPaymentMethod(entry) : 'cash',
      account: entry.account === 'service_station' ? 'service_station' : 'westline'
    })
  }

  const closeModal = () => {
    setModalOpen(null)
    setEditingId(null)
    setPrefillTask(null)
    setForm(emptyForm)
  }

  const performSaveWithForce = async (payload: Record<string, unknown>, addAnother: boolean) => {
    setSaving(true)
    setDuplicateModal(null)
    try {
      const res = await fetch('/api/financial/cashbook/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, forceDuplicate: true })
      })
      if (!res.ok) throw new Error('Failed to create')
      await fetchEntries()
      await completePrefillTask()
      if (addAnother) {
        setForm((f) => ({ ...f, amount: 0, ref: '' }))
        setTimeout(() => document.getElementById('cashbook-amount-input')?.focus(), 50)
      } else {
        closeModal()
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteDuplicate = async (matchId: string, payload: Record<string, unknown>, addAnother: boolean) => {
    setSaving(true)
    setDuplicateModal(null)
    try {
      const delRes = await fetch(`/api/financial/cashbook/entries/${matchId}`, { method: 'DELETE' })
      if (!delRes.ok) throw new Error('Failed to delete existing entry')
      const res = await fetch('/api/financial/cashbook/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error('Failed to create')
      await fetchEntries()
      await completePrefillTask()
      if (addAnother) {
        setForm((f) => ({ ...f, amount: 0, ref: '' }))
        setTimeout(() => document.getElementById('cashbook-amount-input')?.focus(), 50)
      } else {
        closeModal()
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const saveEntry = async (addAnother = false) => {
    if (!form.date || !form.description.trim() || !form.categoryId) {
      alert('Date, Description and Category are required.')
      return
    }
    const amt = Number(form.amount) || 0
    if (amt <= 0) {
      alert('Amount must be greater than 0.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        date: form.date,
        ref: form.ref.trim() || null,
        description: form.description.trim(),
        type: modalOpen!,
        paymentMethod: modalOpen === 'expense' ? form.paymentMethod : null,
        categoryId: form.categoryId,
        amount: amt,
        // What the form shows is what is saved. When editing, only send it if it was changed.
        ...(!editingId || accountTouched ? { account: form.account } : {})
      }

      if (editingId) {
        const res = await fetch(`/api/financial/cashbook/entries/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to update')
        }
      } else {
        const res = await fetch('/api/financial/cashbook/entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (res.status === 409) {
          const data = await res.json()
          if (data.duplicate && Array.isArray(data.matches)) {
            setDuplicateModal({ matches: data.matches, payload, addAnother })
            setSaving(false)
            return
          }
        }
        if (!res.ok) throw new Error('Failed to create')
      }

      // Reload entries
      await fetchEntries()
      if (!editingId) await completePrefillTask()

      if (addAnother && !editingId) {
        setEditingId(null)
        setForm((f) => ({
          ...f,
          amount: 0,
          ref: ''
        }))
        // Focus amount field after a tick
        setTimeout(() => document.getElementById('cashbook-amount-input')?.focus(), 50)
      } else {
        closeModal()
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const deleteEntry = async (id: string) => {
    if (!confirm('Delete this entry? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/financial/cashbook/entries/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete')
      }
      await fetchEntries()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const handleAddCategory = async () => {
    if (!newCatName.trim()) {
      alert('Category name is required.')
      return
    }
    try {
      const res = await fetch('/api/financial/cashbook/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCatName.trim(),
          code: newCatCode.trim() || null,
          type: newCatType
        })
      })
      if (!res.ok) throw new Error('Failed to create category')
      const created: CashbookCategory = await res.json()
      setCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setNewCatName('')
      setNewCatCode('')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create category')
    }
  }

  const reviewCount = entries.filter((e) => e.accountSource === 'backfill').length
  const allVisibleSelected = sortedEntries.length > 0 && sortedEntries.every((e) => selectedIds.has(e.id))

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(sortedEntries.map((e) => e.id)))
  }

  const moveEntries = async (ids: string[], account: CashbookAccount, remember = false) => {
    try {
      const res = await fetch('/api/financial/cashbook/entries/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, account, remember })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to move')
      const skipped: Array<{ reason: string }> = Array.isArray(data.skipped) ? data.skipped : []
      const movedCount = Array.isArray(data.moved) ? data.moved.length : 0
      setNotice(
        `${movedCount} moved to ${cashbookAccountLabel(account)}.` +
          (skipped.length > 0 ? ` ${skipped.length} not moved: ${skipped[0].reason}.` : '')
      )
      setSelectedIds(new Set())
      await fetchEntries()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to move')
    }
  }

  const changeEntryAccount = async (entry: CashbookApiEntry, account: CashbookAccount) => {
    if (entry.account === account) return
    let remember = false
    if (entry.customerArPaymentId || entry.vendorPaymentBatchId) {
      remember = confirm(
        `Move to ${cashbookAccountLabel(account)}.\n\nRemember this account for future payments like "${entry.description}"?`
      )
    }
    await moveEntries([entry.id], account, remember)
  }

  const openTransfer = () => {
    setTransferForm((f) => ({ ...f, date: dateRange.startDate, amount: 0, ref: '', note: '' }))
    setTransferOpen(true)
  }

  const saveTransfer = async () => {
    if (!transferForm.date || !(Number(transferForm.amount) > 0)) {
      alert('Date and an amount greater than 0 are required.')
      return
    }
    if (transferForm.from === transferForm.to) {
      alert('Choose two different accounts.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/financial/cashbook/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: transferForm.date,
          amount: Number(transferForm.amount),
          from: transferForm.from,
          to: transferForm.to,
          ref: transferForm.ref.trim() || null,
          description: transferForm.note.trim() || null
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save transfer')
      setTransferOpen(false)
      setNotice(
        `Transferred $${formatCurrency(Number(transferForm.amount))} from ${cashbookAccountLabel(transferForm.from)} to ${cashbookAccountLabel(transferForm.to)}.`
      )
      await fetchEntries()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save transfer')
    } finally {
      setSaving(false)
    }
  }

  const confirmAccounts = async (ids: string[]) => {
    try {
      const res = await fetch('/api/financial/cashbook/entries/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, confirm: true })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to confirm')
      setNotice(`${data.confirmed ?? 0} entries confirmed.`)
      await fetchEntries()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to confirm')
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-gray-50 px-4 py-8 sm:min-h-screen sm:p-8">
        <p className="text-gray-600">Loading cashbook…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 pb-10 sm:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-gray-200 bg-gray-50/95 px-4 py-3 backdrop-blur-sm sm:static sm:mx-0 sm:mb-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Cashbook</h1>
              <p className="mt-1 text-sm text-gray-600">
                Track income and expenses. Your accountant can read the full details.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex min-h-[44px] items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Month:</span>
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="min-h-[44px] flex-1 rounded border border-gray-300 px-2 py-2 text-sm sm:min-h-0 sm:flex-none sm:py-1"
                />
              </div>
              {!readOnly ? (
              <button
                onClick={() => router.push('/financial/cashbook/tasks')}
                className="min-h-[44px] rounded border border-indigo-600 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 sm:min-h-0"
              >
                Spreadsheet tasks
              </button>
              ) : null}
              {!readOnly ? (
              <button
                onClick={() => router.push('/reports/financial')}
                className="min-h-[44px] rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 sm:min-h-0"
              >
                Financial Report
              </button>
              ) : null}
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {!readOnly ? (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
            <button
              onClick={() => openAddModal('income')}
              className="min-h-[44px] rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-green-700 sm:px-6"
            >
              ➕ Add Income
            </button>
            <button
              onClick={() => openAddModal('expense')}
              className="min-h-[44px] rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-red-700 sm:px-6"
            >
              ➕ Add Expense
            </button>
            <button
              onClick={openTransfer}
              className="col-span-2 min-h-[44px] rounded-lg bg-slate-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 sm:col-span-1 sm:px-6"
            >
              ⇄ Transfer
            </button>
          </div>
          ) : null}
        </div>

        {!readOnly ? (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-2 text-xs font-semibold text-gray-700">Add category</div>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <input
              type="text"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Name (e.g. Utilities)"
              className="min-h-[44px] rounded border border-gray-300 px-2 py-2 text-sm sm:min-h-0 sm:py-1"
            />
            <input
              type="text"
              value={newCatCode}
              onChange={(e) => setNewCatCode(e.target.value)}
              placeholder="Code (optional)"
              className="min-h-[44px] w-full rounded border border-gray-300 px-2 py-2 text-sm sm:min-h-0 sm:w-20 sm:py-1"
            />
            <select
              value={newCatType}
              onChange={(e) => setNewCatType(e.target.value as 'income' | 'expense')}
              className="min-h-[44px] rounded border border-gray-300 px-2 py-2 text-sm sm:min-h-0 sm:py-1"
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            <button
              type="button"
              onClick={() => void handleAddCategory()}
              className="min-h-[44px] rounded bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 sm:min-h-0 sm:py-1"
            >
              Add
            </button>
          </div>
        </div>
        ) : null}

        <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Cashbook account">
          {([['', 'All accounts'], ...CASHBOOK_ACCOUNTS.map((a) => [a, CASHBOOK_ACCOUNT_INFO[a].label])] as Array<
            ['' | CashbookAccount, string]
          >).map(([value, label]) => (
            <button
              key={value || 'all'}
              type="button"
              role="tab"
              aria-selected={accountFilter === value}
              onClick={() => {
                setAccountFilter(value)
                setSelectedIds(new Set())
              }}
              className={`min-h-[44px] rounded-full border px-4 py-2 text-sm font-semibold sm:min-h-0 sm:py-1.5 ${
                accountFilter === value
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {notice ? (
          <div className="mb-3 flex items-start justify-between gap-3 rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-green-700 hover:underline">
              Dismiss
            </button>
          </div>
        ) : null}

        {!readOnly && (reviewCount > 0 || reviewOnly) ? (
          <div className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            <p className="font-medium">
              {reviewCount > 0
                ? `${reviewCount} ${reviewCount === 1 ? 'entry was' : 'entries were'} assigned to an account automatically. Check them and fix any that are wrong.`
                : 'Nothing left to review for this view.'}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setReviewOnly((v) => !v)}
                className="min-h-[44px] rounded border border-amber-400 bg-white px-3 py-1.5 font-semibold text-amber-900 hover:bg-amber-100 sm:min-h-0"
              >
                {reviewOnly ? 'Show all entries' : 'Show only these'}
              </button>
              {reviewCount > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    void confirmAccounts(
                      entries.filter((e) => e.accountSource === 'backfill').map((e) => e.id)
                    )
                  }
                  className="min-h-[44px] rounded bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700 sm:min-h-0"
                >
                  Confirm all {reviewCount} as shown
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {!readOnly && selectedIds.size > 0 ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
            <span className="font-medium">{selectedIds.size} selected</span>
            {CASHBOOK_ACCOUNTS.map((acct) => (
              <button
                key={acct}
                type="button"
                onClick={() => void moveEntries([...selectedIds], acct)}
                className="min-h-[44px] rounded bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700 sm:min-h-0"
              >
                Move to {CASHBOOK_ACCOUNT_INFO[acct].label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="min-h-[44px] px-2 text-indigo-700 hover:underline sm:min-h-0"
            >
              Clear
            </button>
          </div>
        ) : null}

        {/* Entries list */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <h2 className="font-semibold text-gray-800">
              Entries for {(() => {
              const [y, m] = month.split('-').map(Number)
              return new Date(y, (m || 1) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
            })()}
            </h2>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex min-h-[44px] items-center gap-2">
                <label className="text-sm text-gray-600">Type:</label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="min-h-[44px] flex-1 rounded border border-gray-300 px-2 py-2 text-sm sm:min-h-0 sm:flex-none sm:py-1"
                >
                  <option value="">All</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </div>
              <div className="flex min-h-[44px] items-center gap-2">
                <label className="text-sm text-gray-600">Category:</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="min-h-[44px] min-w-0 flex-1 rounded border border-gray-300 px-2 py-2 text-sm sm:min-h-0 sm:min-w-[140px] sm:flex-none sm:py-1"
                >
                  <option value="">All</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={toggleDateSort}
                className="min-h-[44px] rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 md:hidden"
              >
                Date {dateSort === 'desc' ? '↓ newest' : '↑ oldest'}
              </button>
            </div>
          </div>
          {entries.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {readOnly ? 'No entries yet.' : 'No entries yet. Click "Add Income" or "Add Expense" to start.'}
            </div>
          ) : (
            <>
            {/* Mobile cards */}
            <div className="space-y-3 p-3 md:hidden">
              {sortedEntries.map((entry) => {
                const type = inferType(entry)
                const alloc = entry.allocations[0]
                const catName = alloc?.category.name ?? '—'
                const amount = inferAmount(entry)
                const payment =
                  type === 'expense'
                    ? formatPaymentLabel(inferPaymentMethod(entry))
                    : entry.paymentMethod
                      ? formatPaymentLabel(entry.paymentMethod)
                      : null
                return (
                  <div key={entry.id} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900">{entry.date}</div>
                        <div className="mt-1 line-clamp-2 text-sm text-gray-800">{entry.description}</div>
                      </div>
                      <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${typeBadgeClass(entry, type)}`}>
                        {typeLabel(entry, type)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                      <AccountBadge account={entry.account} review={entry.accountSource === 'backfill'} />
                      <span>
                        {catName}
                        {payment ? ` · ${payment}` : ''}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                      <span
                        className={`font-semibold font-mono tabular-nums ${
                          entry.transferGroupId
                            ? 'text-slate-700'
                            : type === 'income'
                              ? 'text-green-700'
                              : 'text-red-700'
                        }`}
                      >
                        {type === 'income' ? '+' : '-'}${formatCurrency(amount)}
                      </span>
                      {!readOnly ? (
                      <div className="flex gap-3">
                        {!entry.transferGroupId ? (
                          <button
                            onClick={() => openEditModal(entry)}
                            className="min-h-[44px] text-sm font-medium text-blue-600 hover:underline"
                          >
                            Edit
                          </button>
                        ) : null}
                        <button
                          onClick={() => void deleteEntry(entry.id)}
                          className="min-h-[44px] text-sm font-medium text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop table */}
            <table className="hidden min-w-full text-sm md:table">
              <thead className="bg-gray-100">
                <tr>
                  {!readOnly ? (
                    <th className="w-8 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAll}
                        aria-label="Select all entries"
                      />
                    </th>
                  ) : null}
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">
                    <button
                      type="button"
                      onClick={toggleDateSort}
                      className="flex items-center gap-1 hover:text-gray-900"
                      title={dateSort === 'desc' ? 'Newest first (click for oldest first)' : 'Oldest first (click for newest first)'}
                    >
                      Date {dateSort === 'desc' ? '↓' : '↑'}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Account</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Type</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Description</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Category</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-700">Amount</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">How paid</th>
                  <th className="px-3 py-2 text-center font-semibold text-gray-700 w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((entry) => {
                  const type = inferType(entry)
                  const alloc = entry.allocations[0]
                  const catName = alloc?.category.name ?? '—'
                  const amount = inferAmount(entry)
                  const payment =
                    type === 'expense'
                      ? formatPaymentLabel(inferPaymentMethod(entry))
                      : entry.paymentMethod
                        ? formatPaymentLabel(entry.paymentMethod)
                        : '—'
                  return (
                    <tr key={entry.id} className="border-t border-gray-100 hover:bg-gray-50">
                      {!readOnly ? (
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(entry.id)}
                            onChange={() => toggleSelected(entry.id)}
                            aria-label={`Select ${entry.description}`}
                          />
                        </td>
                      ) : null}
                      <td className="px-3 py-2">{entry.date}</td>
                      <td className="px-3 py-2">
                        {!readOnly && !entry.transferGroupId ? (
                          <select
                            value={entry.account === 'service_station' ? 'service_station' : 'westline'}
                            onChange={(e) => void changeEntryAccount(entry, e.target.value as CashbookAccount)}
                            className={`rounded border-0 px-2 py-0.5 text-xs font-medium ${
                              ACCOUNT_BADGE[entry.account === 'service_station' ? 'service_station' : 'westline']
                            }`}
                            title={
                              entry.accountSource === 'backfill'
                                ? 'Assigned automatically. Please review.'
                                : 'Change account'
                            }
                            aria-label="Account"
                          >
                            {CASHBOOK_ACCOUNTS.map((acct) => (
                              <option key={acct} value={acct}>
                                {CASHBOOK_ACCOUNT_INFO[acct].label}
                                {acct === entry.account && entry.accountSource === 'backfill' ? ' •' : ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <AccountBadge account={entry.account} review={entry.accountSource === 'backfill'} />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${typeBadgeClass(entry, type)}`}>
                          {typeLabel(entry, type)}
                        </span>
                      </td>
                      <td className="px-3 py-2">{entry.description}</td>
                      <td className="px-3 py-2">{catName}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {type === 'income' ? '+' : '-'}${formatCurrency(amount)}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{payment}</td>
                      <td className="px-3 py-2 text-center">
                        {!readOnly ? (
                        <>
                        {!entry.transferGroupId ? (
                          <button
                            onClick={() => openEditModal(entry)}
                            className="text-blue-600 hover:underline text-xs font-medium mr-2"
                          >
                            Edit
                          </button>
                        ) : null}
                        <button
                          onClick={() => void deleteEntry(entry.id)}
                          className="text-red-600 hover:underline text-xs font-medium"
                        >
                          Delete
                        </button>
                        </>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeModal}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editingId ? 'Edit' : 'Add'} {modalOpen === 'income' ? 'Income' : 'Expense'}
            </h3>
            {prefillTask && !editingId ? (
              <p className="mb-4 rounded border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                From the accountant&apos;s sheet. Pick the category and check the details.
                {prefillTask.hint ? ` The sheet puts it under: ${prefillTask.hint}.` : ''} The task closes when you save.
              </p>
            ) : null}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
              <div className="relative" ref={descriptionDropdownRef}>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  ref={descriptionInputRef}
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  onFocus={() => descriptionSuggestions.length > 0 && setDescriptionSuggestionsOpen(true)}
                  onBlur={() => setTimeout(() => setDescriptionSuggestionsOpen(false), 150)}
                  placeholder="e.g. Electric bill, Fuel sales"
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  autoComplete="off"
                />
                {descriptionSuggestionsOpen && descriptionSuggestions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded shadow-lg max-h-48 overflow-y-auto">
                    {descriptionSuggestions.map((d) => (
                      <div
                        key={d}
                        className="flex items-center justify-between group px-3 py-2 hover:bg-gray-50 cursor-pointer"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          setForm((f) => ({ ...f, description: d }))
                          setDescriptionSuggestionsOpen(false)
                        }}
                      >
                        <span>{d}</span>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            excludeDescription(d)
                          }}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 text-sm px-1"
                          title="Remove from suggestions"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {descriptionSuggestionsLoading && (
                  <span className="absolute right-3 top-9 text-xs text-gray-400">…</span>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={form.categoryId}
                  onChange={(e) => {
                    const newCategoryId = e.target.value
                    const updates: Partial<EntryForm> = { categoryId: newCategoryId }
                    if (
                      modalOpen === 'expense' &&
                      newCategoryId &&
                      isBankChargesCategory(newCategoryId, expenseCategories)
                    ) {
                      updates.description = 'Debit and Credit card charges'
                      updates.paymentMethod = 'direct_debit'
                    }
                    if (
                      modalOpen === 'income' &&
                      newCategoryId &&
                      isCardTransactionsCategory(newCategoryId, incomeCategories)
                    ) {
                      updates.description = 'Card Transactions'
                    }
                    if (
                      modalOpen === 'income' &&
                      newCategoryId &&
                      isDepositCategory(newCategoryId, incomeCategories)
                    ) {
                      updates.description = 'Deposit'
                    }
                    if (!accountTouched && modalOpen) {
                      // Follow the default for this category until the person picks an account.
                      const categoryName = categories.find((c) => c.id === newCategoryId)?.name
                      updates.account = resolveCashbookAccount({
                        origin: 'manual',
                        type: modalOpen,
                        categoryName,
                        description: updates.description ?? form.description
                      }).account
                    }
                    setForm((f) => ({ ...f, ...updates }))
                  }}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                >
                  <option value="">Select…</option>
                  {(modalOpen === 'income' ? incomeCategories : expenseCategories).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code ? `${c.name} (${c.code})` : c.name}
                    </option>
                  ))}
                </select>
                {(modalOpen === 'income' ? incomeCategories : expenseCategories).length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">Add an {modalOpen} category below first.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account</label>
                <div className="grid grid-cols-2 gap-2">
                  {CASHBOOK_ACCOUNTS.map((acct) => (
                    <button
                      key={acct}
                      type="button"
                      onClick={() => {
                        setAccountTouched(true)
                        setForm((f) => ({ ...f, account: acct }))
                      }}
                      className={`min-h-[44px] rounded border px-3 py-2 text-sm font-medium sm:min-h-0 ${
                        form.account === acct
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-800'
                          : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {CASHBOOK_ACCOUNT_INFO[acct].label}
                    </button>
                  ))}
                </div>
                {editingId && accountTouched ? (
                  <p className="mt-1 text-xs text-gray-500">
                    Moving an entry that has already left an account also moves its balance.
                  </p>
                ) : null}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                <input
                  id="cashbook-amount-input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount || ''}
                  onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) || 0 }))}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
              {modalOpen === 'expense' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">How paid</label>
                  <select
                    value={form.paymentMethod}
                    onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-2"
                  >
                    {PAYMENT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ref (optional)</label>
                <input
                  type="text"
                  value={form.ref}
                  onChange={(e) => setForm((f) => ({ ...f, ref: e.target.value }))}
                  placeholder="Cheque #, reference"
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={closeModal}
                className="min-h-[44px] rounded border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50 sm:min-h-0"
              >
                Cancel
              </button>
              {!editingId && (
                <button
                  onClick={() => void saveEntry(true)}
                  disabled={saving}
                  className="min-h-[44px] rounded bg-gray-200 px-4 py-2 font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-60 sm:min-h-0"
                >
                  Save & Add another
                </button>
              )}
              <button
                onClick={() => void saveEntry()}
                disabled={saving}
                className={`min-h-[44px] rounded px-4 py-2 font-medium text-white sm:min-h-0 ${
                  modalOpen === 'income' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                } disabled:opacity-60`}
              >
                {saving ? 'Saving…' : editingId ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer between accounts */}
      {transferOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setTransferOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-lg font-semibold text-gray-900">Transfer between accounts</h3>
            <p className="mb-4 text-sm text-gray-600">
              Records the money leaving one account and arriving in the other. It is not income or expense.
            </p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">From</label>
                  <select
                    value={transferForm.from}
                    onChange={(e) => {
                      const from = e.target.value as CashbookAccount
                      setTransferForm((f) => ({
                        ...f,
                        from,
                        to: from === f.to ? (from === 'westline' ? 'service_station' : 'westline') : f.to
                      }))
                    }}
                    className="w-full rounded border border-gray-300 px-3 py-2"
                  >
                    {CASHBOOK_ACCOUNTS.map((acct) => (
                      <option key={acct} value={acct}>
                        {CASHBOOK_ACCOUNT_INFO[acct].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">To</label>
                  <select
                    value={transferForm.to}
                    onChange={(e) => {
                      const to = e.target.value as CashbookAccount
                      setTransferForm((f) => ({
                        ...f,
                        to,
                        from: to === f.from ? (to === 'westline' ? 'service_station' : 'westline') : f.from
                      }))
                    }}
                    className="w-full rounded border border-gray-300 px-3 py-2"
                  >
                    {CASHBOOK_ACCOUNTS.map((acct) => (
                      <option key={acct} value={acct}>
                        {CASHBOOK_ACCOUNT_INFO[acct].label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
                <input
                  type="date"
                  value={transferForm.date}
                  onChange={(e) => setTransferForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={transferForm.amount || ''}
                  onChange={(e) => setTransferForm((f) => ({ ...f, amount: Number(e.target.value) || 0 }))}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Ref (optional)</label>
                <input
                  type="text"
                  value={transferForm.ref}
                  onChange={(e) => setTransferForm((f) => ({ ...f, ref: e.target.value }))}
                  placeholder="EFT reference"
                  className="w-full rounded border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Note (optional)</label>
                <input
                  type="text"
                  value={transferForm.note}
                  onChange={(e) => setTransferForm((f) => ({ ...f, note: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                />
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => setTransferOpen(false)}
                className="min-h-[44px] rounded border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50 sm:min-h-0"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveTransfer()}
                disabled={saving}
                className="min-h-[44px] rounded bg-slate-700 px-4 py-2 font-medium text-white hover:bg-slate-800 disabled:opacity-60 sm:min-h-0"
              >
                {saving ? 'Saving…' : 'Record transfer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate confirmation modal */}
      {duplicateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDuplicateModal(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-amber-800 mb-2">Possible duplicate</h3>
            <p className="text-sm text-gray-600 mb-4">
              An entry with the same date, type, and amount already exists. Is this a different transaction?
            </p>
            <ul className="mb-4 space-y-2 text-sm">
              {duplicateModal.matches.map((m) => (
                <li key={m.id} className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span>
                    {m.date} · {m.category} · {m.description}
                  </span>
                  <span className="font-medium">${formatCurrency(m.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => setDuplicateModal(null)}
                className="min-h-[44px] rounded border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50 sm:min-h-0"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleDeleteDuplicate(
                  duplicateModal.matches[0].id,
                  duplicateModal.payload,
                  duplicateModal.addAnother
                )}
                disabled={saving}
                className="min-h-[44px] rounded border border-red-300 px-4 py-2 font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 sm:min-h-0"
              >
                Delete existing & save new
              </button>
              <button
                onClick={() => void performSaveWithForce(duplicateModal.payload, duplicateModal.addAnother)}
                disabled={saving}
                className="min-h-[44px] rounded bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 disabled:opacity-60 sm:min-h-0"
              >
                Continue anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
