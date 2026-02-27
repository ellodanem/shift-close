import nodemailer from 'nodemailer'
import { prisma } from '@/lib/prisma'

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
}

const SMTP_KEYS = ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from'] as const

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const rows = await prisma.appSettings.findMany({
    where: { key: { in: [...SMTP_KEYS] } }
  })
  const map = new Map(rows.map((r) => [r.key, r.value]))

  const user = map.get('smtp_user') || process.env.SMTP_USER
  const pass = map.get('smtp_pass') || process.env.SMTP_PASS
  if (!user || !pass) return null

  const host = map.get('smtp_host') || process.env.SMTP_HOST || 'smtp.gmail.com'
  const port = parseInt(map.get('smtp_port') || process.env.SMTP_PORT || '587', 10)
  const secure = (map.get('smtp_secure') || process.env.SMTP_SECURE || 'false') === 'true'
  const from = map.get('smtp_from') || process.env.EMAIL_FROM || user

  return { host, port, secure, user, pass, from }
}

export interface SendMailOptions {
  to: string
  subject: string
  html?: string
  text?: string
  cc?: string
  attachments?: Array<{
    filename: string
    content: Buffer
    contentType?: string
  }>
}

export async function sendMail(options: SendMailOptions): Promise<void> {
  const config = await getSmtpConfig()
  if (!config) {
    throw new Error('Email not configured. Set SMTP settings in Settings → Email (SMTP).')
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass }
  })

  await transporter.sendMail({
    from: config.from,
    to: options.to,
    subject: options.subject,
    text: options.text || (options.html ? options.html.replace(/<[^>]*>/g, '') : ''),
    html: options.html,
    cc: options.cc,
    attachments: options.attachments
  })
}
