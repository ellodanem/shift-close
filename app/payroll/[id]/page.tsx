'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { payPeriodCycleNumber } from '@/lib/pay-cycle'
import { DEFAULT_OVERTIME_MULTIPLIER, loadOvertimeMultiplier, loadPayslipCompany } from '@/lib/payroll-settings'
import { PayrollSettingsButton } from '@/app/payroll/PayrollSettingsButton'
import { buildBankingPack } from '@/lib/pay-run-banking'
import { downloadBankingPackExcel } from '@/lib/pay-run-banking-excel'
import { printBankingPack } from '@/lib/pay-run-banking-print'
import {
  creditUnionLetters,
  cuLetterEmailBody,
  cuLetterEmailHtml,
  cuLetterSubject,
  defaultCreditUnionLetterText
} from '@/lib/pay-run-cu-letter'
import {
  CreditUnionLetterDialog,
  type CreditUnionLetterDraft
} from '@/app/components/CreditUnionLetterDialog'
import {
  downloadPayrollPreview,
  payrollPreviewStatus,
  printGlReport,
  printNisReport,
  printPayrollPreview,
  printPayslips,
  type PayrollPreviewInput,
  type PayrollPreviewLine,
  type PayslipPrintInput
} from '@/lib/payroll-print'
import {
  amountForLabel,
  buildDeductionLines,
  buildExtraLines,
  categoryLabelTaken,
  defaultPayrollCategories,
  hoursForLabel,
  loadPayrollCategories,
  newPayrollCategory,
  savePayrollCategories,
  type CategoryKind,
  type PayrollCategory
} from '@/lib/payroll-categories'
import {
  computeGrossPay,
  formatMoney,
  parseMoney,
  parsePayType,
  salarySkipped,
  type PayRunExtraLine
} from '@/lib/pay-run'

type PayRunLine = {
  id: string
  staffId: string | null
  staffName: string
  staffNo: string | null
  payType: string
  basicHours: number
  otHours: number
  hourlyRate: number
  salariedAmount: number
  extraLines: PayRunExtraLine[]
  extraDeductions: PayRunExtraLine[]
  basicPay: number
  otPay: number
  extraPay: number
  grossPay: number
  shortageReady: number
  nisEmployee: number
  ytd?: {
    basicPay: number
    otPay: number
    extraPay: number
    grossPay: number
    nisEmployee: number
    staffLoan: number
    medical: number
    shortageReady: number
    extraDeductionPay: number
    totalDeductions: number
    netPay: number
  }
  nisEmployer: number
  staffLoan: number
  medical: number
  totalDeductions: number
  extraDeductionPay?: number
  netPay: number
  bankCode?: string
  bankName?: string | null
  accountNo?: string | null
  taxCode?: string
}

type PayRun = {
  id: string
  cycle: string
  cycleNumber: number
  status: string
  startDate: string
  endDate: string
  payDate: string
  voidedAt?: string | null
  voidReason?: string
  voidedByName?: string
  lines: PayRunLine[]
}

type Draft = {
  rate: string
  salary: string
  basicHours: string
  otHours: string
  extra: string
  paySalary: boolean
  shortage: string
  loan: string
  medical: string
  otherDeduction: string
  custom: Record<string, string>
}

function mdy(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return `${Number(m)}/${Number(d)}/${y}`
}

function moneyInput(value: number): string {
  return value ? String(value) : ''
}

function shownCycleNumber(cycleNumber: number, endDate: string): number {
  if (cycleNumber > 0) return cycleNumber
  return Number(payPeriodCycleNumber(endDate)) || 0
}

function payslipsFromRun(saved: PayRun): PayslipPrintInput {
  return {
    startDate: saved.startDate,
    endDate: saved.endDate,
    payDate: saved.payDate,
    cycleNumber: shownCycleNumber(saved.cycleNumber, saved.endDate),
    status: saved.status,
    voidReason: saved.voidReason,
    lines: saved.lines
  }
}

function previewFromRun(saved: PayRun): PayrollPreviewInput {
  return {
    startDate: saved.startDate,
    endDate: saved.endDate,
    payDate: saved.payDate,
    status: saved.status,
    voidReason: saved.voidReason,
    lines: saved.lines.map((line) => ({
      staffName: line.staffName,
      payType: line.payType,
      hours: parseMoney(line.basicHours) + parseMoney(line.otHours),
      grossPay: line.grossPay,
      netPay: line.netPay
    }))
  }
}

function draftFromLine(line: PayRunLine, categories: PayrollCategory[]): Draft {
  const custom: Record<string, string> = {}
  for (const category of categories) {
    if (category.builtin) continue
    if (category.kind === 'hours') {
      const hours = hoursForLabel(line.extraLines, category.label)
      custom[category.id] = hours ? String(hours) : ''
    } else if (category.kind === 'deduction') {
      custom[category.id] = moneyInput(amountForLabel(line.extraDeductions, category.label))
    } else {
      custom[category.id] = moneyInput(amountForLabel(line.extraLines, category.label))
    }
  }
  return {
    rate: String(line.hourlyRate || ''),
    salary: String(line.salariedAmount || ''),
    basicHours: line.basicHours ? String(line.basicHours) : '',
    otHours: line.otHours ? String(line.otHours) : '',
    extra: moneyInput(amountForLabel(line.extraLines, 'Extra')),
    paySalary: !salarySkipped(line.extraLines),
    shortage: moneyInput(line.shortageReady),
    loan: moneyInput(line.staffLoan),
    medical: moneyInput(line.medical),
    otherDeduction: moneyInput(amountForLabel(line.extraDeductions, 'Other')),
    custom
  }
}

function extraLinesFor(line: PayRunLine, draft: Draft, categories: PayrollCategory[]): PayRunExtraLine[] {
  const salaried = parsePayType(line.payType) === 'salaried'
  return buildExtraLines({
    existing: line.extraLines,
    extraAmount: parseMoney(draft.extra),
    hourlyRate: parseMoney(draft.rate),
    categories,
    values: draft.custom,
    salarySkipped: salaried && !draft.paySalary
  })
}

function shownYtd(savedYtd: number, savedCurrent: number, draftValue: string | undefined): number {
  if (draftValue === undefined) return savedYtd
  return savedYtd - savedCurrent + parseMoney(draftValue)
}

type DeductionKey = 'loan' | 'medical' | 'shortage' | 'otherDeduction'

const DETAIL_DEDUCTIONS: { key: DeductionKey; label: string; aria: string }[] = [
  { key: 'loan', label: 'Loan', aria: 'Loan' },
  { key: 'medical', label: 'Medical', aria: 'Medical' },
  { key: 'shortage', label: 'Shortage', aria: 'Shortage' },
  { key: 'otherDeduction', label: 'Other', aria: 'Other deduction' }
]

function deductionYtd(line: PayRunLine, key: DeductionKey, value: string | undefined): number {
  if (key === 'loan') return shownYtd(line.ytd?.staffLoan ?? line.staffLoan, line.staffLoan, value)
  if (key === 'medical') return shownYtd(line.ytd?.medical ?? line.medical, line.medical, value)
  if (key === 'shortage') {
    return shownYtd(line.ytd?.shortageReady ?? line.shortageReady, line.shortageReady, value)
  }
  return shownYtd(line.ytd?.extraDeductionPay ?? line.extraDeductionPay ?? 0, line.extraDeductionPay ?? 0, value)
}

function deductionLines(line: PayRunLine, draft: Draft, categories: PayrollCategory[]): PayRunExtraLine[] {
  return buildDeductionLines({
    existing: line.extraDeductions,
    otherAmount: parseMoney(draft.otherDeduction),
    categories,
    values: draft.custom
  })
}

function HoursField({
  value,
  disabled,
  onChange,
  label
}: {
  value: string
  disabled: boolean
  onChange: (value: string) => void
  label: string
}) {
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-20 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-right text-sm tabular-nums disabled:opacity-60"
    />
  )
}

export default function PayrollRunPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [run, setRun] = useState<PayRun | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [payDate, setPayDate] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [cycleNumber, setCycleNumber] = useState('')
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [periodDraft, setPeriodDraft] = useState<{
    startDate: string
    endDate: string
    payDate: string
    cycleNumber: string
  } | null>(null)
  const [details, setDetails] = useState(false)
  const [categories, setCategories] = useState<PayrollCategory[]>(defaultPayrollCategories)
  const [typesOpen, setTypesOpen] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeKind, setNewTypeKind] = useState<CategoryKind>('money')
  const [loading, setLoading] = useState(true)
  const [otMultiplier, setOtMultiplier] = useState(DEFAULT_OVERTIME_MULTIPLIER)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rateLineId, setRateLineId] = useState<string | null>(null)
  const [rateValue, setRateValue] = useState('')
  const [taxCode, setTaxCode] = useState('')
  const [medicalValue, setMedicalValue] = useState('')
  const [rateScope, setRateScope] = useState<'run' | 'future'>('run')
  const [voidOpen, setVoidOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [preview, setPreview] = useState<PayrollPreviewInput | null>(null)
  const [openingPreview, setOpeningPreview] = useState(false)
  const [cuDraft, setCuDraft] = useState<CreditUnionLetterDraft | null>(null)
  const [cuError, setCuError] = useState<string | null>(null)
  const [cuSent, setCuSent] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/pay-runs/${id}`, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Failed to load payroll')
    const next = data as PayRun
    setRun(next)
    setPayDate(next.payDate)
    setStartDate(next.startDate)
    setEndDate(next.endDate)
    setCycleNumber(String(shownCycleNumber(next.cycleNumber, next.endDate)))
    const seeded: Record<string, Draft> = {}
    const savedCategories = loadPayrollCategories()
    for (const line of next.lines) seeded[line.id] = draftFromLine(line, savedCategories)
    setDrafts(seeded)
    if (next.status === 'processed' || next.status === 'void') setStep(3)
    return next
  }, [id])

  useEffect(() => {
    setLoading(true)
    load()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load payroll'))
      .finally(() => setLoading(false))
  }, [load])

  useEffect(() => {
    setCategories(loadPayrollCategories())
  }, [])

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      void loadOvertimeMultiplier().then((multiplier) => {
        if (!cancelled) setOtMultiplier(multiplier)
      })
    }
    refresh()
    window.addEventListener('payroll-settings-saved', refresh)
    return () => {
      cancelled = true
      window.removeEventListener('payroll-settings-saved', refresh)
    }
  }, [])

  const locked = run?.status === 'processed' || run?.status === 'void'
  const voided = run?.status === 'void'
  const hourly = (run?.lines ?? []).filter((line) => parsePayType(line.payType) === 'hourly')
  const salaried = (run?.lines ?? []).filter((line) => parsePayType(line.payType) === 'salaried')

  const grossFor = useCallback(
    (line: PayRunLine) => {
      const draft = drafts[line.id]
      if (!draft || locked) return line.grossPay
      return computeGrossPay({
        payType: line.payType,
        basicHours: parseMoney(draft.basicHours),
        otHours: parseMoney(draft.otHours),
        hourlyRate: parseMoney(draft.rate),
        salariedAmount: parseMoney(draft.salary),
        extraLines: extraLinesFor(line, draft, categories),
        otMultiplier
      }).grossPay
    },
    [drafts, categories, locked, otMultiplier]
  )

  const patchDraft = (lineId: string, patch: Partial<Draft>) => {
    setDrafts((current) => ({ ...current, [lineId]: { ...current[lineId], ...patch } }))
  }

  const persist = async (header?: {
    payDate: string
    startDate: string
    endDate: string
    cycleNumber: string
  }) => {
    if (!run) return null
    const nextPayDate = header?.payDate ?? payDate
    const nextStart = header?.startDate ?? startDate
    const nextEnd = header?.endDate ?? endDate
    const nextCycle = header?.cycleNumber ?? cycleNumber
    const res = await fetch(`/api/pay-runs/${run.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payDate: nextPayDate,
        startDate: nextStart,
        endDate: nextEnd,
        cycleNumber: Number(nextCycle),
        lines: run.lines.map((line) => {
          const draft = drafts[line.id] ?? draftFromLine(line, categories)
          return {
            id: line.id,
            basicHours: parseMoney(draft.basicHours),
            otHours: parseMoney(draft.otHours),
            hourlyRate: parseMoney(draft.rate),
            salariedAmount: parseMoney(draft.salary),
            extraLines: extraLinesFor(line, draft, categories),
            extraDeductions: deductionLines(line, draft, categories),
            shortageReady: parseMoney(draft.shortage),
            staffLoan: parseMoney(draft.loan),
            medical: parseMoney(draft.medical)
          }
        })
      })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Failed to save payroll')
    setRun(data)
    if (typeof data.payDate === 'string') setPayDate(data.payDate)
    if (typeof data.startDate === 'string') setStartDate(data.startDate)
    if (typeof data.endDate === 'string') setEndDate(data.endDate)
    if (typeof data.cycleNumber === 'number') {
      setCycleNumber(String(shownCycleNumber(data.cycleNumber, data.endDate || endDate)))
    }
    const seeded: Record<string, Draft> = {}
    for (const line of data.lines as PayRunLine[]) seeded[line.id] = draftFromLine(line, categories)
    setDrafts(seeded)
    return data as PayRun
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await persist()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save payroll')
    } finally {
      setBusy(false)
    }
  }

  const openPeriod = () => {
    if (!run || locked) return
    setError(null)
    setPeriodDraft({
      startDate: run.startDate,
      endDate: run.endDate,
      payDate: run.payDate,
      cycleNumber: String(shownCycleNumber(run.cycleNumber, run.endDate))
    })
  }

  const savePeriod = async () => {
    if (!periodDraft) return
    if (!periodDraft.startDate || !periodDraft.endDate || periodDraft.startDate > periodDraft.endDate) {
      setError('Choose a pay range. The end date has to be on or after the start date.')
      return
    }
    const cycle = Number(periodDraft.cycleNumber)
    if (!Number.isInteger(cycle) || cycle < 1 || cycle > 53) {
      setError('Pay cycle must be a number from 1 to 53.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await persist(periodDraft)
      setPeriodDraft(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the pay period')
    } finally {
      setBusy(false)
    }
  }

  const continueToReview = async () => {
    setBusy(true)
    setError(null)
    try {
      await persist()
      setDetails(false)
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save payroll')
    } finally {
      setBusy(false)
    }
  }

  const approve = async () => {
    setBusy(true)
    setError(null)
    try {
      await persist()
      const res = await fetch(`/api/pay-runs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to approve payroll')
      setRun(data)
      setStep(3)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve payroll')
    } finally {
      setBusy(false)
    }
  }

  const deleteDraft = async () => {
    if (!window.confirm('Delete this draft? This cannot be undone.')) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/pay-runs/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to delete draft')
      router.push('/payroll')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete draft')
      setBusy(false)
    }
  }

  const voidPayroll = async () => {
    const reason = voidReason.trim()
    if (reason.length < 3) {
      setError('A reason is required to void a payroll.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/pay-runs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'void', reason })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to void payroll')
      setRun(data)
      setVoidOpen(false)
      setVoidReason('')
      setStep(3)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to void payroll')
    } finally {
      setBusy(false)
    }
  }

  const reloadHours = async () => {
    if (!window.confirm('Replace edited hours with the extracted attendance for this period?')) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/pay-runs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'recalc' })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to reload hours')
      setRun(data)
      const seeded: Record<string, Draft> = {}
      for (const line of data.lines as PayRunLine[]) seeded[line.id] = draftFromLine(line, categories)
      setDrafts(seeded)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reload hours')
    } finally {
      setBusy(false)
    }
  }

  const clearEntries = () => {
    setDrafts((current) => {
      const next = { ...current }
      for (const line of hourly) {
        const draft = next[line.id]
        if (!draft) continue
        next[line.id] = { ...draft, basicHours: '', otHours: '', extra: '', shortage: '', custom: {} }
      }
      for (const line of salaried) {
        const draft = next[line.id]
        if (!draft) continue
        next[line.id] = { ...draft, extra: '', custom: {} }
      }
      return next
    })
  }

  const openPayInfo = (lineId: string) => {
    if (!run || locked) return
    const line = run.lines.find((item) => item.id === lineId)
    const draft = drafts[lineId]
    if (!line || !draft) return
    const salariedLine = parsePayType(line.payType) === 'salaried'
    setRateLineId(line.id)
    setRateValue(salariedLine ? draft.salary : draft.rate)
    setTaxCode(line.taxCode || '')
    setMedicalValue(draft.medical)
    setRateScope('run')
    if (line.staffId && !line.taxCode) {
      fetch(`/api/staff/${line.staffId}`)
        .then(async (res) => (res.ok ? res.json() : null))
        .then((staff) => {
          const code = typeof staff?.taxCode === 'string' ? staff.taxCode : ''
          if (code) setTaxCode((current) => current || code)
        })
        .catch(() => undefined)
    }
  }

  const saveRate = async () => {
    if (!run || !rateLineId) return
    const line = run.lines.find((item) => item.id === rateLineId)
    if (!line) return
    const amount = parseMoney(rateValue)
    const code = taxCode.trim()
    const medical = parseMoney(medicalValue)
    const salariedLine = parsePayType(line.payType) === 'salaried'
    patchDraft(line.id, {
      ...(salariedLine ? { salary: String(amount) } : { rate: String(amount) }),
      medical: medical ? String(medical) : ''
    })
    setRun((current) =>
      current
        ? {
            ...current,
            lines: current.lines.map((item) =>
              item.id === line.id
                ? {
                    ...item,
                    hourlyRate: salariedLine ? item.hourlyRate : amount,
                    salariedAmount: salariedLine ? amount : item.salariedAmount,
                    medical,
                    taxCode: code
                  }
                : item
            )
          }
        : current
    )
    setRateLineId(null)
    setBusy(true)
    setError(null)
    try {
      const lineRes = await fetch(`/api/pay-runs/${run.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line: {
            id: line.id,
            taxCode: code,
            medical,
            ...(salariedLine ? { salariedAmount: amount } : { hourlyRate: amount })
          }
        })
      })
      const saved = await lineRes.json().catch(() => ({}))
      if (!lineRes.ok) {
        throw new Error(saved.error || 'Failed to save pay information')
      }
      const savedLine = Array.isArray(saved.lines)
        ? saved.lines.find((item: PayRunLine) => item.id === line.id)
        : null
      if (savedLine) {
        setRun((current) =>
          current
            ? { ...current, lines: current.lines.map((item) => (item.id === line.id ? savedLine : item)) }
            : current
        )
      }
      if (rateScope === 'future' && line.staffId) {
        const res = await fetch(`/api/staff/${line.staffId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(salariedLine ? { salariedAmount: amount } : { hourlyRate: amount }),
            taxCode: code,
            medicalAmount: medical
          })
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to update future pay')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save pay information')
    } finally {
      setBusy(false)
    }
  }

  const banking = useMemo(
    () =>
      buildBankingPack(
        (run?.lines ?? []).map((line) => ({
          staffName: line.staffName,
          staffNo: line.staffNo,
          bankCode: line.bankCode,
          bankName: line.bankName,
          accountNo: line.accountNo,
          netPay: line.netPay
        }))
      ),
    [run]
  )
  const letters = useMemo(() => creditUnionLetters(banking), [banking])

  const sendCuEmail = async () => {
    if (!run || !cuDraft) return
    if (!cuDraft.to.trim()) {
      setCuError('Enter the credit union email address.')
      return
    }
    setBusy(true)
    setCuError(null)
    setError(null)
    try {
      const res = await fetch(`/api/pay-runs/${run.id}/cu-letter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: cuDraft.to.trim(),
          code: cuDraft.code,
          subject: cuDraft.subject,
          html: cuLetterEmailHtml(cuDraft.message),
          letterText: cuDraft.letterText
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to email the letter')
      setCuSent(`Sent the ${cuDraft.code} letter.`)
      setCuDraft(null)
    } catch (err) {
      setCuError(err instanceof Error ? err.message : 'Failed to email the letter')
    } finally {
      setBusy(false)
    }
  }

  const sumHours = (lines: PayRunLine[], field: 'basicHours' | 'otHours') =>
    lines.reduce((sum, line) => sum + parseMoney(drafts[line.id]?.[field] ?? ''), 0)
  const sumExtra = (lines: PayRunLine[]) =>
    lines.reduce((sum, line) => sum + parseMoney(drafts[line.id]?.extra ?? ''), 0)
  const sumMedical = (lines: PayRunLine[]) =>
    lines.reduce((sum, line) => sum + parseMoney(drafts[line.id]?.medical ?? ''), 0)
  const sumGross = (lines: PayRunLine[]) => lines.reduce((sum, line) => sum + grossFor(line), 0)
  const hourlyColumns = categories.filter((category) => category.enabled)
  const salariedColumns = hourlyColumns.filter((category) => category.kind !== 'hours')

  const updateCategories = (next: PayrollCategory[]) => {
    setCategories(next)
    savePayrollCategories(next)
  }

  const toggleCategory = (id: string) => {
    if (id === 'basic') return
    updateCategories(
      categories.map((category) => (category.id === id ? { ...category, enabled: !category.enabled } : category))
    )
  }

  const addCategory = () => {
    const label = newTypeName.trim()
    if (!label) return
    if (categoryLabelTaken(categories, label)) {
      setError('That hours or money type is already on the list.')
      return
    }
    updateCategories([...categories, newPayrollCategory(label, newTypeKind)])
    setNewTypeName('')
    setError(null)
  }

  const removeCategory = (id: string) => {
    const category = categories.find((item) => item.id === id)
    if (!category || category.builtin) return
    updateCategories(categories.filter((item) => item.id !== id))
    setRun((current) =>
      current
        ? {
            ...current,
            lines: current.lines.map((line) => ({
              ...line,
              extraLines:
                category.kind === 'deduction'
                  ? line.extraLines
                  : line.extraLines.filter((item) => item.label !== category.label),
              extraDeductions:
                category.kind === 'deduction'
                  ? line.extraDeductions.filter((item) => item.label !== category.label)
                  : line.extraDeductions
            }))
          }
        : current
    )
  }

  const categoryValue = (draft: Draft, category: PayrollCategory) => {
    if (category.id === 'basic') return draft.basicHours
    if (category.id === 'ot') return draft.otHours
    if (category.id === 'extra') return draft.extra
    if (category.id === 'medical') return draft.medical
    if (category.id === 'shortage') return draft.shortage
    return draft.custom?.[category.id] ?? ''
  }

  const setCategoryValue = (lineId: string, draft: Draft, category: PayrollCategory, value: string) => {
    if (category.id === 'basic') patchDraft(lineId, { basicHours: value })
    else if (category.id === 'ot') patchDraft(lineId, { otHours: value })
    else if (category.id === 'extra') patchDraft(lineId, { extra: value })
    else if (category.id === 'medical') patchDraft(lineId, { medical: value })
    else if (category.id === 'shortage') patchDraft(lineId, { shortage: value })
    else patchDraft(lineId, { custom: { ...(draft.custom ?? {}), [category.id]: value } })
  }

  const categoryTotal = (lines: PayRunLine[], category: PayrollCategory) => {
    if (category.id === 'basic') return sumHours(lines, 'basicHours').toFixed(2)
    if (category.id === 'ot') return sumHours(lines, 'otHours').toFixed(2)
    if (category.kind === 'hours') {
      return lines.reduce((sum, line) => sum + parseMoney(drafts[line.id]?.custom?.[category.id]), 0).toFixed(2)
    }
    if (category.id === 'extra') return formatMoney(sumExtra(lines))
    if (category.id === 'medical') return formatMoney(sumMedical(lines))
    if (category.id === 'shortage') {
      return formatMoney(lines.reduce((sum, line) => sum + parseMoney(drafts[line.id]?.shortage), 0))
    }
    return formatMoney(lines.reduce((sum, line) => sum + parseMoney(drafts[line.id]?.custom?.[category.id]), 0))
  }

  const openPreview = async () => {
    if (!run) return
    setBusy(true)
    setOpeningPreview(true)
    setError(null)
    try {
      const saved = locked ? run : await persist()
      if (!saved) return
      setPreview(previewFromRun(saved))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build the preview')
    } finally {
      setBusy(false)
      setOpeningPreview(false)
    }
  }

  const openNis = () => {
    if (!run) return
    printNisReport({
      startDate: run.startDate,
      endDate: run.endDate,
      cycle: String(shownCycleNumber(run.cycleNumber, run.endDate)),
      voided: run.status === 'void',
      lines: run.lines.map((line) => ({
        staffName: line.staffName,
        staffNo: line.staffNo,
        nisEmployee: line.nisEmployee,
        nisEmployer: line.nisEmployer,
        grossPay: line.grossPay
      }))
    })
  }

  const rateLine = run?.lines.find((line) => line.id === rateLineId) ?? null

  if (loading) {
    return <p className="p-8 text-sm text-slate-500">Loading payroll…</p>
  }
  if (!run) {
    return <p className="p-8 text-sm text-red-700">{error || 'Payroll not found.'}</p>
  }

  return (
    <div className="min-h-full bg-white">
      <div className="mx-auto max-w-6xl px-6 py-8 pb-28">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Pay employees</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
              <span>
                Cycle {shownCycleNumber(run.cycleNumber, run.endDate)} · {mdy(run.startDate)} – {mdy(run.endDate)} · Pay{' '}
                {mdy(run.payDate)}
              </span>
              {locked ? null : (
                <button
                  type="button"
                  onClick={openPeriod}
                  className="font-medium text-violet-700 hover:text-violet-900"
                >
                  Edit
                </button>
              )}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <PayrollSettingsButton />
            {run.status === 'draft' ? (
              <button
                type="button"
                onClick={deleteDraft}
                disabled={busy}
                className="text-sm font-medium text-red-700 hover:text-red-900 disabled:opacity-40"
              >
                Delete draft
              </button>
            ) : null}
            {run.status === 'processed' ? (
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setVoidOpen(true)
                }}
                disabled={busy}
                className="text-sm font-medium text-red-700 hover:text-red-900 disabled:opacity-40"
              >
                Void payroll
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => router.push('/payroll')}
              className="text-sm font-medium text-violet-700 hover:text-violet-900"
            >
              All payroll
            </button>
          </div>
        </div>

        <ol className="mb-8 grid grid-cols-3 border-b border-slate-200">
          {(['Enter payroll', 'Approve payroll', 'Print'] as const).map((label, index) => {
            const n = (index + 1) as 1 | 2 | 3
            const active = step === n
            return (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => {
                    if (n === 3 && !locked) return
                    setStep(n)
                  }}
                  disabled={n === 3 && !locked}
                  className={`w-full pb-3 text-left text-sm disabled:cursor-default ${
                    active ? 'border-b-2 border-violet-700 font-semibold text-slate-900' : 'text-slate-400'
                  }`}
                >
                  {n}. {label}
                </button>
              </li>
            )
          })}
        </ol>

        {error ? (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        {step === 1 ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Enter hours and money</h2>
              <span className="group relative inline-flex">
                <button
                  type="button"
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-xs font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-700"
                  aria-label="About hours and money"
                >
                  ?
                </button>
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-0 top-full z-20 mt-1 w-80 max-w-[min(20rem,calc(100vw-2rem))] whitespace-normal rounded-md bg-slate-900 px-2.5 py-1.5 text-left text-xs font-medium leading-snug text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  Basic and OT hours are filled from extracted attendance. Click a name to change the pay rate, tax code,
                  and medical. Use Hours & money types to add or remove columns.
                </span>
              </span>
              <button
                type="button"
                onClick={() => setTypesOpen(true)}
                className="rounded-md border border-violet-200 bg-violet-50 px-3 py-1 text-sm font-medium text-violet-800 hover:bg-violet-100"
              >
                Hours & money types
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-bold uppercase tracking-wide text-slate-900">
                    <th className="py-2 pr-3 font-bold">Hourly employees</th>
                    <th className="py-2 pr-3 font-bold">Hourly rate</th>
                    {hourlyColumns.map((category) => (
                      <th key={category.id} className="py-2 pr-3 text-right font-bold">
                        {category.label}
                      </th>
                    ))}
                    <th className="py-2 text-right font-bold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {hourly.length === 0 ? (
                    <tr>
                      <td colSpan={hourlyColumns.length + 3} className="py-4 text-slate-500">
                        No hourly staff for this pay period.
                      </td>
                    </tr>
                  ) : (
                    hourly.map((line) => {
                      const draft = drafts[line.id]
                      if (!draft) return null
                      return (
                        <tr key={line.id} className="border-b border-slate-100">
                          <td className="py-3 pr-3">
                            <button
                              type="button"
                              disabled={locked}
                              onClick={() => openPayInfo(line.id)}
                              className="text-left font-semibold text-violet-700 underline decoration-violet-200 underline-offset-2 hover:decoration-violet-700 disabled:cursor-default disabled:text-slate-800 disabled:no-underline"
                            >
                              {line.staffName}
                            </button>
                            {line.taxCode ? (
                              <p className="text-xs text-slate-500">Tax code {line.taxCode}</p>
                            ) : null}
                          </td>
                          <td className="py-3 pr-3 tabular-nums text-slate-700">{formatMoney(parseMoney(draft.rate))}</td>
                          {hourlyColumns.map((category) => (
                            <td key={category.id} className="py-3 pr-3 text-right">
                              <HoursField
                                label={`${category.label} for ${line.staffName}`}
                                value={categoryValue(draft, category)}
                                disabled={Boolean(locked)}
                                onChange={(value) => setCategoryValue(line.id, draft, category, value)}
                              />
                            </td>
                          ))}
                          <td className="py-3 text-right font-medium tabular-nums">{formatMoney(grossFor(line))}</td>
                        </tr>
                      )
                    })
                  )}
                  <tr className="text-emerald-700">
                    <td className="py-3 font-semibold" colSpan={2}>
                      Hourly employee totals
                    </td>
                    {hourlyColumns.map((category) => (
                      <td key={category.id} className="py-3 pr-3 text-right font-semibold tabular-nums">
                        {categoryTotal(hourly, category)}
                      </td>
                    ))}
                    <td className="py-3 text-right font-semibold tabular-nums">{formatMoney(sumGross(hourly))}</td>
                  </tr>
                </tbody>
              </table>

              <table className="mt-8 w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-bold uppercase tracking-wide text-slate-900">
                    <th className="py-2 pr-3 font-bold">Salaried employees</th>
                    <th className="py-2 pr-3 font-bold">Pay salary</th>
                    <th className="py-2 pr-3 font-bold">Salary</th>
                    {salariedColumns.map((category) => (
                      <th key={category.id} className="py-2 pr-3 text-right font-bold">
                        {category.label}
                      </th>
                    ))}
                    <th className="py-2 text-right font-bold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {salaried.length === 0 ? (
                    <tr>
                      <td colSpan={salariedColumns.length + 4} className="py-4 text-slate-500">
                        No salaried staff for this pay period.
                      </td>
                    </tr>
                  ) : (
                    salaried.map((line) => {
                      const draft = drafts[line.id]
                      if (!draft) return null
                      return (
                        <tr key={line.id} className="border-b border-slate-100">
                          <td className="py-3 pr-3">
                            <button
                              type="button"
                              disabled={locked}
                              onClick={() => openPayInfo(line.id)}
                              className="text-left font-semibold text-violet-700 underline decoration-violet-200 underline-offset-2 hover:decoration-violet-700 disabled:cursor-default disabled:text-slate-800 disabled:no-underline"
                            >
                              {line.staffName}
                            </button>
                            {line.taxCode ? (
                              <p className="text-xs text-slate-500">Tax code {line.taxCode}</p>
                            ) : null}
                          </td>
                          <td className="py-3 pr-3">
                            <label className="inline-flex items-center gap-2 text-slate-700">
                              <input
                                type="checkbox"
                                checked={draft.paySalary}
                                disabled={locked}
                                onChange={(e) => patchDraft(line.id, { paySalary: e.target.checked })}
                              />
                              Pay salary
                            </label>
                          </td>
                          <td className="py-3 pr-3 tabular-nums text-slate-700">
                            {formatMoney(parseMoney(draft.salary))}
                          </td>
                          {salariedColumns.map((category) => (
                            <td key={category.id} className="py-3 pr-3 text-right">
                              <HoursField
                                label={`${category.label} for ${line.staffName}`}
                                value={categoryValue(draft, category)}
                                disabled={Boolean(locked)}
                                onChange={(value) => setCategoryValue(line.id, draft, category, value)}
                              />
                            </td>
                          ))}
                          <td className="py-3 text-right font-medium tabular-nums">{formatMoney(grossFor(line))}</td>
                        </tr>
                      )
                    })
                  )}
                  <tr className="text-emerald-700">
                    <td className="py-3 font-semibold" colSpan={3}>
                      Salaried employee totals
                    </td>
                    {salariedColumns.map((category) => (
                      <td key={category.id} className="py-3 pr-3 text-right font-semibold tabular-nums">
                        {categoryTotal(salaried, category)}
                      </td>
                    ))}
                    <td className="py-3 text-right font-semibold tabular-nums">{formatMoney(sumGross(salaried))}</td>
                  </tr>
                </tbody>
              </table>

              <div className="mt-6 flex min-w-[760px] items-center justify-between gap-4 border-t-2 border-emerald-700 pt-3">
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Gross pay</p>
                  <p className="text-xs text-slate-500">Hourly and salaried staff</p>
                </div>
                <p className="text-sm font-semibold tabular-nums text-emerald-800">
                  {formatMoney(sumGross(hourly) + sumGross(salaried))}
                </p>
              </div>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <ReviewStep
            run={run}
            details={details}
            drafts={drafts}
            onToggleDetails={() => setDetails((value) => !value)}
            onDraft={patchDraft}
            onEditName={openPayInfo}
            locked={Boolean(locked)}
          />
        ) : null}

        {step === 3 ? (
          <div>
            {voided ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                <p className="font-semibold">This payroll is voided.</p>
                <p className="mt-1">
                  {run.voidedByName || 'Someone'}
                  {run.voidedAt ? ` on ${new Date(run.voidedAt).toLocaleString()}` : ''}.
                </p>
                <p className="mt-1">Reason: {run.voidReason || '—'}</p>
                <p className="mt-2 text-red-800">
                  The amounts stay on record and no longer count toward N.I.S. You can start a new payroll for this period.
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                This payroll is approved. Pay period {mdy(run.startDate)} – {mdy(run.endDate)} · Pay date {mdy(run.payDate)}.
              </div>
            )}
            <h2 className="mt-8 text-lg font-semibold text-slate-900">What would you like to do next?</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    const company = await loadPayslipCompany()
                    if (
                      !printPayslips({
                        ...payslipsFromRun(run),
                        companyName: company.companyName,
                        companyAddress: company.address,
                        companyPhone: company.phone
                      })
                    ) {
                      setError('Allow pop-ups to print these payslips.')
                    }
                  })()
                }}
                className="rounded-md border border-violet-700 px-4 py-2 text-sm font-semibold text-violet-700"
              >
                Print Payslips
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!printGlReport(payslipsFromRun(run))) {
                    setError('Allow pop-ups to print the G/L summary.')
                  }
                }}
                className="rounded-md border border-violet-700 px-4 py-2 text-sm font-semibold text-violet-700"
              >
                Print GL
              </button>
              <button type="button" onClick={openNis} className="text-sm font-medium text-violet-700 hover:underline">
                N.I.S. report
              </button>
              <button
                type="button"
                onClick={() => printBankingPack(banking, run.payDate)}
                className="text-sm font-medium text-violet-700 hover:underline"
              >
                Print banking pack
              </button>
              <button
                type="button"
                onClick={() => downloadBankingPackExcel(banking, run.payDate)}
                className="text-sm font-medium text-violet-700 hover:underline"
              >
                Download banking pack
              </button>
              {letters.map((letter) => (
                <button
                  key={letter.code}
                  type="button"
                  onClick={() => {
                    setCuError(null)
                    setCuSent(null)
                    setCuDraft({
                      code: letter.code,
                      to: '',
                      subject: cuLetterSubject(letter, run.payDate),
                      message: cuLetterEmailBody(letter),
                      letterText: defaultCreditUnionLetterText(letter, run.payDate),
                      summary: `${letter.members.length} ${letter.members.length === 1 ? 'person' : 'people'} · ${formatMoney(letter.total)}`
                    })
                  }}
                  className="text-sm font-medium text-violet-700 hover:underline"
                >
                  Email {letter.code}
                </button>
              ))}
            </div>
            {cuSent ? <p className="mt-3 text-sm text-emerald-800">{cuSent}</p> : null}
            <p className="mt-6 text-sm text-slate-500">
              You can leave and open this payroll again. PAYE stays in Pay+.
            </p>
          </div>
        ) : null}
      </div>

      {step === 1 ? (
        <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 px-6 py-3">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={clearEntries}
                disabled={locked}
                className="rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-sm font-medium text-violet-900 hover:border-violet-300 hover:bg-violet-100 disabled:opacity-40"
              >
                Clear entries
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy || locked}
                className="rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-sm font-medium text-violet-900 hover:border-violet-300 hover:bg-violet-100 disabled:opacity-40"
              >
                Save entries
              </button>
              <button
                type="button"
                onClick={reloadHours}
                disabled={busy || locked}
                className="rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-sm font-medium text-violet-900 hover:border-violet-300 hover:bg-violet-100 disabled:opacity-40"
              >
                Reload hours from attendance
              </button>
            </div>
            <button
              type="button"
              onClick={continueToReview}
              disabled={busy}
              className="rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Continue'}
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="sticky bottom-0 border-t border-violet-100 bg-violet-50 px-6 py-3">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div className="flex gap-4 text-sm">
              <button type="button" onClick={() => setStep(1)} className="font-medium text-violet-700">
                Back to employees
              </button>
              <button
                type="button"
                onClick={openPreview}
                disabled={busy}
                className="font-medium text-violet-700 disabled:opacity-50"
              >
                {openingPreview ? 'Preparing…' : 'Download preview'}
              </button>
            </div>
            {locked ? null : (
              <button
                type="button"
                onClick={approve}
                disabled={busy}
                className="rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
              >
                {busy ? 'Approving…' : 'Approve payroll'}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {periodDraft ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Pay period</h2>
            <p className="mt-1 text-sm text-slate-500">
              Cycle, range, and pay date for this draft. A 1st–15th or 16th–end range pays semi-monthly staff.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Pay range start</span>
                <input
                  type="date"
                  value={periodDraft.startDate}
                  onChange={(e) =>
                    setPeriodDraft((current) => (current ? { ...current, startDate: e.target.value } : current))
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Pay range end</span>
                <input
                  type="date"
                  value={periodDraft.endDate}
                  onChange={(e) => {
                    const value = e.target.value
                    setPeriodDraft((current) => {
                      if (!current) return current
                      const cycleFollows = current.cycleNumber === payPeriodCycleNumber(current.endDate)
                      const payFollows = current.payDate === current.endDate
                      return {
                        ...current,
                        endDate: value,
                        cycleNumber: cycleFollows ? payPeriodCycleNumber(value) : current.cycleNumber,
                        payDate: payFollows ? value : current.payDate
                      }
                    })
                  }}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Pay cycle</span>
                <input
                  type="number"
                  min={1}
                  max={53}
                  value={periodDraft.cycleNumber}
                  onChange={(e) =>
                    setPeriodDraft((current) => (current ? { ...current, cycleNumber: e.target.value } : current))
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Pay date</span>
                <input
                  type="date"
                  value={periodDraft.payDate}
                  onChange={(e) =>
                    setPeriodDraft((current) => (current ? { ...current, payDate: e.target.value } : current))
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
            </div>
            {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setPeriodDraft(null)
                }}
                disabled={busy}
                className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={savePeriod}
                disabled={busy}
                className="rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {typesOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Hours and money types</h2>
            <p className="mt-2 text-sm text-slate-600">
              Choose which columns are on this payroll. Basic stays. Added hour columns are paid at the hourly rate.
              Removing a type drops it from this payroll when you save.
            </p>
            <ul className="mt-4 divide-y divide-slate-100">
              {categories.map((category) => (
                <li key={category.id} className="flex items-center justify-between gap-3 py-2">
                  <label className="flex items-center gap-2 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={category.enabled}
                      disabled={category.id === 'basic'}
                      onChange={() => toggleCategory(category.id)}
                    />
                    <span>{category.label}</span>
                    <span className="text-xs uppercase tracking-wide text-slate-400">{category.kind}</span>
                  </label>
                  {category.builtin ? null : (
                    <button
                      type="button"
                      onClick={() => removeCategory(category.id)}
                      className="text-sm font-medium text-red-700 hover:text-red-900"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <label className="block text-sm">
                <span className="font-medium text-slate-800">New type</span>
                <input
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  className="mt-1 w-48 rounded-md border border-slate-300 px-3 py-2"
                  placeholder="Commission"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Category</span>
                <select
                  value={newTypeKind}
                  onChange={(e) => setNewTypeKind(e.target.value as CategoryKind)}
                  className="mt-1 rounded-md border border-slate-300 px-3 py-2"
                >
                  <option value="hours">Hours</option>
                  <option value="money">Money</option>
                  <option value="deduction">Deduction</option>
                </select>
              </label>
              <button
                type="button"
                onClick={addCategory}
                disabled={!newTypeName.trim()}
                className="rounded-md bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
              >
                Add
              </button>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setTypesOpen(false)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {voidOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Void this payroll</h2>
            <p className="mt-2 text-sm text-slate-600">
              The paycheck amounts stay on file. They stop counting toward N.I.S., and you can run this period again. A
              reason is required.
            </p>
            <label className="mt-4 block text-sm">
              <span className="font-medium text-slate-800">Reason</span>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setVoidOpen(false)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={voidPayroll}
                disabled={busy || voidReason.trim().length < 3}
                className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
              >
                {busy ? 'Voiding…' : 'Void payroll'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {preview ? <PayrollPreviewModal preview={preview} onClose={() => setPreview(null)} /> : null}

      {rateLine && !locked ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Edit pay information for {rateLine.staffName}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-slate-800">
                  {parsePayType(rateLine.payType) === 'salaried' ? 'Salary' : 'Pay rate'}
                </span>
                <input
                  value={rateValue}
                  onChange={(e) => setRateValue(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Tax code</span>
                <input
                  value={taxCode}
                  onChange={(e) => setTaxCode(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  placeholder="Pay+ tax code"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Medical</span>
                <input
                  value={medicalValue}
                  onChange={(e) => setMedicalValue(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  placeholder="Medical insurance"
                />
              </label>
            </div>
            <fieldset className="mt-4 text-sm">
              <legend className="font-medium text-slate-800">Apply to</legend>
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="radio"
                  name="rate-scope"
                  checked={rateScope === 'run'}
                  onChange={() => setRateScope('run')}
                />
                Only this payroll
              </label>
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="radio"
                  name="rate-scope"
                  checked={rateScope === 'future'}
                  onChange={() => setRateScope('future')}
                />
                This payroll and future payrolls
              </label>
            </fieldset>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={saveRate}
                className="rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white"
              >
                Save pay information
              </button>
              <button type="button" onClick={() => setRateLineId(null)} className="text-sm text-slate-600">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <CreditUnionLetterDialog
        draft={cuDraft}
        busy={busy}
        error={cuError}
        onChange={setCuDraft}
        onClose={() => {
          setCuDraft(null)
          setCuError(null)
        }}
        onSend={sendCuEmail}
      />
    </div>
  )
}

function PayrollPreviewModal({ preview, onClose }: { preview: PayrollPreviewInput; onClose: () => void }) {
  const [printError, setPrintError] = useState<string | null>(null)
  const hourly = preview.lines.filter((line) => line.payType !== 'salaried')
  const salaried = preview.lines.filter((line) => line.payType === 'salaried')
  const hours = preview.lines.reduce((sum, line) => sum + (line.payType === 'salaried' ? 0 : line.hours), 0)
  const gross = preview.lines.reduce((sum, line) => sum + line.grossPay, 0)
  const net = preview.lines.reduce((sum, line) => sum + line.netPay, 0)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const print = () => {
    setPrintError(null)
    if (!printPayrollPreview(preview)) {
      setPrintError('Allow pop-ups to print this preview.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payroll-preview-title"
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="payroll-preview-title" className="text-lg font-semibold text-slate-900">
              Payroll preview
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Pay period {mdy(preview.startDate)} – {mdy(preview.endDate)} · Pay date {mdy(preview.payDate)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Close
          </button>
        </div>
        <div className="overflow-auto bg-slate-100 px-6 py-5">
          <div className="rounded-md border border-slate-200 bg-white px-6 py-5 shadow-sm">
            <p className="rounded-md bg-violet-50 px-4 py-3 text-sm text-slate-800">{payrollPreviewStatus(preview)}</p>
            <PreviewSection title="Hourly employees" lines={hourly} />
            <PreviewSection title="Salaried employees" lines={salaried} />
            <p className="mt-4 text-sm text-slate-800">
              <span className="font-semibold">Total hours</span> {hours.toFixed(2)} ·{' '}
              <span className="font-semibold">Gross</span> {formatMoney(gross)} ·{' '}
              <span className="font-semibold">Net</span> {formatMoney(net)}
            </p>
            <p className="mt-2 text-sm text-slate-500">PAYE is still calculated in Pay+.</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          {printError ? <p className="mr-auto text-sm text-red-700">{printError}</p> : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={print}
            className="rounded-md border border-violet-700 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50"
          >
            Print
          </button>
          <button
            type="button"
            onClick={() => downloadPayrollPreview(preview)}
            className="rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  )
}

function PreviewSection({ title, lines }: { title: string; lines: PayrollPreviewLine[] }) {
  if (lines.length === 0) return null
  const hours = lines.reduce((sum, line) => sum + (line.payType === 'salaried' ? 0 : line.hours), 0)
  const gross = lines.reduce((sum, line) => sum + line.grossPay, 0)
  const net = lines.reduce((sum, line) => sum + line.netPay, 0)
  return (
    <section className="mt-5">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 font-semibold">Name</th>
            <th className="py-2 text-right font-semibold">Total hours</th>
            <th className="py-2 text-right font-semibold">Gross pay</th>
            <th className="py-2 text-right font-semibold">Net pay</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={`${line.staffName}-${index}`} className="border-b border-slate-100">
              <td className="py-2">{line.staffName}</td>
              <td className="py-2 text-right tabular-nums">
                {line.payType === 'salaried' ? '—' : line.hours.toFixed(2)}
              </td>
              <td className="py-2 text-right tabular-nums">{formatMoney(line.grossPay)}</td>
              <td className="py-2 text-right tabular-nums">{formatMoney(line.netPay)}</td>
            </tr>
          ))}
          <tr className="bg-violet-50 font-semibold">
            <td className="py-2">Subtotal</td>
            <td className="py-2 text-right tabular-nums">{hours.toFixed(2)}</td>
            <td className="py-2 text-right tabular-nums">{formatMoney(gross)}</td>
            <td className="py-2 text-right tabular-nums">{formatMoney(net)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

function ReviewStep({
  run,
  details,
  drafts,
  onToggleDetails,
  onDraft,
  onEditName,
  locked
}: {
  run: PayRun
  details: boolean
  drafts: Record<string, Draft>
  onToggleDetails: () => void
  onDraft: (lineId: string, patch: Partial<Draft>) => void
  onEditName: (lineId: string) => void
  locked: boolean
}) {
  const [openDeductions, setOpenDeductions] = useState<Record<string, true>>({})
  const hourly = run.lines.filter((line) => parsePayType(line.payType) !== 'salaried')
  const salaried = run.lines.filter((line) => parsePayType(line.payType) === 'salaried')
  const hours = run.lines.reduce((sum, line) => sum + line.basicHours + line.otHours, 0)
  const gross = run.lines.reduce((sum, line) => sum + line.grossPay, 0)
  const net = run.lines.reduce((sum, line) => sum + line.netPay, 0)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">{details ? 'Payroll details' : 'Payroll summary'}</h2>
        <button type="button" onClick={onToggleDetails} className="text-sm font-medium text-violet-700 hover:underline">
          {details ? 'View summary' : 'View details'}
        </button>
      </div>
      <p className="mb-6 text-sm text-slate-600">
        Pay period {mdy(run.startDate)} – {mdy(run.endDate)} · Pay date {mdy(run.payDate)}. Net is gross minus employee
        NIS, loan, medical, shortage, and other deductions. Employer NIS is a memo. PAYE stays in Pay+. YTD is approved
        pay in {run.payDate.slice(0, 4)} through this pay date, including this payroll.
      </p>

      {details ? (
        <div className="space-y-10">
          {run.lines.map((line) => {
            const draft = drafts[line.id]
            const hiddenDeductions = locked
              ? []
              : DETAIL_DEDUCTIONS.filter((field) => {
                  const value = draft?.[field.key] ?? ''
                  const openKey = `${line.id}:${field.key}`
                  return !openDeductions[openKey] && parseMoney(value) === 0 && deductionYtd(line, field.key, value) === 0
                })
            return (
              <article key={line.id} className="border-b border-slate-200 pb-8">
                <header className="flex items-baseline justify-between gap-3">
                  <div>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => onEditName(line.id)}
                      className="text-left text-base font-semibold text-violet-700 underline decoration-violet-200 underline-offset-2 hover:decoration-violet-700 disabled:cursor-default disabled:text-slate-900 disabled:no-underline"
                    >
                      {line.staffName}
                    </button>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Pay type: {parsePayType(line.payType)}
                      {line.taxCode ? ` · Tax code ${line.taxCode}` : ''}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">
                    Pay date {mdy(run.payDate)} · {mdy(run.startDate)} – {mdy(run.endDate)}
                  </p>
                </header>
                <div className="mt-4 grid gap-6 md:grid-cols-2">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hours and earnings</h4>
                    <table className="mt-2 w-full text-sm">
                      <thead>
                        <tr className="text-xs uppercase tracking-wide text-slate-400">
                          <th className="py-1 text-left font-medium" />
                          <th className="py-1 text-right font-medium">Hours</th>
                          <th className="py-1 text-right font-medium">Amount</th>
                          <th className="py-1 text-right font-medium">YTD</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="py-1">Basic</td>
                          <td className="py-1 text-right tabular-nums">{line.basicHours.toFixed(2)}</td>
                          <td className="py-1 text-right tabular-nums">{formatMoney(line.basicPay)}</td>
                          <td className="py-1 text-right tabular-nums">{formatMoney(line.ytd?.basicPay ?? line.basicPay)}</td>
                        </tr>
                        <tr>
                          <td className="py-1">Overtime</td>
                          <td className="py-1 text-right tabular-nums">{line.otHours.toFixed(2)}</td>
                          <td className="py-1 text-right tabular-nums">{formatMoney(line.otPay)}</td>
                          <td className="py-1 text-right tabular-nums">{formatMoney(line.ytd?.otPay ?? line.otPay)}</td>
                        </tr>
                        <tr>
                          <td className="py-1">Extra</td>
                          <td />
                          <td className="py-1 text-right tabular-nums">{formatMoney(line.extraPay)}</td>
                          <td className="py-1 text-right tabular-nums">{formatMoney(line.ytd?.extraPay ?? line.extraPay)}</td>
                        </tr>
                        <tr className="font-semibold">
                          <td className="py-1">Gross pay</td>
                          <td />
                          <td className="py-1 text-right tabular-nums">{formatMoney(line.grossPay)}</td>
                          <td className="py-1 text-right tabular-nums">{formatMoney(line.ytd?.grossPay ?? line.grossPay)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Deductions</h4>
                    <table className="mt-2 w-full text-sm">
                      <thead>
                        <tr className="text-xs uppercase tracking-wide text-slate-400">
                          <th className="py-1 text-left font-medium" />
                          <th className="py-1 text-right font-medium">Amount</th>
                          <th className="py-1 text-right font-medium">YTD</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="py-1">NIS</td>
                          <td className="py-1 text-right tabular-nums">{formatMoney(line.nisEmployee)}</td>
                          <td className="py-1 text-right tabular-nums">{formatMoney(line.ytd?.nisEmployee ?? line.nisEmployee)}</td>
                        </tr>
                        {DETAIL_DEDUCTIONS.map((field) => {
                          const value = draft?.[field.key] ?? ''
                          const ytd = deductionYtd(line, field.key, value)
                          const openKey = `${line.id}:${field.key}`
                          const shown = Boolean(openDeductions[openKey]) || parseMoney(value) !== 0 || ytd !== 0
                          if (!shown) return null
                          return (
                            <tr key={field.key}>
                              <td className="py-1">{field.label}</td>
                              <td className="py-1 text-right">
                                <input
                                  aria-label={`${field.aria} for ${line.staffName}`}
                                  value={value}
                                  disabled={locked}
                                  onFocus={() => setOpenDeductions((current) => ({ ...current, [openKey]: true }))}
                                  onBlur={(e) => {
                                    const nextValue = e.currentTarget.value
                                    if (parseMoney(nextValue) !== 0 || deductionYtd(line, field.key, nextValue) !== 0) return
                                    setOpenDeductions((current) => {
                                      if (!current[openKey]) return current
                                      const next = { ...current }
                                      delete next[openKey]
                                      return next
                                    })
                                  }}
                                  onChange={(e) => onDraft(line.id, { [field.key]: e.target.value })}
                                  className="w-28 rounded border border-slate-200 px-2 py-1 text-right"
                                />
                              </td>
                              <td className="py-1 text-right tabular-nums">{formatMoney(ytd)}</td>
                            </tr>
                          )
                        })}
                        <tr className="font-semibold">
                          <td className="py-1">Total deductions</td>
                          <td className="py-1 text-right tabular-nums">{formatMoney(line.totalDeductions)}</td>
                          <td className="py-1 text-right tabular-nums">
                            {formatMoney(line.ytd?.totalDeductions ?? line.totalDeductions)}
                          </td>
                        </tr>
                        <tr className="font-semibold text-emerald-800">
                          <td className="py-1">Net pay</td>
                          <td className="py-1 text-right tabular-nums">{formatMoney(line.netPay)}</td>
                          <td className="py-1 text-right tabular-nums">{formatMoney(line.ytd?.netPay ?? line.netPay)}</td>
                        </tr>
                      </tbody>
                    </table>
                    {hiddenDeductions.length > 0 ? (
                      <p className="mt-2 flex flex-wrap gap-x-3 text-xs">
                        {hiddenDeductions.map((field) => (
                          <button
                            key={field.key}
                            type="button"
                            onClick={() => setOpenDeductions((current) => ({ ...current, [`${line.id}:${field.key}`]: true }))}
                            className="font-medium text-violet-700 hover:underline"
                          >
                            Add {field.label.toLowerCase()}
                          </button>
                        ))}
                      </p>
                    ) : null}
                    <p className="mt-3 text-xs text-slate-500">
                      Employer NIS {formatMoney(line.nisEmployer)} is not taken from net.
                      {line.bankCode ? ` Bank ${line.bankCode}` : ''}
                      {line.accountNo ? ` · ${line.accountNo}` : ''}
                    </p>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <SummaryTable
          hourly={hourly}
          salaried={salaried}
          hours={hours}
          gross={gross}
          net={net}
          onEditName={locked ? undefined : onEditName}
        />
      )}
    </div>
  )
}

function SummaryTable({
  hourly,
  salaried,
  hours,
  gross,
  net,
  onEditName
}: {
  hourly: PayRunLine[]
  salaried: PayRunLine[]
  hours: number
  gross: number
  net: number
  onEditName?: (lineId: string) => void
}) {
  const block = (title: string, lines: PayRunLine[]) => {
    const blockHours = lines.reduce((sum, line) => sum + line.basicHours + line.otHours, 0)
    const blockGross = lines.reduce((sum, line) => sum + line.grossPay, 0)
    const blockNet = lines.reduce((sum, line) => sum + line.netPay, 0)
    return (
      <>
        <tr>
          <td colSpan={4} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {title}
          </td>
        </tr>
        {lines.map((line) => (
          <tr key={line.id} className="border-b border-slate-100">
            <td className="py-2">
              {onEditName ? (
                <button
                  type="button"
                  onClick={() => onEditName(line.id)}
                  className="font-semibold text-violet-700 underline decoration-violet-200 underline-offset-2 hover:decoration-violet-700"
                >
                  {line.staffName}
                </button>
              ) : (
                line.staffName
              )}
              {line.taxCode ? <p className="text-xs font-normal text-slate-500">Tax code {line.taxCode}</p> : null}
            </td>
            <td className="py-2 text-right tabular-nums">
              {parsePayType(line.payType) === 'salaried' ? '—' : (line.basicHours + line.otHours).toFixed(2)}
            </td>
            <td className="py-2 text-right tabular-nums">{formatMoney(line.grossPay)}</td>
            <td className="py-2 text-right tabular-nums">{formatMoney(line.netPay)}</td>
          </tr>
        ))}
        <tr className="bg-violet-50 font-semibold">
          <td className="py-2">Subtotal</td>
          <td className="py-2 text-right tabular-nums">{blockHours ? blockHours.toFixed(2) : '—'}</td>
          <td className="py-2 text-right tabular-nums">{formatMoney(blockGross)}</td>
          <td className="py-2 text-right tabular-nums">{formatMoney(blockNet)}</td>
        </tr>
      </>
    )
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
          <th className="py-2 font-semibold">Name</th>
          <th className="py-2 text-right font-semibold">Total hours</th>
          <th className="py-2 text-right font-semibold">Gross pay</th>
          <th className="py-2 text-right font-semibold">Net pay</th>
        </tr>
      </thead>
      <tbody>
        {block('Hourly employees', hourly)}
        {block('Salaried employees', salaried)}
        <tr className="bg-violet-100 font-semibold">
          <td className="py-3">Total</td>
          <td className="py-3 text-right tabular-nums">{hours.toFixed(2)}</td>
          <td className="py-3 text-right tabular-nums">{formatMoney(gross)}</td>
          <td className="py-3 text-right tabular-nums">{formatMoney(net)}</td>
        </tr>
      </tbody>
    </table>
  )
}
