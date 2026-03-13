/**
 * Deftform API client
 * Docs: https://help.deftform.com/api/introduction
 */

const BASE_URL = 'https://deftform.com/api/v1'

export interface DeftformFieldResponse {
  label: string
  response: string
  uuid: string
  custom_key?: string
}

export interface DeftformResponse {
  id?: string // UUID (may be in different field depending on API version)
  uuid?: string
  number?: number
  number_formatted?: string
  form_id?: string
  form_name?: string
  referrer?: string | null
  created_at?: string
  data?: Array<Array<DeftformFieldResponse>>
}

export interface DeftformForm {
  id: string
  name: string
  [key: string]: unknown
}

export interface DeftformApiResponse<T> {
  success: boolean
  data?: T
  message?: string
}

export interface DeftformPdfResponse {
  pdf_url: string
}

function getHeaders(): HeadersInit {
  const token = process.env.DEFTFORM_ACCESS_TOKEN
  if (!token) {
    throw new Error('DEFTFORM_ACCESS_TOKEN is not set')
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  }
}

export async function fetchForms(): Promise<DeftformForm[]> {
  const res = await fetch(`${BASE_URL}/forms`, { headers: getHeaders() })
  const json = (await res.json()) as DeftformApiResponse<DeftformForm[]>
  if (!res.ok) {
    throw new Error(json.message || `Deftform API error: ${res.status}`)
  }
  if (!json.success || !json.data) {
    throw new Error(json.message || 'Failed to fetch forms')
  }
  return json.data
}

/** Fetch raw JSON from responses endpoint (for debugging) */
export async function fetchResponsesRaw(formId: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/responses/${formId}`, { headers: getHeaders() })
  return res.json()
}

export async function fetchResponses(formId: string): Promise<DeftformResponse[]> {
  const res = await fetch(`${BASE_URL}/responses/${formId}`, { headers: getHeaders() })
  const json = (await res.json()) as DeftformApiResponse<DeftformResponse[] | { responses?: DeftformResponse[] } | Record<string, unknown>>
  if (!res.ok) {
    throw new Error((json as { message?: string }).message || `Deftform API error: ${res.status}`)
  }
  if (!json.success) {
    throw new Error((json as { message?: string }).message || 'Failed to fetch responses')
  }
  const data = json.data
  if (Array.isArray(data)) return data as DeftformResponse[]
  if (data && typeof data === 'object' && 'responses' in data && Array.isArray((data as { responses?: unknown }).responses)) {
    return (data as { responses: DeftformResponse[] }).responses
  }
  if (data && typeof data === 'object' && 'data' in data && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: DeftformResponse[] }).data
  }
  if (data && typeof data === 'object' && 'items' in data && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: DeftformResponse[] }).items
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>
    const entries = Object.entries(obj)
    const numericKeys = entries.filter(([k]) => /^\d+$/.test(k))
    if (numericKeys.length > 0) {
      return numericKeys.map(([, v]) => v) as DeftformResponse[]
    }
  }
  return []
}

export async function fetchResponsePdf(responseUuid: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/response/${responseUuid}/pdf`, { headers: getHeaders() })
  const json = (await res.json()) as DeftformApiResponse<DeftformPdfResponse>
  if (!res.ok) {
    throw new Error(json.message || `Deftform API error: ${res.status}`)
  }
  if (!json.success || !json.data?.pdf_url) {
    throw new Error(json.message || 'Failed to fetch PDF')
  }
  return json.data.pdf_url
}

/** UUID pattern - Deftform PDF endpoint requires this format */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Get a unique ID for deduplication (any unique string) */
export function getResponseId(r: DeftformResponse): string | null {
  const rec = r as Record<string, unknown>
  let id = rec.id ?? rec.uuid ?? rec.response_id ?? rec.responseId ?? rec.submission_id ?? rec.submissionId
  if (!id && (rec.response || rec.submission)) {
    const inner = (rec.response || rec.submission) as Record<string, unknown>
    id = inner.id ?? inner.uuid
  }
  if (typeof id === 'number') id = String(id)
  const s = (typeof id === 'string' ? id : null)?.trim() || null
  // Never use "undefined", "null", or empty
  if (!s || s === 'undefined' || s === 'null') return null
  return s
}

/** Get the UUID for PDF fetch - only returns IDs that match UUID format (PDF endpoint requires this) */
export function getResponseUuidForPdf(r: DeftformResponse): string | null {
  const id = getResponseId(r)
  if (!id || !UUID_REGEX.test(id)) return null
  return id
}

/** Extract applicant name and email from Deftform response data */
export function parseApplicantFromResponse(r: DeftformResponse): { name: string; email: string | null; formData: Record<string, string> } {
  const formData: Record<string, string> = {}
  let name = ''
  let email: string | null = null

  const rec = r as Record<string, unknown>
  const data = r.data ?? rec.fields ?? rec.responses ?? (rec.response as Record<string, unknown>)?.data ?? (rec.submission as Record<string, unknown>)?.data
  const flat = Array.isArray(data) ? data.flat() : []
  for (const field of flat) {
    if (!field || typeof field !== 'object') continue
    const f = field as Record<string, unknown>
    const val = String(f.response ?? f.value ?? '').trim()
    const key = (f.custom_key ?? f.label ?? f.uuid) as string
    const keyStr = typeof key === 'string' ? key.toLowerCase().replace(/\s+/g, '_') : String(f.uuid ?? '')
    if (val) formData[keyStr || `f${flat.indexOf(field)}`] = val

    const label = (String(f.label ?? '')).toLowerCase()
    if (label.includes('name') && !label.includes('email') && !name) name = val
    if ((label.includes('email') || keyStr === 'email') && !email) email = val || null
  }

  if (!name) {
    name = formData.full_name || formData.name || formData.first_name || 'Unknown'
  }
  if (!email) {
    email = formData.email || formData.email_address || null
  }

  return { name: name || 'Unknown', email, formData }
}
