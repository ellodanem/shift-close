import { NextRequest, NextResponse } from 'next/server'
import { buildGetrequestBody } from '@/lib/zk-iclock-delay'

/**
 * GET /iclock/getrequest — device command poll.
 * Prisma-free. By day the body is OK. From 11:00pm–5:30am the body tells the
 * clock to Delay until 5:30am so it stops heartbeating; punch upload is unchanged.
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
