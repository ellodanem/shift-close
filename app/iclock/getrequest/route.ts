import { NextRequest } from 'next/server'
import { zkPushGET } from '@/lib/zk-iclock-getrequest'

/** ZKTeco standard: device polls for remote commands. Response is always OK. */
export async function GET(request: NextRequest) {
  return zkPushGET(request)
}
