import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/email'
import { parseRecipientEmails } from '@/lib/eod-email'
import { getPublicAppUrlFromEnv } from '@/lib/public-url'
import { BUSINESS_TIME_ZONE } from '@/lib/datetime-policy'

export const HARVEST_EMAIL_ENABLED_KEY = 'harvest_agent_email_enabled'
export const HARVEST_EMAIL_RECIPIENTS_KEY = 'harvest_agent_email_recipients'

export type HarvestAccountSummary = {
  account?: string | null
  ok?: boolean
  message?: string | null
  imported?: number
  empty?: boolean
  opening?: number
  added?: boolean
}

export type HarvestVendorSummary = {
  vendor?: string | null
  ok?: boolean
  message?: string | null
  created?: number
  skipped?: number
  suffixed?: { original?: string; stored?: string }[]
  vendorCreated?: boolean
}

export type HarvestTaskEmailPayload = {
  taskKey: string
  status: 'pass' | 'fail'
  message?: string | null
  agentKey?: string | null
  hostname?: string | null
  startedAt: Date
  finishedAt: Date
  details?: {
    reason?: string | null
    accounts?: HarvestAccountSummary[]
    vendors?: HarvestVendorSummary[]
    url?: string | null
    loginRequired?: boolean
    account?: string | null
    code?: string | null
  } | null
  sample?: boolean
}

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatWhen(value: Date, timeZone = BUSINESS_TIME_ZONE): string {
  return value.toLocaleString('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function taskLabel(taskKey: string): string {
  if (taskKey === 'customer_accounts') return 'Customer accounts'
  if (taskKey === 'vendor_invoices') return 'Vendor invoices'
  if (taskKey === 'cstore_keepalive') return 'Cstore keep-alive'
  if (taskKey === 'agent_paused') return 'Agent paused'
  return taskKey.replace(/_/g, ' ')
}

function durationLabel(startedAt: Date, finishedAt: Date): string {
  const sec = Math.max(0, Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000))
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const rem = sec % 60
  return rem ? `${min}m ${rem}s` : `${min}m`
}

function accountRows(
  accounts: HarvestAccountSummary[],
  filter: (a: HarvestAccountSummary) => boolean
): string {
  const rows = accounts.filter(filter)
  if (rows.length === 0) return ''
  return rows
    .map((a) => {
      const name = escapeHtmlText(a.account || '—')
      const detail = escapeHtmlText(a.message || '')
      const badge = a.added ? ' <span style="color:#7c3aed;font-size:12px">(new)</span>' : ''
      return `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">${name}${badge}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#444">${detail || '—'}</td></tr>`
    })
    .join('')
}

function vendorRows(
  vendors: HarvestVendorSummary[],
  filter: (v: HarvestVendorSummary) => boolean
): string {
  const rows = vendors.filter(filter)
  if (rows.length === 0) return ''
  return rows
    .map((v) => {
      const name = escapeHtmlText(v.vendor || '—')
      const detail = escapeHtmlText(v.message || '')
      const badge = v.vendorCreated ? ' <span style="color:#7c3aed;font-size:12px">(new)</span>' : ''
      return `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">${name}${badge}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#444">${detail || '—'}</td></tr>`
    })
    .join('')
}

export function buildHarvestTaskEmailHtml(payload: HarvestTaskEmailPayload): string {
  const baseUrl = getPublicAppUrlFromEnv()
  const settingsUrl = baseUrl ? `${baseUrl}/settings/harvest-agent` : '/settings/harvest-agent'
  const passed = payload.status === 'pass'
  const statusColor = passed ? '#15803d' : '#b91c1c'
  const statusText = passed ? 'Pass' : 'Fail'
  const accounts = payload.details?.accounts || []
  const completed = accounts.filter((a) => a.ok)
  const failed = accounts.filter((a) => !a.ok)
  const newlyAdded = accounts.filter((a) => a.added && a.ok)
  const sampleNote = payload.sample
    ? `<p style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:10px 12px;color:#92400e;font-size:13px">This is a sample email so you can preview the layout.</p>`
    : ''

  let accountSection = ''
  if (payload.taskKey === 'customer_accounts' && accounts.length > 0) {
    accountSection = `
      <h3 style="margin:24px 0 8px;font-size:15px;color:#111">Completed (${completed.length})</h3>
      ${
        completed.length
          ? `<table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="background:#f9fafb;text-align:left"><th style="padding:8px 12px">Customer</th><th style="padding:8px 12px">Result</th></tr></thead><tbody>${accountRows(accounts, (a) => Boolean(a.ok))}</tbody></table>`
          : '<p style="color:#666;margin:0">None</p>'
      }
      <h3 style="margin:24px 0 8px;font-size:15px;color:#111">Failed (${failed.length})</h3>
      ${
        failed.length
          ? `<table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="background:#fef2f2;text-align:left"><th style="padding:8px 12px">Customer</th><th style="padding:8px 12px">Error</th></tr></thead><tbody>${accountRows(accounts, (a) => !a.ok)}</tbody></table>`
          : '<p style="color:#666;margin:0">None</p>'
      }
      <h3 style="margin:24px 0 8px;font-size:15px;color:#111">New names added (${newlyAdded.length})</h3>
      ${
        newlyAdded.length
          ? `<ul style="margin:0;padding-left:20px;color:#444">${newlyAdded.map((a) => `<li>${escapeHtmlText(a.account || '—')}</li>`).join('')}</ul>`
          : '<p style="color:#666;margin:0">None</p>'
      }`
  }

  const vendors = payload.details?.vendors || []
  if (payload.taskKey === 'vendor_invoices' && vendors.length > 0) {
    const vendorOk = vendors.filter((v) => v.ok)
    const vendorFail = vendors.filter((v) => !v.ok)
    const vendorNew = vendors.filter((v) => v.vendorCreated && v.ok)
    const suffixed = vendors.flatMap((v) =>
      (v.suffixed || []).map((s) => ({
        vendor: v.vendor,
        original: s.original,
        stored: s.stored
      }))
    )
    accountSection = `
      <h3 style="margin:24px 0 8px;font-size:15px;color:#111">Completed (${vendorOk.length})</h3>
      ${
        vendorOk.length
          ? `<table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="background:#f9fafb;text-align:left"><th style="padding:8px 12px">Vendor</th><th style="padding:8px 12px">Result</th></tr></thead><tbody>${vendorRows(vendors, (v) => Boolean(v.ok))}</tbody></table>`
          : '<p style="color:#666;margin:0">None</p>'
      }
      <h3 style="margin:24px 0 8px;font-size:15px;color:#111">Failed (${vendorFail.length})</h3>
      ${
        vendorFail.length
          ? `<table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="background:#fef2f2;text-align:left"><th style="padding:8px 12px">Vendor</th><th style="padding:8px 12px">Error</th></tr></thead><tbody>${vendorRows(vendors, (v) => !v.ok)}</tbody></table>`
          : '<p style="color:#666;margin:0">None</p>'
      }
      <h3 style="margin:24px 0 8px;font-size:15px;color:#111">New vendors added (${vendorNew.length})</h3>
      ${
        vendorNew.length
          ? `<ul style="margin:0;padding-left:20px;color:#444">${vendorNew.map((v) => `<li>${escapeHtmlText(v.vendor || '—')}</li>`).join('')}</ul>`
          : '<p style="color:#666;margin:0">None</p>'
      }
      <h3 style="margin:24px 0 8px;font-size:15px;color:#111">Invoice numbers with a letter (${suffixed.length})</h3>
      ${
        suffixed.length
          ? `<ul style="margin:0;padding-left:20px;color:#444">${suffixed
              .map(
                (s) =>
                  `<li>${escapeHtmlText(s.vendor || '')}: Cstore ${escapeHtmlText(s.original || '')} stored as ${escapeHtmlText(s.stored || '')}</li>`
              )
              .join('')}</ul>`
          : '<p style="color:#666;margin:0">None</p>'
      }`
  }

  const agentLine = [payload.agentKey, payload.hostname].filter(Boolean).join(' · ') || '—'
  const reason = payload.details?.reason ? ` · ${escapeHtmlText(payload.details.reason)}` : ''

  const pauseSection =
    payload.taskKey === 'agent_paused'
      ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin:16px 0;color:#991b1b">
          <p style="margin:0 0 8px;font-weight:600">All harvest jobs are paused on this PC.</p>
          <p style="margin:0;font-size:14px;color:#7f1d1d">Open the harvest agent dashboard on that machine, sign into Cstore in Chrome if needed, verify the password, then click <strong>Resume jobs</strong>. The agent will not retry login automatically.</p>
        </div>`
      : ''

  return `<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:20px;color:#111">
  ${sampleNote}
  <h2 style="margin:0 0 8px;font-size:20px">Harvest agent — ${escapeHtmlText(taskLabel(payload.taskKey))}</h2>
  <p style="margin:0 0 16px"><span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${passed ? '#dcfce7' : '#fee2e2'};color:${statusColor};font-weight:600;font-size:13px">${statusText}</span></p>
  ${pauseSection}
  <p style="margin:0 0 16px;font-size:15px;color:#333">${escapeHtmlText(payload.message || 'Task finished.')}</p>
  <table style="width:100%;font-size:13px;color:#555;margin-bottom:8px">
    <tr><td style="padding:4px 0;width:120px">Agent</td><td>${escapeHtmlText(agentLine)}${reason}</td></tr>
    <tr><td style="padding:4px 0">Finished</td><td>${escapeHtmlText(formatWhen(payload.finishedAt))}</td></tr>
    <tr><td style="padding:4px 0">Duration</td><td>${escapeHtmlText(durationLabel(payload.startedAt, payload.finishedAt))}</td></tr>
  </table>
  ${accountSection}
  <p style="margin-top:28px;font-size:12px;color:#888"><a href="${settingsUrl}" style="color:#2563eb">View harvest agent log</a> · Automated message from Shift Close</p>
</body></html>`
}

export function buildSampleHarvestTaskEmail(): HarvestTaskEmailPayload {
  const finishedAt = new Date()
  const startedAt = new Date(finishedAt.getTime() - 107_000)
  return {
    taskKey: 'customer_accounts',
    status: 'pass',
    message: '16 imported, 0 failed, 1 new name(s)',
    agentKey: 'home-pc',
    hostname: 'EDM-PC2',
    startedAt,
    finishedAt,
    sample: true,
    details: {
      reason: 'once',
      accounts: [
        { account: 'CARON CHARLEMAGNE', ok: true, message: 'imported 3 line(s)', imported: 3 },
        { account: 'CHRISTOPHER COX', ok: true, message: 'imported 4 line(s)', imported: 4 },
        { account: 'CPJ', ok: true, message: 'imported 22 line(s)', imported: 22 },
        { account: 'ENVIROGREEN', ok: true, message: 'no activity this month (opening 5421.43)', empty: true, opening: 5421.43 },
        { account: 'NEW CSTORE CUSTOMER', ok: true, message: 'imported 2 line(s)', imported: 2, added: true }
      ]
    }
  }
}

export async function readHarvestEmailSettings() {
  const [enabledRow, recipientsRow] = await Promise.all([
    prisma.appSettings.findUnique({ where: { key: HARVEST_EMAIL_ENABLED_KEY } }),
    prisma.appSettings.findUnique({ where: { key: HARVEST_EMAIL_RECIPIENTS_KEY } })
  ])
  return {
    enabled: enabledRow?.value === 'true',
    recipients: recipientsRow?.value ?? ''
  }
}

export function harvestTaskEmailSubject(payload: HarvestTaskEmailPayload): string {
  const label = taskLabel(payload.taskKey)
  const status = payload.status === 'pass' ? 'Pass' : 'Fail'
  const sample = payload.sample ? ' (sample)' : ''
  return `Harvest agent — ${label} — ${status}${sample}`
}

export async function sendHarvestTaskEmail(payload: HarvestTaskEmailPayload): Promise<number> {
  if (payload.sample) {
    throw new Error('Use sendHarvestTaskEmailTo for sample sends')
  }
  const settings = await readHarvestEmailSettings()
  if (!settings.enabled) return 0
  const emails = parseRecipientEmails(settings.recipients)
  if (emails.length === 0) return 0

  const html = buildHarvestTaskEmailHtml(payload)
  const subject = harvestTaskEmailSubject(payload)
  for (const to of emails) {
    await sendMail({ to, subject, html })
  }
  return emails.length
}

export async function sendHarvestTaskEmailTo(payload: HarvestTaskEmailPayload, to: string): Promise<void> {
  const html = buildHarvestTaskEmailHtml(payload)
  const subject = harvestTaskEmailSubject(payload)
  await sendMail({ to, subject, html })
}

export async function notifyHarvestTaskFinished(params: {
  taskKey: string
  status: string
  message?: string | null
  agentKey?: string | null
  hostname?: string | null
  startedAt: Date
  finishedAt: Date
  details?: unknown
}): Promise<void> {
  try {
    const settings = await readHarvestEmailSettings()
    if (!settings.enabled) return
    const emails = parseRecipientEmails(settings.recipients)
    if (emails.length === 0) return

    const details =
      params.details && typeof params.details === 'object'
        ? (params.details as HarvestTaskEmailPayload['details'])
        : null

    await sendHarvestTaskEmail({
      taskKey: params.taskKey,
      status: params.status === 'pass' ? 'pass' : 'fail',
      message: params.message,
      agentKey: params.agentKey,
      hostname: params.hostname,
      startedAt: params.startedAt,
      finishedAt: params.finishedAt,
      details
    })
  } catch (error) {
    console.error('Harvest task email failed:', error)
  }
}
