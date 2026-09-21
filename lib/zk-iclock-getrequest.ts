import { NextRequest, NextResponse } from 'next/server'
import { buildGetrequestBody } from '@/lib/zk-iclock-delay'

/**
 * GET /iclock/getrequest — device command poll.
 * Prisma-free. Always `OK` (no pending command). Poll cadence comes from the
 * cdata handshake `Delay` (default 300s). Do not emit a new command on every
 * poll — that makes the clock request again immediately.
 */
export async function zkPushGET(request: NextRequest) {
  const info = request.nextUrl.searchParams.get('INFO')
  const sn = request.nextUrl.searchParams.get('SN') || 'unknown'
  const { body, delay } = buildGetrequestBody()
  if (info) {
    console.log(`[ADMS] GET ${request.nextUrl.pathname} SN=${sn} INFO=${info.slice(0, 80)}`)
  }
  if (delay != null) {
    console.log(`[ADMS] GET ${request.nextUrl.pathname} SN=${sn} quietHours delay=${delay}`)
  }
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'private, no-store'
    }
  })
}
