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
  id: string // UUID
  number?: number
  number_formatted?: string
  form_id?: string
  form_name?: string
  referrer?: string | null
  created_at?: string
  data: Array<Array<DeftformFieldResponse>>
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

export async function fetchResponses(formId: string): Promise<DeftformResponse[]> {
  const res = await fetch(`${BASE_URL}/responses/${formId}`, { headers: getHeaders() })
  const json = (await res.json()) as DeftformApiResponse<DeftformResponse[]>
  if (!res.ok) {
    throw new Error(json.message || `Deftform API error: ${res.status}`)
  }
  if (!json.success || !json.data) {
    throw new Error(json.message || 'Failed to fetch responses')
  }
  return Array.isArray(json.data) ? json.data : []
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

/** Extract applicant name and email from Deftform response data */
export function parseApplicantFromResponse(r: DeftformResponse): { name: string; email: string | null; formData: Record<string, string> } {
  const formData: Record<string, string> = {}
  let name = ''
  let email: string | null = null

  const flat = r.data?.flat() ?? []
  for (const field of flat) {
    const val = String(field.response ?? '').trim()
    const key = field.custom_key || field.label?.toLowerCase().replace(/\s+/g, '_') || field.uuid
    if (val) formData[key] = val

    const label = (field.label || '').toLowerCase()
    if (label.includes('name') && !label.includes('email') && !name) name = val
    if ((label.includes('email') || key === 'email') && !email) email = val || null
  }

  if (!name) {
    name = formData.full_name || formData.name || formData.first_name || 'Unknown'
  }
  if (!email) {
    email = formData.email || formData.email_address || null
  }

  return { name: name || 'Unknown', email, formData }
}
