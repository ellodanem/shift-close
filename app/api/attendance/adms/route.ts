import { NextRequest } from 'next/server'
import { zkPushCDATAGET, zkPushPOST } from '@/lib/zk-iclock-push'

export const dynamic = 'force-dynamic'

/**
 * Legacy alias for ZKTeco push — prefer /iclock/cdata and /iclock/getrequest (standard paths).
 */

export async function GET(request: NextRequest) {
  return zkPushCDATAGET(request)
}

export async function POST(request: NextRequest) {
  return zkPushPOST(request)
}
