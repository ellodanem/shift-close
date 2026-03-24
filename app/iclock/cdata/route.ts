import { NextRequest } from 'next/server'
import { zkPushGET, zkPushPOST } from '@/lib/zk-iclock-push'

export const dynamic = 'force-dynamic'

/** ZKTeco standard: POST attendance and other tables (table=ATTLOG for punches). */
export async function GET(request: NextRequest) {
  return zkPushGET(request)
}

export async function POST(request: NextRequest) {
  return zkPushPOST(request)
}
