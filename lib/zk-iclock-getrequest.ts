import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /iclock/getrequest — device command poll.
 * Always returns OK (this app does not queue remote device commands).
 * Kept in a Prisma-free module so the 30–120s heartbeat does not boot the query engine.
 */
export async function zkPushGET(request: NextRequest) {
  const info = request.nextUrl.searchParams.get('INFO')
  if (info) {
    const sn = request.nextUrl.searchParams.get('SN') || 'unknown'
    console.log(`[ADMS] GET ${request.nextUrl.pathname} SN=${sn} INFO=${info.slice(0, 80)}`)
  }
  return new NextResponse('OK', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      // Harmless if the device bypasses caches; helps when Vercel can serve a HIT.
      'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=40'
    }
  })
}
