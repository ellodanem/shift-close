import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/session'
import { canAccessInsightsPages } from '@/lib/roles'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function sanitizeFilename(label: string): string {
  const base = label.replace(/[^\w.\-() ]+/g, '_').trim() || 'scan'
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`
}

async function collectKnownScanUrls(dates: string[]): Promise<Set<string>> {
  const shiftRows = await prisma.shiftClose.findMany({
    where: { date: { in: dates } },
    select: { depositScanUrls: true, debitScanUrls: true, securityScanUrls: true }
  })

  const knownUrls = new Set<string>()
  for (const row of shiftRows) {
    for (const raw of [row.depositScanUrls, row.debitScanUrls, row.securityScanUrls]) {
      try {
        const urls = JSON.parse(raw || '[]')
        if (!Array.isArray(urls)) continue
        for (const u of urls) {
          if (typeof u === 'string' && u.trim()) knownUrls.add(u.trim())
        }
      } catch {
        // Ignore malformed JSON
      }
    }
  }
  return knownUrls
}

async function loadScanBytes(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  if (/^https?:\/\//i.test(url)) {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      throw new Error(`Upstream fetch failed (${res.status})`)
    }
    const contentType = res.headers.get('content-type') || 'application/pdf'
    const buffer = Buffer.from(await res.arrayBuffer())
    return { buffer, contentType }
  }

  const normalized = url.replace(/^\/+/, '')
  if (normalized.includes('..')) {
    throw new Error('Invalid scan path')
  }
  const filepath = join(process.cwd(), 'public', normalized)
  if (!existsSync(filepath)) {
    throw new Error('Scan file not found')
  }
  const buffer = await readFile(filepath)
  const lower = filepath.toLowerCase()
  const contentType = lower.endsWith('.pdf')
    ? 'application/pdf'
    : lower.endsWith('.png')
      ? 'image/png'
      : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
        ? 'image/jpeg'
        : 'application/octet-stream'
  return { buffer, contentType }
}

/** POST { url, date, label? } — returns the scan bytes for native share (avoids CORS). */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canAccessInsightsPages(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { url?: string; date?: string; label?: string }
  try {
    body = (await request.json()) as { url?: string; date?: string; label?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  const url = safeString(body.url)
  const date = safeString(body.date)
  const label = safeString(body.label) || 'scan.pdf'
  if (!url || !date) {
    return NextResponse.json({ error: 'url and date are required' }, { status: 400 })
  }

  const knownUrls = await collectKnownScanUrls([date])
  if (!knownUrls.has(url)) {
    return NextResponse.json({ error: 'Scan is no longer available' }, { status: 400 })
  }

  try {
    const { buffer, contentType } = await loadScanBytes(url)
    const filename = sanitizeFilename(label)
    const type = contentType.startsWith('image/') ? contentType : 'application/pdf'
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': type,
        'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store'
      }
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load scan'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
