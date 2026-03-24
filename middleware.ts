import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Log ZKTeco / ADMS traffic at the edge so Vercel Logs show something even when
 * the path is wrong (helps debug device URL vs 404 with no route logs).
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  console.log(`[ADMS] edge ${request.method} ${pathname}${search}`)
  return NextResponse.next()
}

export const config = {
  matcher: ['/iclock/:path*', '/api/attendance/adms']
}
