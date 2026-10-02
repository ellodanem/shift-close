'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { payPeriodCycleNumber } from '@/lib/pay-cycle'
import {
  attendanceForStaff,
  formatSickDays,
  payPeriodAttendanceFromRows,
  type PayPeriodAttendance
} from '@/lib/pay-period-rows'
import {
  DEFAULT_OVERTIME_MULTIPLIER,
  DEFAULT_VACATION_HOURS_PER_DAY,
  loadOvertimeMultiplier,
  loadPayslipCompany,
  loadVacationHoursPerDay
} from '@/lib/payroll-settings'
import { PayrollSettingsButton } from '@/app/payroll/PayrollSettingsButton'
import { buildBankingPack } from '@/lib/pay-run-banking'
import { downloadBankingPackExcel } from '@/lib/pay-run-banking-excel'
import { renderBankingPackHtml } from '@/lib/pay-run-banking-print'
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
import { PrintDocumentModal, type PrintDocumentPreview } from '@/app/payroll/PrintDocumentModal'
import {
  buildPayrollPreviewLine,
  downloadPayrollPreview,
  payrollPreviewStatus,
  previewBankAccountNote,
  printPayrollPreview,
  renderGlHtml,
  renderNisHtml,
  renderPayslipsHtml,
  type PayrollPreviewInput,
  type PayrollPreviewLine,
  type PayslipPrintInput
} from '@/lib/payroll-print'
import {
  amountForLabel,
  buildDeductionLines,
  buildExtraLines,
  categoryLabelTaken,
  isSickAliasLabel,
  listedPayrollCategories,
  sickDaysColumnEnabled,
  visiblePayrollColumns,
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
  visibleExtraLines,
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
  vacationDays?: number
  vacationHours?: number
  vacationPay?: number
  extraPay: number
  grossPay: number
  shortageReady: number
  nisEmployee: number
  paye?: number
  ytd?: {
    basicPay: number
    otPay: number
    vacationPay?: number
    extraPay: number
    grossPay: number
    nisEmployee: number
    staffLoan: number
    medical: number
    shortageReady: number
    extraDeductionPay: number
    paye?: number
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
  payPeriod?: { rows?: string | null } | null
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
  vacationDays: string
  extra: string
  shortage: string
  loan: string
  medical: string
  otherDeduction: string
  custom: Record<string, string>
  /** Extra labels left out of PAYE. */
  untaxedExtras: string[]
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
    lines: saved.lines.map((line) => buildPayrollPreviewLine(line))
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
    vacationDays: line.vacationDays ? String(line.vacationDays) : '',
    extra: moneyInput(amountForLabel(line.extraLines, 'Extra')),
    shortage: moneyInput(line.shortageReady),
    loan: moneyInput(line.staffLoan),
    medical: moneyInput(line.medical),
    otherDeduction: moneyInput(amountForLabel(line.extraDeductions, 'Other')),
    custom,
    untaxedExtras: visibleExtraLines(line.extraLines)
      .filter((extra) => extra.taxable === false)
      .map((extra) => extra.label)
  }
}

function extraLinesFor(line: PayRunLine, draft: Draft, categories: PayrollCategory[]): PayRunExtraLine[] {
  return buildExtraLines({
    existing: line.extraLines,
    extraAmount: parseMoney(draft.extra),
    hourlyRate: parseMoney(draft.rate),
    categories,
    values: draft.custom,
    untaxedLabels: draft.untaxedExtras ?? []
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

type PayrollEntryHeader = {
  payDate: string
  startDate: string
  endDate: string
  cycleNumber: string
}

function draftsFromRun(run: PayRun, categories: PayrollCategory[]): Record<string, Draft> {
  const seeded: Record<string, Draft> = {}
  for (const line of run.lines) seeded[line.id] = draftFromLine(line, categories)
  return seeded
}

function payrollEntryPayload(
  run: PayRun,
  drafts: Record<string, Draft>,
  categories: PayrollCategory[],
  header: PayrollEntryHeader
) {
  return {
    payDate: header.payDate,
    startDate: header.startDate,
    endDate: header.endDate,
    cycleNumber: Number(header.cycleNumber),
    lines: run.lines.map((line) => {
      const draft = drafts[line.id] ?? draftFromLine(line, categories)
      return {
        id: line.id,
        taxCode: line.taxCode || '',
        basicHours: parseMoney(draft.basicHours),
        otHours: parseMoney(draft.otHours),
        vacationDays: parseMoney(draft.vacationDays),
        hourlyRate: parseMoney(draft.rate),
        salariedAmount: parseMoney(draft.salary),
        extraLines: extraLinesFor(line, draft, categories),
        extraDeductions: deductionLines(line, draft, categories),
        shortageReady: parseMoney(draft.shortage),
        staffLoan: parseMoney(draft.loan),
        medical: parseMoney(draft.medical)
      }
    })
  }
}

function HoursField({
  value,
  disabled,
  readOnly,
  onChange,
  onBlur,
  label,
  roomy = false
}: {
  value: string
  disabled?: boolean
  readOnly?: boolean
  onChange: (value: string) => void
  onBlur?: () => void
  label: string
  roomy?: boolean
}) {
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={value}
      disabled={disabled}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className={
        roomy
          ? 'min-h-[44px] w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-right text-base tabular-nums read-only:cursor-default disabled:opacity-60'
          : 'w-20 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-right text-sm tabular-nums read-only:cursor-default disabled:opacity-60'
      }
    />
  )
}

function HelpTip({ label, children }: { label: string; children: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (ref.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-slate-300 text-xs font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-700 sm:h-5 sm:min-h-0 sm:w-5 sm:min-w-0"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        ?
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-20 mt-1 w-80 max-w-[min(20rem,calc(100vw-2rem))] whitespace-normal rounded-md bg-slate-900 px-2.5 py-1.5 text-left text-xs font-medium leading-snug text-white shadow-lg"
        >
          {children}
        </span>
      ) : null}
    </span>
  )
}

function CategoryControl({
  line,
  draft,
  category,
  locked,
  busy,
  roomy,
  attendanceText,
  categoryValue,
  onChange,
  onBlur
}: {
  line: PayRunLine
  draft: Draft
  category: PayrollCategory
  locked: boolean
  busy: boolean
  roomy?: boolean
  attendanceText: (line: PayRunLine, category: PayrollCategory) => string
  categoryValue: (draft: Draft, category: PayrollCategory) => string
  onChange: (value: string) => void
  onBlur: () => void
}) {
  if (category.id === 'vacation' && parsePayType(line.payType) === 'hourly') {
    return (
      <HoursField
        label={`Vacation days for ${line.staffName}`}
        value={draft.vacationDays}
        disabled={locked || busy}
        roomy={roomy}
        onBlur={onBlur}
        onChange={onChange}
      />
    )
  }
  if (category.id === 'sickDays') {
    return (
      <HoursField
        label={`SICK for ${line.staffName}`}
        value={attendanceText(line, category)}
        readOnly
        roomy={roomy}
        onChange={() => {}}
      />
    )
  }
  if (category.kind === 'attendance') {
    return (
      <span
        className={
          roomy
            ? 'flex min-h-[44px] items-center text-base tabular-nums text-slate-800'
            : 'inline-block min-w-20 px-2 py-1 text-sm tabular-nums text-slate-800'
        }
      >
        {attendanceText(line, category)}
      </span>
    )
  }
  return (
    <HoursField
      label={`${category.label} for ${line.staffName}`}
      value={categoryValue(draft, category)}
      disabled={locked || busy}
      roomy={roomy}
      onBlur={onBlur}
      onChange={onChange}
    />
  )
}

function HoursEntryCards({
  title,
  empty,
  rateLabel,
  lines,
  columns,
  drafts,
  locked,
  busy,
  attendanceText,
  categoryValue,
  setCategoryValue,
  grossFor,
  categoryTotal,
  groupGross,
  onEdit,
  onFlush
}: {
  title: string
  empty: string
  rateLabel: string
  lines: PayRunLine[]
  columns: PayrollCategory[]
  drafts: Record<string, Draft>
  locked: boolean
  busy: boolean
  attendanceText: (line: PayRunLine, category: PayrollCategory) => string
  categoryValue: (draft: Draft, category: PayrollCategory) => string
  setCategoryValue: (lineId: string, draft: Draft, category: PayrollCategory, value: string) => void
  grossFor: (line: PayRunLine) => number
  categoryTotal: (lines: PayRunLine[], category: PayrollCategory) => string
  groupGross: number
  onEdit: (lineId: string) => void
  onFlush: () => void
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {lines.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        lines.map((line) => {
          const draft = drafts[line.id]
          if (!draft) return null
          const rate = rateLabel === 'Salary' ? parseMoney(draft.salary) : parseMoney(draft.rate)
          return (
            <article key={line.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <button
                type="button"
                disabled={locked}
                onClick={() => onEdit(line.id)}
                className="min-h-[44px] text-left text-base font-semibold text-violet-700 underline decoration-violet-200 underline-offset-2 disabled:cursor-default disabled:text-slate-800 disabled:no-underline"
              >
                {line.staffName}
              </button>
              {line.taxCode ? <p className="text-xs text-slate-500">Tax code {line.taxCode}</p> : null}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{rateLabel}</p>
                  <p className="mt-1 flex min-h-[44px] items-center text-base tabular-nums text-slate-800">
                    {formatMoney(rate)}
                  </p>
                </div>
                {columns.map((category) => (
                  <label key={category.id} className="block">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {category.id === 'vacation' && rateLabel === 'Hourly rate' ? 'Vacation days' : category.label}
                    </span>
                    <span className="mt-1 block">
                      <CategoryControl
                        line={line}
                        draft={draft}
                        category={category}
                        locked={locked}
                        busy={busy}
                        roomy
                        attendanceText={attendanceText}
                        categoryValue={categoryValue}
                        onBlur={onFlush}
                        onChange={(value) => setCategoryValue(line.id, draft, category, value)}
                      />
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-sm font-medium text-slate-600">Total</span>
                <span className="text-base font-semibold tabular-nums text-slate-900">{formatMoney(grossFor(line))}</span>
              </div>
            </article>
          )
        })
      )}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        <p className="font-semibold">{title} totals</p>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
          {columns.map((category) => (
            <div key={category.id} className="flex items-baseline justify-between gap-2">
              <dt>{category.id === 'vacation' && rateLabel === 'Hourly rate' ? 'Vacation days' : category.label}</dt>
              <dd className="font-semibold tabular-nums">{categoryTotal(lines, category) || '—'}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-2 flex items-baseline justify-between border-t border-emerald-200 pt-2 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatMoney(groupGross)}</span>
        </div>
      </div>
    </section>
  )
}

function categoryAlign(category: PayrollCategory): string {
  if (category.kind === 'attendance' && category.id !== 'sickDays') return 'text-center'
  return 'text-right'
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
  const [vacationHoursPerDay, setVacationHoursPerDay] = useState(DEFAULT_VACATION_HOURS_PER_DAY)
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
  const [printDoc, setPrintDoc] = useState<PrintDocumentPreview | null>(null)
  const [openingDoc, setOpeningDoc] = useState<'payslips' | 'gl' | 'nis' | 'banking' | null>(null)
  const [cuDraft, setCuDraft] = useState<CreditUnionLetterDraft | null>(null)
  const [cuError, setCuError] = useState<string | null>(null)
  const [cuSent, setCuSent] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const draftsRef = useRef(drafts)
  const runRef = useRef(run)
  const categoriesRef = useRef(categories)
  const headerRef = useRef<PayrollEntryHeader>({ payDate, startDate, endDate, cycleNumber })
  const savedSignature = useRef<string | null>(null)
  const autosaveReady = useRef(false)
  const saveEpoch = useRef(0)
  const holdAutosave = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveChain = useRef<Promise<unknown>>(Promise.resolve())

  const load = useCallback(async () => {
    const res = await fetch(`/api/pay-runs/${id}`, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Failed to load payroll')
    const next = data as PayRun
    const nextHeader: PayrollEntryHeader = {
      payDate: next.payDate,
      startDate: next.startDate,
      endDate: next.endDate,
      cycleNumber: String(shownCycleNumber(next.cycleNumber, next.endDate))
    }
    const savedCategories = loadPayrollCategories()
    const seeded = draftsFromRun(next, savedCategories)
    runRef.current = next
    draftsRef.current = seeded
    categoriesRef.current = savedCategories
    headerRef.current = nextHeader
    const payload = JSON.stringify(payrollEntryPayload(next, seeded, savedCategories, nextHeader))
    const draftStillSkipsSalary =
      next.status !== 'processed' &&
      next.status !== 'void' &&
      next.lines.some((line) => salarySkipped(line.extraLines))
    savedSignature.current = draftStillSkipsSalary ? '' : payload
    autosaveReady.current = true
    setRun(next)
    setPayDate(nextHeader.payDate)
    setStartDate(nextHeader.startDate)
    setEndDate(nextHeader.endDate)
    setCycleNumber(nextHeader.cycleNumber)
    setCategories(savedCategories)
    setDrafts(seeded)
    setSaveStatus('saved')
    setError(null)
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
    const next = loadPayrollCategories()
    categoriesRef.current = next
    setCategories(next)
  }, [])

  useEffect(() => {
    runRef.current = run
  }, [run])

  useEffect(() => {
    draftsRef.current = drafts
  }, [drafts])

  useEffect(() => {
    headerRef.current = { payDate, startDate, endDate, cycleNumber }
  }, [payDate, startDate, endDate, cycleNumber])

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      void loadOvertimeMultiplier().then((multiplier) => {
        if (!cancelled) setOtMultiplier(multiplier)
      })
      void loadVacationHoursPerDay().then((hours) => {
        if (!cancelled) setVacationHoursPerDay(hours)
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
  const attendanceByStaff = useMemo(
    () => payPeriodAttendanceFromRows(run?.payPeriod?.rows),
    [run?.payPeriod?.rows]
  )

  const attendanceFact = (line: PayRunLine): PayPeriodAttendance =>
    attendanceForStaff(attendanceByStaff, line.staffId, line.staffName)

  const attendanceText = (line: PayRunLine, category: PayrollCategory): string => {
    const fact = attendanceFact(line)
    if (category.id === 'vacation') return fact.vacation
    return formatSickDays(fact.sickLeaveDays)
  }

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
        otMultiplier,
        vacationDays: parseMoney(draft.vacationDays),
        vacationHoursPerDay
      }).grossPay
    },
    [drafts, categories, locked, otMultiplier, vacationHoursPerDay]
  )

  const patchDraft = (lineId: string, patch: Partial<Draft>) => {
    const next = {
      ...draftsRef.current,
      [lineId]: { ...draftsRef.current[lineId], ...patch }
    }
    draftsRef.current = next
    setDrafts(next)
  }

  const writeEntries = useCallback(async (opts?: { header?: PayrollEntryHeader; reseed?: boolean }) => {
    if (holdAutosave.current || savedSignature.current === null) return runRef.current
    const epoch = saveEpoch.current
    const current = runRef.current
    if (!current || current.status === 'processed' || current.status === 'void') return current
    const header = opts?.header ?? headerRef.current
    const body = payrollEntryPayload(current, draftsRef.current, categoriesRef.current, header)
    const payload = JSON.stringify(body)
    if (payload === savedSignature.current) {
      if (saveEpoch.current === epoch) setSaveStatus('saved')
      return current
    }
    setSaveStatus('saving')
    const res = await fetch(`/api/pay-runs/${current.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      keepalive: payload.length < 60_000,
      body: payload
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Failed to save payroll')
    if (saveEpoch.current !== epoch || holdAutosave.current) return runRef.current
    const saved = data as PayRun
    const nextHeader: PayrollEntryHeader = {
      payDate: typeof saved.payDate === 'string' ? saved.payDate : header.payDate,
      startDate: typeof saved.startDate === 'string' ? saved.startDate : header.startDate,
      endDate: typeof saved.endDate === 'string' ? saved.endDate : header.endDate,
      cycleNumber:
        typeof saved.cycleNumber === 'number'
          ? String(shownCycleNumber(saved.cycleNumber, saved.endDate || header.endDate))
          : header.cycleNumber
    }
    headerRef.current = nextHeader
    setPayDate(nextHeader.payDate)
    setStartDate(nextHeader.startDate)
    setEndDate(nextHeader.endDate)
    setCycleNumber(nextHeader.cycleNumber)
    runRef.current = saved
    setRun(saved)
    // Keep the text in the fields. Replacing it from the server jumps the cursor mid-entry.
    if (opts?.reseed) {
      const seeded = draftsFromRun(saved, categoriesRef.current)
      draftsRef.current = seeded
      setDrafts(seeded)
      savedSignature.current = JSON.stringify(
        payrollEntryPayload(saved, seeded, categoriesRef.current, nextHeader)
      )
    } else {
      savedSignature.current = payload
    }
    setSaveStatus('saved')
    setError(null)
    return saved
  }, [])

  const persistNow = useCallback(
    (opts?: { header?: PayrollEntryHeader; reseed?: boolean }) => {
      const job = saveChain.current.then(() => writeEntries(opts))
      saveChain.current = job.then(
        () => undefined,
        () => undefined
      )
      const epoch = saveEpoch.current
      return job.catch((err) => {
        if (!holdAutosave.current && saveEpoch.current === epoch) {
          setSaveStatus('error')
          setError(err instanceof Error ? err.message : 'Failed to save payroll')
        }
        throw err
      })
    },
    [writeEntries]
  )

  const flushSave = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    void persistNow().catch(() => undefined)
  }

  const toggleExtraTax = (lineId: string, label: string, taxed: boolean) => {
    const draft = draftsRef.current[lineId]
    if (!draft) return
    const next = new Set(draft.untaxedExtras ?? [])
    if (taxed) next.delete(label)
    else next.add(label)
    patchDraft(lineId, { untaxedExtras: [...next] })
    flushSave()
  }

  useEffect(() => {
    if (loading || !runRef.current) return
    const sig = JSON.stringify(
      payrollEntryPayload(runRef.current, draftsRef.current, categoriesRef.current, headerRef.current)
    )
    if (!autosaveReady.current) {
      savedSignature.current = sig
      autosaveReady.current = true
      return
    }
    if (locked || holdAutosave.current) return
    if (sig === savedSignature.current) {
      setSaveStatus((status) => (status === 'error' ? status : 'saved'))
      return
    }
    setSaveStatus('saving')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      void persistNow().catch(() => undefined)
    }, 500)
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [drafts, categories, payDate, startDate, endDate, cycleNumber, loading, locked, persistNow])

  useEffect(() => {
    const flush = () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      void persistNow().catch(() => undefined)
    }
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [persistNow])

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
      await persistNow({ header: periodDraft, reseed: true })
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
      await persistNow({ reseed: true })
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
      await persistNow({ reseed: true })
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
    holdAutosave.current = true
    saveEpoch.current += 1
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    setBusy(true)
    setError(null)
    try {
      await saveChain.current
      const res = await fetch(`/api/pay-runs/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to delete draft')
      router.push('/payroll')
    } catch (err) {
      holdAutosave.current = false
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
    holdAutosave.current = true
    saveEpoch.current += 1
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    setBusy(true)
    setError(null)
    try {
      await saveChain.current
      const res = await fetch(`/api/pay-runs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'recalc' })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to reload hours')
      const saved = data as PayRun
      const seeded = draftsFromRun(saved, categoriesRef.current)
      runRef.current = saved
      draftsRef.current = seeded
      savedSignature.current = JSON.stringify(
        payrollEntryPayload(saved, seeded, categoriesRef.current, headerRef.current)
      )
      autosaveReady.current = true
      setRun(saved)
      setDrafts(seeded)
      setSaveStatus('saved')
    } catch (err) {
      setSaveStatus('error')
      setError(err instanceof Error ? err.message : 'Failed to reload hours')
    } finally {
      holdAutosave.current = false
      setBusy(false)
    }
  }

  const clearEntries = () => {
    const next = { ...draftsRef.current }
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
    draftsRef.current = next
    setDrafts(next)
    flushSave()
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
    const currentRun = runRef.current
    if (currentRun) {
      const nextRun = {
        ...currentRun,
        lines: currentRun.lines.map((item) =>
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
      runRef.current = nextRun
      setRun(nextRun)
    }
    setRateLineId(null)
    setBusy(true)
    setError(null)
    try {
      await persistNow()
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
  const hourlyColumns = visiblePayrollColumns(categories)
  const salariedColumns = hourlyColumns.filter((category) => category.kind !== 'hours')

  const updateCategories = (next: PayrollCategory[]) => {
    categoriesRef.current = next
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
    if (categoryLabelTaken(categories, label) || (sickDaysColumnEnabled(categories) && isSickAliasLabel(label))) {
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
    else if (category.id === 'vacation') patchDraft(lineId, { vacationDays: value })
    else if (category.id === 'extra') patchDraft(lineId, { extra: value })
    else if (category.id === 'medical') patchDraft(lineId, { medical: value })
    else if (category.id === 'shortage') patchDraft(lineId, { shortage: value })
    else {
      const custom = draftsRef.current[lineId]?.custom ?? draft.custom
      patchDraft(lineId, { custom: { ...custom, [category.id]: value } })
    }
  }

  const categoryTotal = (lines: PayRunLine[], category: PayrollCategory) => {
    if (category.kind === 'attendance') {
      if (category.id === 'vacation') {
        const days = lines.reduce((sum, line) => sum + parseMoney(drafts[line.id]?.vacationDays), 0)
        return days ? formatSickDays(days) : ''
      }
      return formatSickDays(lines.reduce((sum, line) => sum + attendanceFact(line).sickLeaveDays, 0))
    }
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
      const saved = locked ? run : await persistNow({ reseed: true })
      if (!saved) return
      setPreview(previewFromRun(saved))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build the preview')
    } finally {
      setBusy(false)
      setOpeningPreview(false)
    }
  }

  const periodLine = (saved: PayRun) =>
    `Pay period ${mdy(saved.startDate)} – ${mdy(saved.endDate)} · Pay date ${mdy(saved.payDate)}`

  const openPayslipPreview = async () => {
    if (!run) return
    setOpeningDoc('payslips')
    setError(null)
    try {
      const company = await loadPayslipCompany()
      setPrintDoc({
        title: 'Payslip preview',
        subtitle: periodLine(run),
        filename: `payslips-${run.startDate}-${run.endDate}.pdf`,
        html: renderPayslipsHtml({
          ...payslipsFromRun(run),
          companyName: company.companyName,
          companyAddress: company.address,
          companyPhone: company.phone
        })
      })
    } finally {
      setOpeningDoc(null)
    }
  }

  const openGlPreview = () => {
    if (!run) return
    setError(null)
    setPrintDoc({
      title: 'G/L preview',
      subtitle: periodLine(run),
      filename: `gl-${run.startDate}-${run.endDate}.pdf`,
      html: renderGlHtml(payslipsFromRun(run))
    })
  }

  const openNisPreview = () => {
    if (!run) return
    setError(null)
    setPrintDoc({
      title: 'N.I.C. preview',
      subtitle: periodLine(run),
      filename: `nic-${run.startDate}-${run.endDate}.pdf`,
      html: renderNisHtml({
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
    })
  }

  const openBankingPreview = () => {
    if (!run) return
    setError(null)
    setPrintDoc({
      title: 'Banking pack preview',
      subtitle: periodLine(run),
      filename: `banks-listing-${run.payDate}.pdf`,
      html: renderBankingPackHtml(banking, run.payDate),
      onExcel: () => downloadBankingPackExcel(banking, run.payDate)
    })
  }

  const rateLine = run?.lines.find((line) => line.id === rateLineId) ?? null

  if (loading) {
    return <p className="px-4 py-4 text-sm text-slate-500 sm:p-8">Loading payroll…</p>
  }
  if (!run) {
    return <p className="px-4 py-4 text-sm text-red-700 sm:p-8">{error || 'Payroll not found.'}</p>
  }

  return (
    <div className="min-h-full bg-white">
      <div className="mx-auto max-w-6xl px-4 py-4 pb-28 sm:px-6 sm:py-8 sm:pb-28">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
                  className="inline-flex min-h-[44px] items-center font-medium text-violet-700 hover:text-violet-900 sm:min-h-0"
                >
                  Edit
                </button>
              )}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-4">
            <PayrollSettingsButton />
            {run.status === 'draft' ? (
              <button
                type="button"
                onClick={deleteDraft}
                disabled={busy}
                className="inline-flex min-h-[44px] items-center justify-center text-sm font-medium text-red-700 hover:text-red-900 disabled:opacity-40 sm:min-h-0 sm:justify-start"
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
                className="inline-flex min-h-[44px] items-center justify-center text-sm font-medium text-red-700 hover:text-red-900 disabled:opacity-40 sm:min-h-0 sm:justify-start"
              >
                Void payroll
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => router.push('/payroll')}
              className="inline-flex min-h-[44px] items-center justify-center text-sm font-medium text-violet-700 hover:text-violet-900 sm:min-h-0 sm:justify-start"
            >
              All payroll
            </button>
          </div>
        </div>

        <ol className="mb-8 grid grid-cols-3 border-b border-slate-200">
          {(
            [
              { full: 'Enter payroll', short: 'Enter' },
              { full: 'Approve payroll', short: 'Approve' },
              { full: 'Print', short: 'Print' }
            ] as const
          ).map((label, index) => {
            const n = (index + 1) as 1 | 2 | 3
            const active = step === n
            return (
              <li key={label.full}>
                <button
                  type="button"
                  onClick={() => {
                    if (n === 3 && !locked) return
                    if (!locked && n !== step) flushSave()
                    setStep(n)
                  }}
                  disabled={n === 3 && !locked}
                  className={`flex min-h-[44px] w-full items-end pb-3 text-left text-sm disabled:cursor-default sm:min-h-0 ${
                    active ? 'border-b-2 border-violet-700 font-semibold text-slate-900' : 'text-slate-400'
                  }`}
                >
                  <span className="sm:hidden">
                    {n}. {label.short}
                  </span>
                  <span className="hidden sm:inline">
                    {n}. {label.full}
                  </span>
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
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">Enter hours and money</h2>
                <HelpTip label="About hours and money">
                  Basic and OT hours are filled from extracted attendance. Vacation and SICK match the attendance
                  report. SICK is locked. Edits save on their own. Click a name to change the pay rate, tax code, and
                  medical. Use Hours & money types to add or remove columns.
                </HelpTip>
              </div>
              <button
                type="button"
                onClick={() => setTypesOpen(true)}
                className="min-h-[44px] rounded-md border border-violet-200 bg-violet-50 px-3 py-1 text-sm font-medium text-violet-800 hover:bg-violet-100 sm:min-h-0"
              >
                Hours & money types
              </button>
            </div>

            <div className="space-y-8 md:hidden">
              <HoursEntryCards
                title="Hourly employees"
                empty="No hourly staff for this pay period."
                rateLabel="Hourly rate"
                lines={hourly}
                columns={hourlyColumns}
                drafts={drafts}
                locked={Boolean(locked)}
                busy={busy}
                attendanceText={attendanceText}
                categoryValue={categoryValue}
                setCategoryValue={setCategoryValue}
                grossFor={grossFor}
                categoryTotal={categoryTotal}
                groupGross={sumGross(hourly)}
                onEdit={openPayInfo}
                onFlush={flushSave}
              />
              <HoursEntryCards
                title="Salaried employees"
                empty="No salaried staff for this pay period."
                rateLabel="Salary"
                lines={salaried}
                columns={salariedColumns}
                drafts={drafts}
                locked={Boolean(locked)}
                busy={busy}
                attendanceText={attendanceText}
                categoryValue={categoryValue}
                setCategoryValue={setCategoryValue}
                grossFor={grossFor}
                categoryTotal={categoryTotal}
                groupGross={sumGross(salaried)}
                onEdit={openPayInfo}
                onFlush={flushSave}
              />
              <div className="flex items-center justify-between gap-4 border-t-2 border-emerald-700 pt-3">
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Gross pay</p>
                  <p className="text-xs text-slate-500">Hourly and salaried staff</p>
                </div>
                <p className="text-sm font-semibold tabular-nums text-emerald-800">
                  {formatMoney(sumGross(hourly) + sumGross(salaried))}
                </p>
              </div>
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-bold uppercase tracking-wide text-slate-900">
                    <th className="py-2 pr-3 font-bold">Hourly employees</th>
                    <th className="py-2 pr-3 font-bold">Hourly rate</th>
                    {hourlyColumns.map((category) => (
                      <th
                        key={category.id}
                        className={`py-2 pr-3 font-bold ${categoryAlign(category)}`}
                      >
                        {category.id === 'vacation' ? 'Vacation days' : category.label}
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
                            <td
                              key={category.id}
                              className={`py-3 pr-3 ${categoryAlign(category)}`}
                            >
                              <CategoryControl
                                line={line}
                                draft={draft}
                                category={category}
                                locked={Boolean(locked)}
                                busy={busy}
                                attendanceText={attendanceText}
                                categoryValue={categoryValue}
                                onBlur={flushSave}
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
                      <td
                        key={category.id}
                        className={`py-3 pr-3 font-semibold tabular-nums ${
                          categoryAlign(category)
                        }`}
                      >
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
                    <th className="py-2 pr-3 font-bold">Salary</th>
                    {salariedColumns.map((category) => (
                      <th
                        key={category.id}
                        className={`py-2 pr-3 font-bold ${categoryAlign(category)}`}
                      >
                        {category.label}
                      </th>
                    ))}
                    <th className="py-2 text-right font-bold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {salaried.length === 0 ? (
                    <tr>
                      <td colSpan={salariedColumns.length + 3} className="py-4 text-slate-500">
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
                          <td className="py-3 pr-3 tabular-nums text-slate-700">
                            {formatMoney(parseMoney(draft.salary))}
                          </td>
                          {salariedColumns.map((category) => (
                            <td
                              key={category.id}
                              className={`py-3 pr-3 ${categoryAlign(category)}`}
                            >
                              <CategoryControl
                                line={line}
                                draft={draft}
                                category={category}
                                locked={Boolean(locked)}
                                busy={busy}
                                attendanceText={attendanceText}
                                categoryValue={categoryValue}
                                onBlur={flushSave}
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
                      Salaried employee totals
                    </td>
                    {salariedColumns.map((category) => (
                      <td
                        key={category.id}
                        className={`py-3 pr-3 font-semibold tabular-nums ${
                          categoryAlign(category)
                        }`}
                      >
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
            onFlush={flushSave}
            onEditName={openPayInfo}
            onToggleExtraTax={toggleExtraTax}
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
                  The amounts stay on record and no longer count toward N.I.C. You can start a new payroll for this period.
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                This payroll is approved. Pay period {mdy(run.startDate)} – {mdy(run.endDate)} · Pay date {mdy(run.payDate)}.
              </div>
            )}
            <h2 className="mt-8 text-lg font-semibold text-slate-900">What would you like to do next?</h2>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
              <button
                type="button"
                onClick={() => {
                  void openPayslipPreview()
                }}
                disabled={openingDoc === 'payslips'}
                className="min-h-[44px] rounded-md border border-violet-700 px-4 py-2 text-sm font-semibold text-violet-700 disabled:opacity-50 sm:min-h-0"
              >
                {openingDoc === 'payslips' ? 'Preparing…' : 'Print Payslips'}
              </button>
              <button
                type="button"
                onClick={openGlPreview}
                className="min-h-[44px] rounded-md border border-violet-700 px-4 py-2 text-sm font-semibold text-violet-700 sm:min-h-0"
              >
                Print GL
              </button>
              <button
                type="button"
                onClick={openNisPreview}
                className="min-h-[44px] rounded-md border border-violet-700 px-4 py-2 text-sm font-semibold text-violet-700 sm:min-h-0"
              >
                Print NIC
              </button>
              <button
                type="button"
                disabled
                title="Coming soon"
                className="min-h-[44px] cursor-not-allowed rounded-md border border-violet-700 px-4 py-2 text-sm font-semibold text-violet-700 disabled:border-violet-700 disabled:text-violet-700 sm:min-h-0"
              >
                Print PAYE
              </button>
              <button
                type="button"
                onClick={openPreview}
                disabled={openingPreview}
                className="min-h-[44px] rounded-md border border-violet-700 px-4 py-2 text-sm font-semibold text-violet-700 disabled:opacity-50 sm:min-h-0"
              >
                {openingPreview ? 'Preparing…' : 'Print Payroll Summary'}
              </button>
              <button
                type="button"
                onClick={openBankingPreview}
                className="min-h-[44px] rounded-md border border-violet-700 px-4 py-2 text-sm font-semibold text-violet-700 sm:min-h-0"
              >
                Print Banking List
              </button>
            </div>
            {letters.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
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
                    className="min-h-[44px] rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 sm:min-h-0"
                  >
                    Email {letter.code}
                  </button>
                ))}
              </div>
            ) : null}
            {cuSent ? <p className="mt-3 text-sm text-emerald-800">{cuSent}</p> : null}
            <p className="mt-6 text-sm text-slate-500">
              You can leave and open this payroll again. PAYE is calculated on this payroll.
            </p>
          </div>
        ) : null}
      </div>

      {step === 1 ? (
        <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={clearEntries}
                disabled={locked}
                className="min-h-[44px] rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-sm font-medium text-violet-900 hover:border-violet-300 hover:bg-violet-100 disabled:opacity-40 sm:min-h-0"
              >
                Clear entries
              </button>
              <span
                className="inline-flex min-h-[44px] items-center px-2.5 py-1.5 text-sm font-medium text-violet-900 sm:min-h-0"
                aria-live="polite"
              >
                {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Could not save' : 'Saved'}
              </span>
              {saveStatus === 'error' ? (
                <button
                  type="button"
                  onClick={flushSave}
                  disabled={locked}
                  className="min-h-[44px] rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-sm font-medium text-violet-900 hover:border-violet-300 hover:bg-violet-100 disabled:opacity-40 sm:min-h-0"
                >
                  Save entries
                </button>
              ) : null}
              <button
                type="button"
                onClick={reloadHours}
                disabled={busy || locked}
                className="col-span-2 min-h-[44px] rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-sm font-medium text-violet-900 hover:border-violet-300 hover:bg-violet-100 disabled:opacity-40 sm:col-auto sm:min-h-0"
              >
                Reload hours from attendance
              </button>
            </div>
            <button
              type="button"
              onClick={continueToReview}
              disabled={busy}
              className="min-h-[44px] w-full rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50 sm:min-h-0 sm:w-auto"
            >
              {busy ? 'Saving…' : 'Continue'}
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="sticky bottom-0 border-t border-violet-100 bg-violet-50 px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="grid grid-cols-2 gap-2 text-sm sm:flex sm:items-center sm:gap-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex min-h-[44px] items-center justify-center font-medium text-violet-700 sm:min-h-0 sm:justify-start"
              >
                Back to employees
              </button>
              <span
                className="inline-flex min-h-[44px] items-center justify-center font-medium text-violet-900 sm:min-h-0 sm:justify-start"
                aria-live="polite"
              >
                {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Could not save' : 'Saved'}
              </span>
              {saveStatus === 'error' ? (
                <button
                  type="button"
                  onClick={flushSave}
                  className="inline-flex min-h-[44px] items-center justify-center font-medium text-violet-700 sm:min-h-0"
                >
                  Save entries
                </button>
              ) : null}
              <button
                type="button"
                onClick={openPreview}
                disabled={busy}
                className="col-span-2 inline-flex min-h-[44px] items-center justify-center font-medium text-violet-700 disabled:opacity-50 sm:col-auto sm:min-h-0 sm:justify-start"
              >
                {openingPreview ? 'Preparing…' : 'Download preview'}
              </button>
            </div>
            {locked ? null : (
              <button
                type="button"
                onClick={approve}
                disabled={busy}
                className="min-h-[44px] w-full rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50 sm:min-h-0 sm:w-auto"
              >
                {busy ? 'Approving…' : 'Approve payroll'}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {periodDraft ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
          <div className="my-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6">
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
                  className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 px-3 py-2 sm:min-h-0"
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
                  className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 px-3 py-2 sm:min-h-0"
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
                  className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 px-3 py-2 sm:min-h-0"
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
                  className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 px-3 py-2 sm:min-h-0"
                />
              </label>
            </div>
            {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setPeriodDraft(null)
                }}
                disabled={busy}
                className="min-h-[44px] w-full rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 sm:min-h-0 sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={savePeriod}
                disabled={busy}
                className="min-h-[44px] w-full rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50 sm:min-h-0 sm:w-auto"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {typesOpen ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
          <div className="my-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Hours and money types</h2>
            <p className="mt-2 text-sm text-slate-600">
              Choose which columns are on this payroll. Basic stays. Vacation and SICK match the attendance
              report and are not pay amounts. SICK stays locked. Added hour columns are paid at the hourly rate.
              Removing a type drops it from this payroll when you save.
            </p>
            <ul className="mt-4 divide-y divide-slate-100">
              {listedPayrollCategories(categories).map((category) => (
                <li key={category.id} className="flex min-h-[44px] items-center justify-between gap-3 py-2 sm:min-h-0">
                  <label className="flex min-h-[44px] flex-1 items-center gap-2 text-sm text-slate-800 sm:min-h-0">
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
                      className="inline-flex min-h-[44px] items-center text-sm font-medium text-red-700 hover:text-red-900 sm:min-h-0"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end">
              <label className="block text-sm">
                <span className="font-medium text-slate-800">New type</span>
                <input
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 px-3 py-2 sm:min-h-0 sm:w-48"
                  placeholder="Commission"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Category</span>
                <select
                  value={newTypeKind}
                  onChange={(e) => setNewTypeKind(e.target.value as CategoryKind)}
                  className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 px-3 py-2 sm:min-h-0 sm:w-auto"
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
                className="min-h-[44px] w-full rounded-md bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50 sm:min-h-0 sm:w-auto"
              >
                Add
              </button>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setTypesOpen(false)}
                className="min-h-[44px] w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 sm:min-h-0 sm:w-auto"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {voidOpen ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
          <div className="my-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Void this payroll</h2>
            <p className="mt-2 text-sm text-slate-600">
              The paycheck amounts stay on file. They stop counting toward N.I.C., and you can run this period again. A
              reason is required.
            </p>
            <label className="mt-4 block text-sm">
              <span className="font-medium text-slate-800">Reason</span>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={4}
                className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 px-3 py-2 sm:min-h-0"
              />
            </label>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setVoidOpen(false)}
                className="min-h-[44px] w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 sm:min-h-0 sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={voidPayroll}
                disabled={busy || voidReason.trim().length < 3}
                className="min-h-[44px] w-full rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 sm:min-h-0 sm:w-auto"
              >
                {busy ? 'Voiding…' : 'Void payroll'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {preview ? <PayrollPreviewModal preview={preview} onClose={() => setPreview(null)} /> : null}
      {printDoc ? <PrintDocumentModal preview={printDoc} onClose={() => setPrintDoc(null)} /> : null}

      {rateLine && !locked ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
          <div className="my-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Edit pay information for {rateLine.staffName}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-slate-800">
                  {parsePayType(rateLine.payType) === 'salaried' ? 'Salary' : 'Pay rate'}
                </span>
                <input
                  value={rateValue}
                  onChange={(e) => setRateValue(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 px-3 py-2 sm:min-h-0"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Tax code</span>
                <input
                  value={taxCode}
                  onChange={(e) => setTaxCode(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 px-3 py-2 sm:min-h-0"
                  placeholder="Pay+ tax code"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Medical</span>
                <input
                  value={medicalValue}
                  onChange={(e) => setMedicalValue(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 px-3 py-2 sm:min-h-0"
                  placeholder="Medical insurance"
                />
              </label>
            </div>
            <fieldset className="mt-4 text-sm">
              <legend className="font-medium text-slate-800">Apply to</legend>
              <label className="mt-2 flex min-h-[44px] items-center gap-2 sm:min-h-0">
                <input
                  type="radio"
                  name="rate-scope"
                  checked={rateScope === 'run'}
                  onChange={() => setRateScope('run')}
                />
                Only this payroll
              </label>
              <label className="mt-2 flex min-h-[44px] items-center gap-2 sm:min-h-0">
                <input
                  type="radio"
                  name="rate-scope"
                  checked={rateScope === 'future'}
                  onChange={() => setRateScope('future')}
                />
                This payroll and future payrolls
              </label>
            </fieldset>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button"
                onClick={saveRate}
                className="min-h-[44px] w-full rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white sm:min-h-0 sm:w-auto"
              >
                Save pay information
              </button>
              <button
                type="button"
                onClick={() => setRateLineId(null)}
                className="min-h-[44px] w-full rounded-md text-sm text-slate-600 sm:min-h-0 sm:w-auto"
              >
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
  const hourly = preview.lines.filter((line) => parsePayType(line.payType) !== 'salaried')
  const salaried = preview.lines.filter((line) => parsePayType(line.payType) === 'salaried')
  const hours = preview.lines.reduce((sum, line) => sum + line.hours, 0)
  const gross = preview.lines.reduce((sum, line) => sum + line.grossPay, 0)
  const deductions = preview.lines.reduce((sum, line) => sum + line.totalDeductions, 0)
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payroll-preview-title"
        className="my-4 flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
          <div>
            <h2 id="payroll-preview-title" className="text-lg font-semibold text-slate-900">
              Payroll preview
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Pay period {mdy(preview.startDate)} – {mdy(preview.endDate)} · Pay date {mdy(preview.payDate)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] shrink-0 items-center text-sm font-medium text-slate-600 hover:text-slate-900 sm:min-h-0"
          >
            Close
          </button>
        </div>
        <div className="overflow-auto bg-slate-100 px-4 py-4 sm:px-6 sm:py-5">
          <div className="rounded-md border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-6 sm:py-5">
            <p className="rounded-md bg-violet-50 px-4 py-3 text-sm text-slate-800">{payrollPreviewStatus(preview)}</p>
            <PreviewSection title="Hourly employees" lines={hourly} />
            <PreviewSection title="Salaried employees" lines={salaried} />
            <p className="mt-4 text-sm text-slate-800">
              <span className="font-semibold">Total hours</span> {hours.toFixed(2)} ·{' '}
              <span className="font-semibold">Gross</span> {formatMoney(gross)} ·{' '}
              <span className="font-semibold">Deductions</span> {formatMoney(deductions)} ·{' '}
              <span className="font-semibold">Net</span> {formatMoney(net)}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              PAYE is 15% of taxable pay after NIC, above $2,500 a month.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          {printError ? <p className="text-sm text-red-700 sm:mr-auto">{printError}</p> : null}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:min-h-0 sm:w-auto"
          >
            Close
          </button>
          <button
            type="button"
            onClick={print}
            className="min-h-[44px] w-full rounded-md border border-violet-700 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50 sm:min-h-0 sm:w-auto"
          >
            Print
          </button>
          <button
            type="button"
            onClick={() => downloadPayrollPreview(preview)}
            className="min-h-[44px] w-full rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 sm:min-h-0 sm:w-auto"
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
  const hours = lines.reduce((sum, line) => sum + line.hours, 0)
  const gross = lines.reduce((sum, line) => sum + line.grossPay, 0)
  const deductions = lines.reduce((sum, line) => sum + line.totalDeductions, 0)
  const net = lines.reduce((sum, line) => sum + line.netPay, 0)
  return (
    <section className="mt-5">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-2 space-y-3 md:hidden">
        {lines.map((line, index) => (
          <article key={`${line.staffName}-${index}`} className="rounded-lg border border-slate-200 p-3 text-sm">
            <p className="font-semibold text-slate-900">{line.staffName}</p>
            <dl className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <dt className="text-slate-500">Hours</dt>
                <dd className="tabular-nums">
                  {parsePayType(line.payType) === 'salaried' ? '—' : line.hours.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Gross</dt>
                <dd className="tabular-nums">{formatMoney(line.grossPay)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Deductions</dt>
                <dd className="tabular-nums">{formatMoney(line.totalDeductions)}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Net</dt>
                <dd className="font-semibold tabular-nums">{formatMoney(line.netPay)}</dd>
              </div>
            </dl>
          </article>
        ))}
        <div className="rounded-lg bg-violet-50 p-3 text-sm font-semibold">
          <p>Subtotal</p>
          <p className="mt-1 font-medium">
            Hours {hours ? hours.toFixed(2) : '—'} · Gross {formatMoney(gross)} · Deductions {formatMoney(deductions)} ·
            Net {formatMoney(net)}
          </p>
        </div>
      </div>
      <table className="mt-2 hidden w-full text-sm md:table">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 font-semibold">Name</th>
            <th className="py-2 text-right font-semibold">Total hours</th>
            <th className="py-2 text-right font-semibold">Gross pay</th>
            <th className="py-2 text-right font-semibold">Deductions</th>
            <th className="py-2 text-right font-semibold">Net pay</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={`${line.staffName}-${index}`} className="border-b border-slate-100">
              <td className="py-2">{line.staffName}</td>
              <td className="py-2 text-right tabular-nums">
                {parsePayType(line.payType) === 'salaried' ? '—' : line.hours.toFixed(2)}
              </td>
              <td className="py-2 text-right tabular-nums">{formatMoney(line.grossPay)}</td>
              <td className="py-2 text-right tabular-nums">{formatMoney(line.totalDeductions)}</td>
              <td className="py-2 text-right tabular-nums">{formatMoney(line.netPay)}</td>
            </tr>
          ))}
          <tr className="bg-violet-50 font-semibold">
            <td className="py-2">Subtotal</td>
            <td className="py-2 text-right tabular-nums">{hours ? hours.toFixed(2) : '—'}</td>
            <td className="py-2 text-right tabular-nums">{formatMoney(gross)}</td>
            <td className="py-2 text-right tabular-nums">{formatMoney(deductions)}</td>
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
  onFlush,
  onEditName,
  onToggleExtraTax,
  locked
}: {
  run: PayRun
  details: boolean
  drafts: Record<string, Draft>
  onToggleDetails: () => void
  onDraft: (lineId: string, patch: Partial<Draft>) => void
  onFlush: () => void
  onEditName: (lineId: string) => void
  onToggleExtraTax: (lineId: string, label: string, taxed: boolean) => void
  locked: boolean
}) {
  const [openDeductions, setOpenDeductions] = useState<Record<string, true>>({})
  const hourly = run.lines.filter((line) => parsePayType(line.payType) !== 'salaried')
  const salaried = run.lines.filter((line) => parsePayType(line.payType) === 'salaried')
  const hours = run.lines.reduce((sum, line) => sum + line.basicHours + line.otHours + (line.vacationHours ?? 0), 0)
  const gross = run.lines.reduce((sum, line) => sum + line.grossPay, 0)
  const deductions = run.lines.reduce((sum, line) => sum + line.totalDeductions, 0)
  const net = run.lines.reduce((sum, line) => sum + line.netPay, 0)

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">{details ? 'Payroll details' : 'Payroll summary'}</h2>
          <HelpTip label="About this payroll">
            {`Pay period ${mdy(run.startDate)} – ${mdy(run.endDate)} · Pay date ${mdy(run.payDate)}. Net is gross minus PAYE, employee NIS, loan, medical, shortage, and other deductions. PAYE is 15% of taxable pay after NIC, above $2,500 for the month. Uncheck Tax on an extra to leave that amount out. Employer NIS is a memo. YTD is approved pay in ${run.payDate.slice(0, 4)} through this pay date, including this payroll.`}
          </HelpTip>
        </div>
        <button
          type="button"
          onClick={onToggleDetails}
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-violet-700 hover:underline sm:min-h-0"
        >
          {details ? 'View summary' : 'View details'}
        </button>
      </div>

      {details ? (
        <div className="space-y-10">
          {run.lines.map((line) => {
            const draft = drafts[line.id]
            const bankNote = previewBankAccountNote(line)
            const hiddenDeductions = locked
              ? []
              : DETAIL_DEDUCTIONS.filter((field) => {
                  const value = draft?.[field.key] ?? ''
                  const openKey = `${line.id}:${field.key}`
                  return !openDeductions[openKey] && parseMoney(value) === 0 && deductionYtd(line, field.key, value) === 0
                })
            return (
              <article key={line.id} className="border-b border-slate-200 pb-8">
                <header className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                  <div>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => onEditName(line.id)}
                      className="min-h-[44px] text-left text-base font-semibold text-violet-700 underline decoration-violet-200 underline-offset-2 hover:decoration-violet-700 disabled:cursor-default disabled:text-slate-900 disabled:no-underline sm:min-h-0"
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
                        {line.vacationPay || line.ytd?.vacationPay ? (
                          <tr>
                            <td className="py-1">Vacation</td>
                            <td className="py-1 text-right tabular-nums">{(line.vacationHours ?? 0).toFixed(2)}</td>
                            <td className="py-1 text-right tabular-nums">{formatMoney(line.vacationPay ?? 0)}</td>
                            <td className="py-1 text-right tabular-nums">
                              {formatMoney(line.ytd?.vacationPay ?? line.vacationPay ?? 0)}
                            </td>
                          </tr>
                        ) : null}
                        <tr>
                          <td className="py-1">Extra</td>
                          <td />
                          <td className="py-1 text-right tabular-nums">{formatMoney(line.extraPay)}</td>
                          <td className="py-1 text-right tabular-nums">{formatMoney(line.ytd?.extraPay ?? line.extraPay)}</td>
                        </tr>
                        {visibleExtraLines(line.extraLines).map((extra) => {
                          const untaxed = new Set(draft?.untaxedExtras ?? [])
                          const taxed = !untaxed.has(extra.label)
                          return (
                            <tr key={`${line.id}-${extra.label}`}>
                              <td className="py-1 pl-3" colSpan={2}>
                                <label className="inline-flex min-h-[44px] items-center gap-2 text-slate-600 sm:min-h-0">
                                  <input
                                    type="checkbox"
                                    checked={taxed}
                                    disabled={locked}
                                    aria-label={`Tax ${extra.label} for ${line.staffName}`}
                                    onChange={(e) => onToggleExtraTax(line.id, extra.label, e.target.checked)}
                                  />
                                  Tax {extra.label}
                                  {taxed ? '' : ' · not taxed'}
                                </label>
                              </td>
                              <td className="py-1 text-right tabular-nums text-slate-600">{formatMoney(extra.amount)}</td>
                              <td />
                            </tr>
                          )
                        })}
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
                          <td className="py-1">PAYE</td>
                          <td className="py-1 text-right tabular-nums">{formatMoney(line.paye ?? 0)}</td>
                          <td className="py-1 text-right tabular-nums">{formatMoney(line.ytd?.paye ?? line.paye ?? 0)}</td>
                        </tr>
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
                                    onFlush()
                                    if (parseMoney(nextValue) !== 0 || deductionYtd(line, field.key, nextValue) !== 0) return
                                    setOpenDeductions((current) => {
                                      if (!current[openKey]) return current
                                      const next = { ...current }
                                      delete next[openKey]
                                      return next
                                    })
                                  }}
                                  onChange={(e) => onDraft(line.id, { [field.key]: e.target.value })}
                                  className="min-h-[44px] w-full rounded border border-slate-200 px-2 py-1 text-right sm:min-h-0 sm:w-28"
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
                            className="inline-flex min-h-[44px] items-center font-medium text-violet-700 hover:underline sm:min-h-0"
                          >
                            Add {field.label.toLowerCase()}
                          </button>
                        ))}
                      </p>
                    ) : null}
                    {bankNote ? <p className="mt-3 text-xs text-slate-500">{bankNote}</p> : null}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <>
          <SummaryCards
            hourly={hourly}
            salaried={salaried}
            hours={hours}
            gross={gross}
            deductions={deductions}
            net={net}
            onEditName={locked ? undefined : onEditName}
          />
          <div className="hidden md:block">
            <SummaryTable
              hourly={hourly}
              salaried={salaried}
              hours={hours}
              gross={gross}
              deductions={deductions}
              net={net}
              onEditName={locked ? undefined : onEditName}
            />
          </div>
        </>
      )}
    </div>
  )
}

function SummaryCards({
  hourly,
  salaried,
  hours,
  gross,
  deductions,
  net,
  onEditName
}: {
  hourly: PayRunLine[]
  salaried: PayRunLine[]
  hours: number
  gross: number
  deductions: number
  net: number
  onEditName?: (lineId: string) => void
}) {
  const block = (title: string, lines: PayRunLine[]) => {
    const blockHours = lines.reduce((sum, line) => sum + line.basicHours + line.otHours + (line.vacationHours ?? 0), 0)
    const blockGross = lines.reduce((sum, line) => sum + line.grossPay, 0)
    const blockDeductions = lines.reduce((sum, line) => sum + line.totalDeductions, 0)
    const blockNet = lines.reduce((sum, line) => sum + line.netPay, 0)
    return (
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        <div className="mt-2 space-y-3">
          {lines.map((line) => (
            <article key={line.id} className="rounded-lg border border-slate-200 p-4">
              {onEditName ? (
                <button
                  type="button"
                  onClick={() => onEditName(line.id)}
                  className="min-h-[44px] text-left text-base font-semibold text-violet-700 underline decoration-violet-200 underline-offset-2"
                >
                  {line.staffName}
                </button>
              ) : (
                <p className="text-base font-semibold text-slate-900">{line.staffName}</p>
              )}
              {line.taxCode ? <p className="text-xs text-slate-500">Tax code {line.taxCode}</p> : null}
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-slate-500">Hours</dt>
                  <dd className="tabular-nums">
                    {parsePayType(line.payType) === 'salaried' ? '—' : (line.basicHours + line.otHours + (line.vacationHours ?? 0)).toFixed(2)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Gross</dt>
                  <dd className="tabular-nums">{formatMoney(line.grossPay)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Deductions</dt>
                  <dd className="tabular-nums">{formatMoney(line.totalDeductions)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-700">Net</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">{formatMoney(line.netPay)}</dd>
                </div>
              </dl>
            </article>
          ))}
          <div className="rounded-lg bg-violet-50 p-3 text-sm font-semibold">
            <p>Subtotal</p>
            <dl className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <dt className="font-medium text-slate-600">Hours</dt>
                <dd className="tabular-nums">{blockHours ? blockHours.toFixed(2) : '—'}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-600">Gross</dt>
                <dd className="tabular-nums">{formatMoney(blockGross)}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-600">Deductions</dt>
                <dd className="tabular-nums">{formatMoney(blockDeductions)}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-600">Net</dt>
                <dd className="tabular-nums">{formatMoney(blockNet)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-6 md:hidden">
      {block('Hourly employees', hourly)}
      {block('Salaried employees', salaried)}
      <div className="rounded-lg bg-violet-100 p-4 text-sm font-semibold">
        <p>Total</p>
        <dl className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <dt className="font-medium text-slate-700">Hours</dt>
            <dd className="tabular-nums">{hours.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Gross</dt>
            <dd className="tabular-nums">{formatMoney(gross)}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Deductions</dt>
            <dd className="tabular-nums">{formatMoney(deductions)}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Net</dt>
            <dd className="tabular-nums">{formatMoney(net)}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

function SummaryTable({
  hourly,
  salaried,
  hours,
  gross,
  deductions,
  net,
  onEditName
}: {
  hourly: PayRunLine[]
  salaried: PayRunLine[]
  hours: number
  gross: number
  deductions: number
  net: number
  onEditName?: (lineId: string) => void
}) {
  const block = (title: string, lines: PayRunLine[]) => {
    const blockHours = lines.reduce((sum, line) => sum + line.basicHours + line.otHours + (line.vacationHours ?? 0), 0)
    const blockGross = lines.reduce((sum, line) => sum + line.grossPay, 0)
    const blockDeductions = lines.reduce((sum, line) => sum + line.totalDeductions, 0)
    const blockNet = lines.reduce((sum, line) => sum + line.netPay, 0)
    return (
      <>
        <tr>
          <td colSpan={5} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
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
              {parsePayType(line.payType) === 'salaried' ? '—' : (line.basicHours + line.otHours + (line.vacationHours ?? 0)).toFixed(2)}
            </td>
            <td className="py-2 text-right tabular-nums">{formatMoney(line.grossPay)}</td>
            <td className="py-2 text-right tabular-nums">{formatMoney(line.totalDeductions)}</td>
            <td className="py-2 text-right tabular-nums">{formatMoney(line.netPay)}</td>
          </tr>
        ))}
        <tr className="bg-violet-50 font-semibold">
          <td className="py-2">Subtotal</td>
          <td className="py-2 text-right tabular-nums">{blockHours ? blockHours.toFixed(2) : '—'}</td>
          <td className="py-2 text-right tabular-nums">{formatMoney(blockGross)}</td>
          <td className="py-2 text-right tabular-nums">{formatMoney(blockDeductions)}</td>
          <td className="py-2 text-right tabular-nums">{formatMoney(blockNet)}</td>
        </tr>
      </>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 font-semibold">Name</th>
            <th className="py-2 text-right font-semibold">Total hours</th>
            <th className="py-2 text-right font-semibold">Gross pay</th>
            <th className="py-2 text-right font-semibold">Deductions</th>
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
            <td className="py-3 text-right tabular-nums">{formatMoney(deductions)}</td>
            <td className="py-3 text-right tabular-nums">{formatMoney(net)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
