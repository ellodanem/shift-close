/** Sample multi-mailbox threads until IMAP / Gmail sync ships. */

export type InboxMailboxId = 'station' | 'management' | 'os'
export type InboxQueueStatus = 'new' | 'assigned' | 'waiting' | 'done'
export type InboxTopic =
  | 'Fuel'
  | 'Customers'
  | 'Hiring'
  | 'Banking'
  | 'Vendors'
  | 'App mail'
  | 'Unsorted'

export type InboxParticipant = {
  name: string
  email: string
}

export type InboxMessage = {
  id: string
  from: InboxParticipant
  to: InboxParticipant[]
  cc: InboxParticipant[]
  sentAt: string
  body: string
  attachments?: Array<{ name: string; sizeLabel: string; id?: string; url?: string }>
}

export type InboxThread = {
  id: string
  subject: string
  mailboxId: InboxMailboxId
  mailboxLabel: string
  topic: InboxTopic
  status: InboxQueueStatus
  assignee: string | null
  unread: boolean
  preview: string
  when: string
  messages: InboxMessage[]
  linkedWork?: { label: string; detail: string; href?: string }
}

export const INBOX_MAILBOXES: Array<{ id: InboxMailboxId; label: string; address: string }> = [
  { id: 'station', label: 'Station', address: 'westline.slu@gmail.com' },
  { id: 'management', label: 'Management', address: 'totalarubis@gmail.com' },
  { id: 'os', label: 'O/S', address: 'totalauto_os@outlook.com' }
]

export const SAMPLE_INBOX_THREADS: InboxThread[] = [
  {
    id: 'rubis',
    subject: 'Invoice INV-8841 — September fuel',
    mailboxId: 'station',
    mailboxLabel: 'Station · westline.slu',
    topic: 'Fuel',
    status: 'new',
    assignee: null,
    unread: true,
    preview: 'Please find attached invoice for 20 Sep delivery',
    when: 'Yesterday',
    linkedWork: {
      label: 'Vendor invoice',
      detail: 'Rubis · INV-8841 — open Vendor Payments to match',
      href: '/vendor-payments/invoices'
    },
    messages: [
      {
        id: 'rubis-1',
        from: { name: 'Rubis St Lucia', email: 'accounts@rubis.example' },
        to: [{ name: 'Westline Enterprise', email: 'westline.slu@gmail.com' }],
        cc: [
          { name: 'Fuel desk', email: 'fuel@rubis.example' },
          { name: 'Westline archive', email: 'totalarubis@gmail.com' }
        ],
        sentAt: 'Sun 20 Sep, 7:14 AM',
        body: 'Good morning,\n\nPlease find attached invoice INV-8841 for the 20 September fuel delivery to Westline.\n\nKindly confirm receipt and advise payment timing.\n\nRegards,\nRubis Accounts',
        attachments: [{ name: 'INV-8841.pdf', sizeLabel: '186 KB' }]
      }
    ]
  },
  {
    id: 'cpj',
    subject: 'Query on September statement',
    mailboxId: 'management',
    mailboxLabel: 'Management · totalarubis',
    topic: 'Customers',
    status: 'waiting',
    assignee: 'Dane',
    unread: false,
    preview: 'Can you confirm the 4,388.50 charges?',
    when: 'Sat',
    linkedWork: {
      label: 'Customer account',
      detail: 'CPJ · Closing $21,774.82',
      href: '/customer-accounts'
    },
    messages: [
      {
        id: 'cpj-1',
        from: { name: 'CPJ accounts', email: 'accounts@cpj.example' },
        to: [{ name: 'Westline', email: 'totalarubis@gmail.com' }],
        cc: [{ name: 'CPJ finance', email: 'finance@cpj.example' }],
        sentAt: 'Fri 19 Sep, 2:40 PM',
        body: 'Please confirm the September charges of 4,388.50 on our credit account.'
      },
      {
        id: 'cpj-2',
        from: { name: 'Westline', email: 'westline.slu@gmail.com' },
        to: [{ name: 'CPJ accounts', email: 'accounts@cpj.example' }],
        cc: [{ name: 'CPJ finance', email: 'finance@cpj.example' }],
        sentAt: 'Sat 20 Sep, 9:05 AM',
        body: 'We confirmed the charges match the Cstore import for September; statement attached.'
      },
      {
        id: 'cpj-3',
        from: { name: 'CPJ', email: 'accounts@cpj.example' },
        to: [{ name: 'Westline', email: 'westline.slu@gmail.com' }],
        cc: [{ name: 'CPJ finance', email: 'finance@cpj.example' }],
        sentAt: 'Today, 8:12 AM',
        body: 'We will pay Friday, please send the updated statement.'
      }
    ]
  },
  {
    id: 'keisha',
    subject: 'Cashier application',
    mailboxId: 'station',
    mailboxLabel: 'Station · westline.slu',
    topic: 'Hiring',
    status: 'new',
    assignee: null,
    unread: true,
    preview: 'New application submitted',
    when: 'Fri',
    linkedWork: {
      label: 'Application',
      detail: 'Cashier · Keisha Charles',
      href: '/applications'
    },
    messages: [
      {
        id: 'keisha-1',
        from: { name: 'Keisha Charles', email: 'keisha.charles@example.com' },
        to: [{ name: 'Westline HR', email: 'westline.slu@gmail.com' }],
        cc: [],
        sentAt: 'Fri 19 Sep, 11:22 AM',
        body: 'Hello,\n\nI submitted a cashier application. Please find my resume attached.\n\nThank you,\nKeisha Charles',
        attachments: [{ name: 'Keisha-Charles-Resume.pdf', sizeLabel: '92 KB' }]
      }
    ]
  },
  {
    id: 'bank',
    subject: 'Deposit confirmation 19 Sep',
    mailboxId: 'management',
    mailboxLabel: 'Management · totalarubis',
    topic: 'Banking',
    status: 'done',
    assignee: 'Dane',
    unread: false,
    preview: 'XCD 8,420.00 received',
    when: 'Thu',
    linkedWork: {
      label: 'Deposit comparison',
      detail: '19 Sep · XCD 8,420.00',
      href: '/financial/deposit-comparisons'
    },
    messages: [
      {
        id: 'bank-1',
        from: { name: 'First Caribbean', email: 'alerts@fcib.example' },
        to: [{ name: 'Westline', email: 'totalarubis@gmail.com' }],
        cc: [],
        sentAt: 'Thu 18 Sep, 4:03 PM',
        body: 'Deposit confirmation: XCD 8,420.00 received on 19 Sep. Reference DEP-5812.'
      }
    ]
  },
  {
    id: 'app',
    subject: 'Missing deposit slip — 18 Sep',
    mailboxId: 'station',
    mailboxLabel: 'Station · westline.slu',
    topic: 'App mail',
    status: 'assigned',
    assignee: 'Dane',
    unread: false,
    preview: 'No slip scanned for Thursday close',
    when: 'Thu',
    linkedWork: {
      label: 'End of day',
      detail: '18 Sep missing deposit slip',
      href: '/days'
    },
    messages: [
      {
        id: 'app-1',
        from: { name: 'Shift Close', email: 'westline.slu@gmail.com' },
        to: [
          { name: 'Dane', email: 'dane.elrus1@gmail.com' },
          { name: 'Archive', email: 'totalarubis@gmail.com' }
        ],
        cc: [],
        sentAt: 'Thu 18 Sep, 10:15 PM',
        body: 'No deposit slip was scanned for Thursday close (18 Sep). Open End of Day to scan or waive with a note.'
      }
    ]
  }
]

export type ComposeMode = 'compose' | 'reply' | 'replyAll' | 'forward'

function uniqueByEmail(people: InboxParticipant[]): InboxParticipant[] {
  const seen = new Set<string>()
  const out: InboxParticipant[] = []
  for (const p of people) {
    const key = p.email.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

function formatAddressList(people: InboxParticipant[]): string {
  return people.map((p) => p.email).join(', ')
}

export function mailboxAddress(mailboxId: InboxMailboxId): string {
  return INBOX_MAILBOXES.find((m) => m.id === mailboxId)?.address ?? INBOX_MAILBOXES[0].address
}

/** Build To / CC / subject / quoted body for a compose action. */
export function buildComposeDraft(
  mode: ComposeMode,
  thread: InboxThread | null,
  ourAddresses: string[] = INBOX_MAILBOXES.map((m) => m.address.toLowerCase())
): { to: string; cc: string; bcc: string; subject: string; body: string; fromMailboxId: InboxMailboxId } {
  if (!thread || mode === 'compose') {
    return {
      to: '',
      cc: '',
      bcc: '',
      subject: '',
      body: '',
      fromMailboxId: 'station'
    }
  }

  const last = thread.messages[thread.messages.length - 1]
  const ours = new Set(ourAddresses.map((a) => a.toLowerCase()))
  const quoted = `\n\n---------- Original message ----------\nFrom: ${last.from.name} <${last.from.email}>\nDate: ${last.sentAt}\nTo: ${formatAddressList(last.to)}\n${
    last.cc.length ? `Cc: ${formatAddressList(last.cc)}\n` : ''
  }Subject: ${thread.subject}\n\n${last.body}`

  if (mode === 'forward') {
    return {
      to: '',
      cc: '',
      bcc: '',
      subject: thread.subject.toLowerCase().startsWith('fw:') ? thread.subject : `Fw: ${thread.subject}`,
      body: quoted.trimStart(),
      fromMailboxId: thread.mailboxId
    }
  }

  const replyTo = ours.has(last.from.email.toLowerCase())
    ? last.to.filter((p) => !ours.has(p.email.toLowerCase()))
    : [last.from]

  if (mode === 'reply') {
    return {
      to: formatAddressList(uniqueByEmail(replyTo)),
      cc: '',
      bcc: '',
      subject: thread.subject.toLowerCase().startsWith('re:') ? thread.subject : `Re: ${thread.subject}`,
      body: quoted.trimStart(),
      fromMailboxId: thread.mailboxId
    }
  }

  // replyAll — everyone on To/CC except ourselves; put original To peers on To, rest on CC
  const allOthers = uniqueByEmail([...last.to, ...last.cc, last.from]).filter(
    (p) => !ours.has(p.email.toLowerCase())
  )
  const toList = uniqueByEmail(replyTo.length ? replyTo : allOthers.slice(0, 1))
  const toEmails = new Set(toList.map((p) => p.email.toLowerCase()))
  const ccList = allOthers.filter((p) => !toEmails.has(p.email.toLowerCase()))

  return {
    to: formatAddressList(toList),
    cc: formatAddressList(ccList),
    bcc: '',
    subject: thread.subject.toLowerCase().startsWith('re:') ? thread.subject : `Re: ${thread.subject}`,
    body: quoted.trimStart(),
    fromMailboxId: thread.mailboxId
  }
}

export function statusLabel(status: InboxQueueStatus): string {
  switch (status) {
    case 'new':
      return 'New'
    case 'assigned':
      return 'Assigned'
    case 'waiting':
      return 'Waiting'
    case 'done':
      return 'Done'
  }
}
