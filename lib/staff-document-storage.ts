import { del, put } from '@vercel/blob'
import { mkdir, unlink, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-')
}

function hasBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN)
}

export async function saveStaffDocumentFile(args: {
  staffId: string
  file: File
  type: string
  sickLeaveId?: string
}) {
  const { staffId, file, type, sickLeaveId } = args
  const timestamp = Date.now()
  const extension = sanitizeSegment(file.name.split('.').pop() || 'bin')

  if (hasBlobToken()) {
    const prefix = sickLeaveId ? `staff/${staffId}/sick-leave` : `staff/${staffId}`
    const filename = sickLeaveId
      ? `sick-leave-${sickLeaveId}-${timestamp}.${extension}`
      : `${sanitizeSegment(type)}-${timestamp}.${extension}`
    const pathname = `${prefix}/${filename}`
    const blob = await put(pathname, file, {
      access: 'public',
      addRandomSuffix: false,
      contentType: file.type || undefined
    })
    return blob.url
  }

  const localPrefix = sickLeaveId
    ? join('uploads', 'staff', staffId, 'sick-leave')
    : join('uploads', 'staff', staffId)
  const filename = sickLeaveId
    ? `sick-leave-${sickLeaveId}-${timestamp}.${extension}`
    : `${sanitizeSegment(type)}-${timestamp}.${extension}`
  const uploadsDir = join(process.cwd(), 'public', localPrefix)
  if (!existsSync(uploadsDir)) {
    await mkdir(uploadsDir, { recursive: true })
  }
  const filepath = join(uploadsDir, filename)
  const bytes = await file.arrayBuffer()
  await writeFile(filepath, Buffer.from(bytes))
  return `/${localPrefix.replace(/\\/g, '/')}/${filename}`
}

export async function deleteStaffDocumentFile(fileUrl: string) {
  if (!fileUrl) return

  if (/^https?:\/\//i.test(fileUrl)) {
    if (hasBlobToken()) {
      await del(fileUrl)
    }
    return
  }

  const normalized = fileUrl.replace(/^\/+/, '')
  const filepath = join(process.cwd(), 'public', normalized)
  if (existsSync(filepath)) {
    await unlink(filepath)
  }
}
