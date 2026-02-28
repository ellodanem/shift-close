/**
 * Send WhatsApp messages via Twilio.
 * Requires: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM (e.g. whatsapp:+15558085661)
 */

import twilio from 'twilio'

export async function sendWhatsApp(to: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_FROM

  if (!accountSid || !authToken || !from) {
    throw new Error(
      'WhatsApp not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM in environment.'
    )
  }

  const fromWhatsApp = from.trim().toLowerCase().startsWith('whatsapp:')
    ? from.trim()
    : `whatsapp:${from.trim().startsWith('+') ? from.trim() : '+' + from.trim().replace(/\D/g, '')}`

  // Normalize to E.164: ensure + prefix
  let normalizedTo = to.replace(/\D/g, '')
  if (!normalizedTo.startsWith('1') && normalizedTo.length === 10) {
    normalizedTo = '1' + normalizedTo // Assume US if 10 digits
  }
  const toWhatsApp = `whatsapp:+${normalizedTo}`

  const client = twilio(accountSid, authToken)
  await client.messages.create({
    body,
    from: fromWhatsApp,
    to: toWhatsApp
  })
}

export async function sendWhatsAppWithMedia(
  to: string,
  body: string,
  mediaUrl: string,
  options?: { weekStart?: string }
): Promise<void> {
  const templateSid = process.env.TWILIO_WHATSAPP_ROSTER_TEMPLATE_SID?.trim()
  if (templateSid) {
    const weekText = options?.weekStart ?? body
    await sendWhatsAppTemplate(to, templateSid, { '1': weekText, '2': mediaUrl })
    return
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_FROM

  if (!accountSid || !authToken || !from) {
    throw new Error(
      'WhatsApp not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM in environment.'
    )
  }

  const fromWhatsApp = from.trim().toLowerCase().startsWith('whatsapp:')
    ? from.trim()
    : `whatsapp:${from.trim().startsWith('+') ? from.trim() : '+' + from.trim().replace(/\D/g, '')}`

  let normalizedTo = to.replace(/\D/g, '')
  if (!normalizedTo.startsWith('1') && normalizedTo.length === 10) {
    normalizedTo = '1' + normalizedTo
  }
  const toWhatsApp = `whatsapp:+${normalizedTo}`

  const client = twilio(accountSid, authToken)
  await client.messages.create({
    body,
    from: fromWhatsApp,
    to: toWhatsApp,
    mediaUrl: [mediaUrl]
  })
}

/**
 * Send WhatsApp message using an approved Content Template.
 * Use when outside the 24-hour window (template required).
 * ContentVariables: map placeholder names (e.g. "1", "2") to values.
 */
export async function sendWhatsAppTemplate(
  to: string,
  contentSid: string,
  contentVariables: Record<string, string>
): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_FROM

  if (!accountSid || !authToken || !from) {
    throw new Error(
      'WhatsApp not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM in environment.'
    )
  }

  const fromWhatsApp = from.trim().toLowerCase().startsWith('whatsapp:')
    ? from.trim()
    : `whatsapp:${from.trim().startsWith('+') ? from.trim() : '+' + from.trim().replace(/\D/g, '')}`

  let normalizedTo = to.replace(/\D/g, '')
  if (!normalizedTo.startsWith('1') && normalizedTo.length === 10) {
    normalizedTo = '1' + normalizedTo
  }
  const toWhatsApp = `whatsapp:+${normalizedTo}`

  const client = twilio(accountSid, authToken)
  await client.messages.create({
    contentSid,
    contentVariables: JSON.stringify(contentVariables),
    from: fromWhatsApp,
    to: toWhatsApp
  })
}

export function isWhatsAppConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_FROM
  )
}
