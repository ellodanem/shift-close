import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const SMTP_KEYS = ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from'] as const

export async function GET() {
  try {
    const rows = await prisma.appSettings.findMany({
      where: { key: { in: [...SMTP_KEYS] } }
    })
    const map = new Map(rows.map((r) => [r.key, r.value]))

    const result: Record<string, string> = {
      smtp_host: map.get('smtp_host') || process.env.SMTP_HOST || 'smtp.gmail.com',
      smtp_port: map.get('smtp_port') || process.env.SMTP_PORT || '587',
      smtp_secure: map.get('smtp_secure') || process.env.SMTP_SECURE || 'false',
      smtp_user: map.get('smtp_user') || process.env.SMTP_USER || '',
      smtp_pass: map.get('smtp_pass') || process.env.SMTP_PASS ? '********' : '',
      smtp_from: map.get('smtp_from') || process.env.EMAIL_FROM || map.get('smtp_user') || process.env.SMTP_USER || ''
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('SMTP settings GET error:', error)
    return NextResponse.json({ error: 'Failed to load SMTP settings' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from } = body

    const toSave: Array<{ key: string; value: string }> = []

    if (smtp_host !== undefined) toSave.push({ key: 'smtp_host', value: String(smtp_host).trim() })
    if (smtp_port !== undefined) toSave.push({ key: 'smtp_port', value: String(smtp_port).trim() })
    if (smtp_secure !== undefined) toSave.push({ key: 'smtp_secure', value: smtp_secure === true || smtp_secure === 'true' ? 'true' : 'false' })
    if (smtp_user !== undefined) toSave.push({ key: 'smtp_user', value: String(smtp_user).trim() })
    if (smtp_from !== undefined) toSave.push({ key: 'smtp_from', value: String(smtp_from).trim() })
    if (smtp_pass !== undefined && smtp_pass !== '' && smtp_pass !== '********') {
      toSave.push({ key: 'smtp_pass', value: String(smtp_pass) })
    }

    if (toSave.length === 0) {
      return NextResponse.json({ error: 'No valid settings provided' }, { status: 400 })
    }

    for (const { key, value } of toSave) {
      await prisma.appSettings.upsert({
        where: { key },
        update: { value },
        create: { key, value }
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('SMTP settings POST error:', error)
    return NextResponse.json({ error: 'Failed to save SMTP settings' }, { status: 500 })
  }
}
