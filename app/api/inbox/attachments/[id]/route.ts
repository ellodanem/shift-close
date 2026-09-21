import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { fetchAttachmentFromImap } from '@/lib/inbox-sync'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const att = await prisma.inboxAttachment.findUnique({ where: { id } })
  if (!att) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
  }

  if (att.blobUrl) {
    return NextResponse.redirect(att.blobUrl)
  }

  const downloaded = await fetchAttachmentFromImap(id)
  if (!downloaded) {
    return NextResponse.json(
      { error: 'Could not load attachment. Re-sync the mailbox and try again.' },
      { status: 404 }
    )
  }

  const disposition = request.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline'

  return new NextResponse(new Uint8Array(downloaded.content), {
    headers: {
      'Content-Type': downloaded.contentType,
      'Content-Disposition': `${disposition}; filename="${downloaded.filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=3600'
    }
  })
}
