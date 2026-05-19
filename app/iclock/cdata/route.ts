import { NextRequest } from 'next/server'
import { zkPushCDATAGET, zkPushPOST } from '@/lib/zk-iclock-push'

export const dynamic = 'force-dynamic'

/** ZKTeco standard: GET options handshake; POST attendance and other tables (table=ATTLOG for punches). */
export async function GET(request: NextRequest) {
  return zkPushCDATAGET(request)
}

export async function POST(request: NextRequest) {
  return zkPushPOST(request)
}
