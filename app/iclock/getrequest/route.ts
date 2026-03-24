import { NextRequest } from 'next/server'
import { zkPushGET } from '@/lib/zk-iclock-push'

export const dynamic = 'force-dynamic'

/** ZKTeco standard: device polls for remote commands. */
export async function GET(request: NextRequest) {
  return zkPushGET(request)
}
