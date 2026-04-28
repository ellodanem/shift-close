import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  isPublicPath,
  pathnameAllowedForRole,
  apiWriteAllowedForRole
} from '@/lib/access-control'
import { verifySessionToken, SESSION_COOKIE } from '@/lib/session'

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // Allow static assets in /public (e.g. logos, images, fonts).
  if (/\.[^/]+$/.test(pathname)) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/iclock') || pathname.startsWith('/api/attendance/adms')) {
    console.log(`[ADMS] edge ${request.method} ${pathname}${search}`)
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const login = new URL('/login', request.url)
    login.searchParams.set('next', pathname + search)
    return NextResponse.redirect(login)
  }

  const session = await verifySessionToken(token)
  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const login = new URL('/login', request.url)
    return NextResponse.redirect(login)
  }

  const { role } = session
  if (!pathnameAllowedForRole(pathname, role)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (!apiWriteAllowedForRole(request, pathname, role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}
