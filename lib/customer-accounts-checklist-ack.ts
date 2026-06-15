import { evaluateCustomerAccountsWeek } from '@/lib/operations-checklist-customer-accounts'

export function validateCustomerAccountsCompleteAck(params: {
  weekKey: string
  importLogs: {
    weekKey: string
    year: number
    month: number
    accountCount: number
    accountsWithCharges: number
  }[]
  note?: string | null
  overrideZeroCharges?: boolean
}): { ok: true } | { ok: false; error: string } {
  const evalResult = evaluateCustomerAccountsWeek(params.weekKey, params.importLogs)

  if (evalResult.eligible) {
    return { ok: true }
  }

  if (evalResult.zeroCharges && params.overrideZeroCharges) {
    const note = params.note?.trim() ?? ''
    if (note.length < 10) {
      return {
        ok: false,
        error: 'A note of at least 10 characters is required to complete with zero charges.'
      }
    }
    return { ok: true }
  }

  if (!evalResult.importLog) {
    return { ok: false, error: 'Upload the CSV for the expected month before marking complete.' }
  }

  if (evalResult.zeroCharges) {
    return {
      ok: false,
      error: 'CSV has no accounts with charges. Use complete with note to override.'
    }
  }

  return { ok: false, error: 'CSV requirements not met for this week.' }
}
