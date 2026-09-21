import type { InboxMailbox } from '@prisma/client'
import { ImapFlow } from 'imapflow'
import { simpleParser, type AddressObject, type ParsedMail } from 'mailparser'
import { put } from '@vercel/blob'
import { prisma } from '@/lib/prisma'
import {
  isOutlookLikeEmail,
  refreshMicrosoftAccessToken
} from '@/lib/microsoft-oauth'

export type MailboxPreset = {
  key: string
  label: string
  emailAddress: string
  imapHost: string
  imapPort: number
  imapSecure: boolean
  sortOrder: number
  authMethod?: 'password' | 'oauth'
}

/** Default Westline mailboxes — passwords / OAuth filled in Settings. */
export const INBOX_MAILBOX_PRESETS: MailboxPreset[] = [
  {
    key: 'station',
    label: 'Station',
    emailAddress: 'westline.slu@gmail.com',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapSecure: true,
    sortOrder: 0,
    authMethod: 'password'
  },
  {
    key: 'management',
    label: 'Management',
    emailAddress: 'totalarubis@gmail.com',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapSecure: true,
    sortOrder: 1,
    authMethod: 'password'
  },
  {
    key: 'os',
    label: 'O/S',
    emailAddress: 'totalauto_os@outlook.com',
    // Per Microsoft Support: outlook.office365.com:993 SSL/TLS + OAuth2
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: true,
    sortOrder: 2,
    authMethod: 'oauth'
  }
]

type Person = { name: string; email: string }

function addressesFrom(value?: AddressObject | AddressObject[]): Person[] {
  if (!value) return []
  const list = Array.isArray(value) ? value : [value]
  const out: Person[] = []
  for (const group of list) {
    for (const a of group.value || []) {
      const email = (a.address || '').trim().toLowerCase()
      if (!email) continue
      out.push({ name: (a.name || email).trim(), email })
    }
  }
  return out
}

function normalizeMessageId(id?: string | null): string | null {
  if (!id?.trim()) return null
  return id.trim().replace(/^<|>$/g, '').toLowerCase()
}

function stripSubject(subject: string): string {
  return subject.replace(/^(re|fw|fwd)\s*:\s*/gi, '').trim() || '(no subject)'
}

export function inferTopic(fromEmail: string, subject: string): string {
  const hay = `${fromEmail} ${subject}`.toLowerCase()
  if (/rubis|fuel|tank|diesel|unleaded|gas\b/.test(hay)) return 'Fuel'
  if (/invoice|vendor|supplier|payment due/.test(hay)) return 'Vendors'
  if (/statement|credit account|accounts receivable|cpj|massy|distillers/.test(hay)) return 'Customers'
  if (/application|resume|cashier|hiring|interview/.test(hay)) return 'Hiring'
  if (/bank|deposit|fcib|first caribbean|cleared/.test(hay)) return 'Banking'
  if (/shift close|missing deposit|end of day|pay period/.test(hay)) return 'App mail'
  return 'Unsorted'
}

function snippetFrom(text: string, max = 140): string {
  const one = text.replace(/\s+/g, ' ').trim()
  if (one.length <= max) return one
  return `${one.slice(0, max - 1)}…`
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function formatAttachmentSize(n: number): string {
  return formatSize(n)
}

async function resolveAccessToken(mailbox: InboxMailbox): Promise<string | null> {
  if (mailbox.authMethod !== 'oauth') return null
  if (!mailbox.oauthRefreshToken && !mailbox.oauthAccessToken) {
    throw new Error('Outlook mailbox is not signed in with Microsoft. Use Sign in with Microsoft.')
  }
  const skewMs = 90_000
  if (
    mailbox.oauthAccessToken &&
    mailbox.oauthExpiresAt &&
    mailbox.oauthExpiresAt.getTime() > Date.now() + skewMs
  ) {
    return mailbox.oauthAccessToken
  }
  if (!mailbox.oauthRefreshToken) {
    throw new Error('Microsoft sign-in expired. Sign in with Microsoft again.')
  }
  const tokens = await refreshMicrosoftAccessToken(mailbox.oauthRefreshToken)
  await prisma.inboxMailbox.update({
    where: { id: mailbox.id },
    data: {
      oauthAccessToken: tokens.accessToken,
      oauthRefreshToken: tokens.refreshToken,
      oauthExpiresAt: tokens.expiresAt
    }
  })
  return tokens.accessToken
}

async function createClient(mailbox: InboxMailbox): Promise<ImapFlow> {
  const accessToken = await resolveAccessToken(mailbox)
  const auth = accessToken
    ? { user: mailbox.imapUser || mailbox.emailAddress, accessToken }
    : { user: mailbox.imapUser, pass: mailbox.imapPass }

  if (!accessToken && !mailbox.imapPass?.trim()) {
    throw new Error('IMAP password not set')
  }

  if (!accessToken && isOutlookLikeEmail(mailbox.emailAddress)) {
    throw new Error(
      'Outlook.com requires Modern Auth (OAuth2), not a password. Use Sign in with Microsoft. See Microsoft Support: POP/IMAP settings for Outlook.com.'
    )
  }

  const client = new ImapFlow({
    host: mailbox.imapHost,
    port: mailbox.imapPort,
    secure: mailbox.imapSecure,
    auth,
    logger: false,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 60_000
  })
  await client.connect()
  return client
}

export async function testMailboxConnection(
  mailbox: InboxMailbox
): Promise<{ ok: true; folders: number } | { ok: false; error: string }> {
  let client: ImapFlow | null = null
  try {
    client = await createClient(mailbox)
    const boxes = await client.list()
    return { ok: true, folders: boxes.length }
  } catch (e) {
    const raw = e instanceof Error ? e.message : 'Connection failed'
    const hint =
      /login is disabled|basic.?auth|authentication failed|invalid credentials/i.test(raw) &&
      isOutlookLikeEmail(mailbox.emailAddress)
        ? ' Outlook.com no longer allows password IMAP — use Sign in with Microsoft (OAuth2).'
        : ''
    return { ok: false, error: `${raw}${hint}` }
  } finally {
    if (client) {
      try {
        await client.logout()
      } catch {
        /* ignore */
      }
    }
  }
}

async function uploadAttachment(
  mailboxKey: string,
  messageId: string,
  filename: string,
  content: Buffer,
  contentType: string
): Promise<string | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null
  if (content.length > 8 * 1024 * 1024) return null
  try {
    const safe = filename.replace(/[^\w.\-]+/g, '_').slice(0, 80) || 'file'
    const blob = await put(`inbox/${mailboxKey}/${messageId}/${safe}`, content, {
      access: 'public',
      contentType,
      addRandomSuffix: true
    })
    return blob.url
  } catch (e) {
    console.warn('inbox attachment blob upload failed', e)
    return null
  }
}

export type SyncMailboxResult = {
  mailboxId: string
  key: string
  imported: number
  skipped: number
  error?: string
}

/**
 * Sync recent INBOX messages for one mailbox.
 * Default: last 40 days, max 80 messages (serverless-friendly).
 */
export async function syncMailbox(
  mailboxId: string,
  options?: { maxMessages?: number; lookbackDays?: number }
): Promise<SyncMailboxResult> {
  const maxMessages = options?.maxMessages ?? 80
  const lookbackDays = options?.lookbackDays ?? 40

  const mailbox = await prisma.inboxMailbox.findUnique({ where: { id: mailboxId } })
  if (!mailbox) return { mailboxId, key: '', imported: 0, skipped: 0, error: 'Mailbox not found' }
  if (!mailbox.enabled) {
    return { mailboxId, key: mailbox.key, imported: 0, skipped: 0, error: 'Mailbox disabled' }
  }
  const hasAuth =
    mailbox.authMethod === 'oauth'
      ? Boolean(mailbox.oauthRefreshToken || mailbox.oauthAccessToken)
      : Boolean(mailbox.imapPass.trim())
  if (!hasAuth) {
    return {
      mailboxId,
      key: mailbox.key,
      imported: 0,
      skipped: 0,
      error:
        mailbox.authMethod === 'oauth'
          ? 'Not signed in with Microsoft'
          : 'IMAP password not set'
    }
  }

  let client: ImapFlow | null = null
  let imported = 0
  let skipped = 0

  try {
    client = await createClient(mailbox)
    const lock = await client.getMailboxLock('INBOX')
    try {
      const since = new Date()
      since.setDate(since.getDate() - lookbackDays)
      const uids = await client.search({ since }, { uid: true })
      const list = Array.isArray(uids) ? uids : []
      const recent = list.slice(-maxMessages)

      for (const uid of recent) {
        const existing = await prisma.inboxMessage.findUnique({
          where: { mailboxId_imapUid: { mailboxId: mailbox.id, imapUid: uid } }
        })
        if (existing) {
          skipped += 1
          continue
        }

        const downloaded = await client.download(uid, undefined, { uid: true })
        if (!downloaded?.content) {
          skipped += 1
          continue
        }

        const chunks: Buffer[] = []
        for await (const chunk of downloaded.content) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        }
        const raw = Buffer.concat(chunks)
        const parsed: ParsedMail = await simpleParser(raw)
        await persistParsedMessage(mailbox, uid, parsed)
        imported += 1
      }
    } finally {
      lock.release()
    }

    await prisma.inboxMailbox.update({
      where: { id: mailbox.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncError: null,
        lastSyncCount: imported
      }
    })

    return { mailboxId: mailbox.id, key: mailbox.key, imported, skipped }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Sync failed'
    await prisma.inboxMailbox.update({
      where: { id: mailbox.id },
      data: { lastSyncAt: new Date(), lastSyncError: message }
    })
    return { mailboxId: mailbox.id, key: mailbox.key, imported, skipped, error: message }
  } finally {
    if (client) {
      try {
        await client.logout()
      } catch {
        /* ignore */
      }
    }
  }
}

async function persistParsedMessage(mailbox: InboxMailbox, uid: number, parsed: ParsedMail) {
  const from = addressesFrom(parsed.from)[0] || { name: '', email: '' }
  const to = addressesFrom(parsed.to)
  const cc = addressesFrom(parsed.cc)
  const subject = (parsed.subject || '(no subject)').trim()
  const messageId = normalizeMessageId(parsed.messageId)
  const inReplyTo = normalizeMessageId(
    Array.isArray(parsed.inReplyTo) ? parsed.inReplyTo[0] : parsed.inReplyTo
  )
  const references = (parsed.references
    ? (Array.isArray(parsed.references) ? parsed.references : [parsed.references])
    : []
  )
    .map((r) => normalizeMessageId(String(r)))
    .filter(Boolean) as string[]

  const rootRef = references[0] || inReplyTo || messageId
  const conversationKey =
    rootRef ||
    `subj:${stripSubject(subject).toLowerCase()}|${[from.email, ...to.map((t) => t.email)].sort().join(',')}`

  const bodyText =
    (parsed.text || '').trim() ||
    (parsed.html ? parsed.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '')
  const sentAt = parsed.date || new Date()
  const topic = inferTopic(from.email, subject)

  let thread = await prisma.inboxThread.findUnique({
    where: { mailboxId_conversationKey: { mailboxId: mailbox.id, conversationKey } }
  })

  if (!thread && inReplyTo) {
    const parent = await prisma.inboxMessage.findFirst({
      where: { mailboxId: mailbox.id, messageIdHeader: inReplyTo }
    })
    if (parent) {
      thread = await prisma.inboxThread.findUnique({ where: { id: parent.threadId } })
    }
  }

  if (!thread) {
    thread = await prisma.inboxThread.create({
      data: {
        mailboxId: mailbox.id,
        conversationKey,
        subject: stripSubject(subject),
        topic,
        status: 'new',
        snippet: snippetFrom(bodyText),
        unread: true,
        fromName: from.name,
        fromEmail: from.email,
        lastMessageAt: sentAt
      }
    })
  } else {
    await prisma.inboxThread.update({
      where: { id: thread.id },
      data: {
        snippet: snippetFrom(bodyText),
        fromName: from.name,
        fromEmail: from.email,
        lastMessageAt: sentAt,
        unread: thread.status === 'done' ? thread.unread : true,
        status: thread.status === 'done' ? thread.status : thread.status === 'waiting' ? 'waiting' : thread.status
      }
    })
  }

  const message = await prisma.inboxMessage.create({
    data: {
      threadId: thread.id,
      mailboxId: mailbox.id,
      imapUid: uid,
      messageIdHeader: messageId,
      inReplyTo,
      fromName: from.name,
      fromEmail: from.email,
      toJson: JSON.stringify(to),
      ccJson: JSON.stringify(cc),
      subject,
      bodyText,
      bodyHtml: parsed.html || null,
      sentAt
    }
  })

  const atts = parsed.attachments || []
  for (const att of atts) {
    if (!att.content || !att.filename) continue
    if (att.contentDisposition === 'inline' && !att.filename) continue
    const buf = Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content)
    const blobUrl = await uploadAttachment(
      mailbox.key,
      message.id,
      att.filename,
      buf,
      att.contentType || 'application/octet-stream'
    )
    await prisma.inboxAttachment.create({
      data: {
        messageId: message.id,
        filename: att.filename,
        contentType: att.contentType || 'application/octet-stream',
        size: buf.length,
        blobUrl,
        partPath: null
      }
    })
  }
}

export async function fetchAttachmentFromImap(attachmentId: string): Promise<{
  filename: string
  contentType: string
  content: Buffer
} | null> {
  const att = await prisma.inboxAttachment.findUnique({
    where: { id: attachmentId },
    include: { message: { include: { mailbox: true } } }
  })
  if (!att) return null
  if (att.blobUrl) {
    const res = await fetch(att.blobUrl)
    if (!res.ok) return null
    const ab = await res.arrayBuffer()
    return {
      filename: att.filename,
      contentType: att.contentType,
      content: Buffer.from(ab)
    }
  }

  const mailbox = att.message.mailbox
  let client: ImapFlow | null = null
  try {
    client = await createClient(mailbox)
    const lock = await client.getMailboxLock('INBOX')
    try {
      const downloaded = await client.download(att.message.imapUid, undefined, { uid: true })
      if (!downloaded?.content) return null
      const chunks: Buffer[] = []
      for await (const chunk of downloaded.content) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      const parsed = await simpleParser(Buffer.concat(chunks))
      const match = (parsed.attachments || []).find(
        (a) => a.filename === att.filename || (a.filename && a.filename.includes(att.filename))
      )
      if (!match?.content) return null
      const content = Buffer.isBuffer(match.content) ? match.content : Buffer.from(match.content)
      return {
        filename: att.filename,
        contentType: att.contentType || match.contentType || 'application/octet-stream',
        content
      }
    } finally {
      lock.release()
    }
  } finally {
    if (client) {
      try {
        await client.logout()
      } catch {
        /* ignore */
      }
    }
  }
}

export async function ensureDefaultMailboxes(): Promise<number> {
  let created = 0
  for (const preset of INBOX_MAILBOX_PRESETS) {
    const existing = await prisma.inboxMailbox.findUnique({ where: { key: preset.key } })
    if (existing) {
      // Keep Outlook.com on the official host + oauth auth method
      if (preset.authMethod === 'oauth') {
        await prisma.inboxMailbox.update({
          where: { id: existing.id },
          data: {
            imapHost: preset.imapHost,
            imapPort: preset.imapPort,
            imapSecure: preset.imapSecure,
            authMethod: 'oauth'
          }
        })
      }
      continue
    }
    await prisma.inboxMailbox.create({
      data: {
        key: preset.key,
        label: preset.label,
        emailAddress: preset.emailAddress,
        imapHost: preset.imapHost,
        imapPort: preset.imapPort,
        imapSecure: preset.imapSecure,
        imapUser: preset.emailAddress,
        imapPass: '',
        authMethod: preset.authMethod || 'password',
        enabled: false,
        sortOrder: preset.sortOrder
      }
    })
    created += 1
  }
  return created
}

export function mailboxPublic(m: InboxMailbox) {
  return {
    id: m.id,
    key: m.key,
    label: m.label,
    emailAddress: m.emailAddress,
    imapHost: m.imapHost,
    imapPort: m.imapPort,
    imapSecure: m.imapSecure,
    imapUser: m.imapUser,
    authMethod: m.authMethod,
    hasPassword: Boolean(m.imapPass?.trim()),
    hasOAuth: Boolean(m.oauthRefreshToken || m.oauthAccessToken),
    oauthExpiresAt: m.oauthExpiresAt?.toISOString() ?? null,
    requiresMicrosoftSignIn: m.authMethod === 'oauth' || isOutlookLikeEmail(m.emailAddress),
    enabled: m.enabled,
    sortOrder: m.sortOrder,
    lastSyncAt: m.lastSyncAt?.toISOString() ?? null,
    lastSyncError: m.lastSyncError,
    lastSyncCount: m.lastSyncCount
  }
}
