import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { del, put } from '@vercel/blob'

const RAFF_ENDPOINT = process.env.RAFF_S3_ENDPOINT || 'https://s3.raffusercloud.com'
const RAFF_REGION = process.env.RAFF_S3_REGION || 'us-east'

let client: S3Client | null = null

export function raffBucket() {
  return process.env.RAFF_S3_BUCKET?.trim() || ''
}

export function hasRaffStorage() {
  return Boolean(
    raffBucket() &&
      process.env.RAFF_S3_ACCESS_KEY_ID?.trim() &&
      process.env.RAFF_S3_SECRET_ACCESS_KEY?.trim()
  )
}

/** Raff when configured, otherwise Vercel Blob. */
export function hasRemoteObjectStorage() {
  return hasRaffStorage() || Boolean(process.env.BLOB_READ_WRITE_TOKEN)
}

function raffClient() {
  if (!hasRaffStorage()) {
    throw new Error('Raff object storage is not configured')
  }
  if (!client) {
    client = new S3Client({
      endpoint: RAFF_ENDPOINT,
      region: RAFF_REGION,
      credentials: {
        accessKeyId: process.env.RAFF_S3_ACCESS_KEY_ID!.trim(),
        secretAccessKey: process.env.RAFF_S3_SECRET_ACCESS_KEY!.trim()
      },
      forcePathStyle: false,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED'
    })
  }
  return client
}

export function raffPublicUrl(key: string) {
  const encoded = key
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `https://${raffBucket()}.s3.raffusercloud.com/${encoded}`
}

export function isRaffObjectUrl(url: string) {
  try {
    const host = new URL(url).hostname
    const bucket = raffBucket()
    return host === `${bucket}.s3.raffusercloud.com` || host.endsWith('.s3.raffusercloud.com')
  } catch {
    return false
  }
}

function keyFromRaffUrl(url: string) {
  const parsed = new URL(url)
  return decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
}

export async function putPublicObject(key: string, body: Buffer, contentType?: string) {
  const type = contentType || 'application/octet-stream'
  if (hasRaffStorage()) {
    await raffClient().send(
      new PutObjectCommand({
        Bucket: raffBucket(),
        Key: key,
        Body: body,
        ContentType: type,
        ACL: 'public-read'
      })
    )
    return raffPublicUrl(key)
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(key, body, {
      access: 'public',
      contentType: type,
      addRandomSuffix: false
    })
    return blob.url
  }
  throw new Error('Object storage is not configured')
}

export async function deleteStoredObject(url: string) {
  if (!url || !/^https?:\/\//i.test(url)) return
  if (isRaffObjectUrl(url) && hasRaffStorage()) {
    await raffClient().send(
      new DeleteObjectCommand({
        Bucket: raffBucket(),
        Key: keyFromRaffUrl(url)
      })
    )
    return
  }
  if (/blob\.vercel-storage\.com/i.test(url) && process.env.BLOB_READ_WRITE_TOKEN) {
    await del(url)
  }
}
