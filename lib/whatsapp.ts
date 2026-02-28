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

  // Normalize to E.164: ensure + prefix
  let normalizedTo = to.replace(/\D/g, '')
  if (!normalizedTo.startsWith('1') && normalizedTo.length === 10) {
    normalizedTo = '1' + normalizedTo // Assume US if 10 digits
  }
  const toWhatsApp = `whatsapp:+${normalizedTo}`

  const client = twilio(accountSid, authToken)
  await client.messages.create({
    body,
    from,
    to: toWhatsApp
  })
}

export async function sendWhatsAppWithMedia(
  to: string,
  body: string,
  mediaUrl: string
): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_FROM

  if (!accountSid || !authToken || !from) {
    throw new Error(
      'WhatsApp not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM in environment.'
    )
  }

  let normalizedTo = to.replace(/\D/g, '')
  if (!normalizedTo.startsWith('1') && normalizedTo.length === 10) {
    normalizedTo = '1' + normalizedTo
  }
  const toWhatsApp = `whatsapp:+${normalizedTo}`

  const client = twilio(accountSid, authToken)
  await client.messages.create({
    body,
    from,
    to: toWhatsApp,
    mediaUrl: [mediaUrl]
  })
}

export function isWhatsAppConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_FROM
  )
}
