/**
 * Copy Vercel Blob objects into the Raff bucket and rewrite stored URLs.
 * Reads secrets from .env.local. Prints counts and hosts only.
 *
 *   node scripts/copy-vercel-blob-to-raff.mjs --probe
 *   node scripts/copy-vercel-blob-to-raff.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const probeOnly = process.argv.includes('--probe')
const rewriteOnly = process.argv.includes('--rewrite-only')

function loadEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 1) continue
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[t.slice(0, eq)] = v
  }
  return out
}

function hostOf(url) {
  const u = new URL(String(url).replace(/^postgres(ql)?:/i, 'http:'))
  return `${u.hostname}:${u.port || '5432'}`
}

function dollar(value) {
  return `$raff$${value}$raff$`
}

const localEnv = loadEnvFile(join(root, '.env.local'))
for (const [key, value] of Object.entries(localEnv)) {
  if (!process.env[key]) process.env[key] = value
}

const bucket = process.env.RAFF_S3_BUCKET
const accessKeyId = process.env.RAFF_S3_ACCESS_KEY_ID
const secretAccessKey = process.env.RAFF_S3_SECRET_ACCESS_KEY
if (!bucket || !accessKeyId || !secretAccessKey) {
  throw new Error('RAFF_S3_BUCKET, RAFF_S3_ACCESS_KEY_ID, and RAFF_S3_SECRET_ACCESS_KEY are required in .env.local')
}
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error('BLOB_READ_WRITE_TOKEN is required in .env.local to read existing Vercel Blob files')
}

const s3 = new S3Client({
  endpoint: process.env.RAFF_S3_ENDPOINT || 'https://s3.raffusercloud.com',
  region: process.env.RAFF_S3_REGION || 'us-east',
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: false,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED'
})

function publicUrl(key) {
  const encoded = key.split('/').map((part) => encodeURIComponent(part)).join('/')
  return `https://${bucket}.s3.raffusercloud.com/${encoded}`
}

function keyFromBlobUrl(url) {
  return decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ''))
}

async function putPublic(key, body, contentType) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
      ACL: 'public-read'
    })
  )
  return publicUrl(key)
}

async function probe() {
  const key = `_healthcheck/${Date.now()}-ping.txt`
  const url = await putPublic(key, Buffer.from('ok'), 'text/plain')
  const res = await fetch(url)
  const text = await res.text()
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  if (!res.ok || text !== 'ok') {
    throw new Error(`Public read of healthcheck failed (${res.status})`)
  }
  console.log(`Probe ok: public upload and read on ${bucket}`)
}

function psql(databaseUrl, query) {
  const u = new URL(String(databaseUrl).replace(/^postgres(ql)?:/i, 'http:'))
  const psqlBin = join(root, 'tools', 'pgsql', 'bin', 'psql.exe')
  return new Promise((resolve, reject) => {
    const child = spawn(
      psqlBin,
      ['-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', query],
      {
        env: {
          ...process.env,
          PGHOST: u.hostname,
          PGPORT: u.port || '5432',
          PGUSER: decodeURIComponent(u.username),
          PGPASSWORD: decodeURIComponent(u.password),
          PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, '').split('?')[0] || 'postgres'),
          PGSSLMODE: 'require'
        },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => {
      out += d.toString()
    })
    child.stderr.on('data', (d) => {
      err += d.toString()
    })
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(err.trim() || out.trim() || `psql exited ${code}`))
      else resolve(out.trim())
    })
  })
}

const URL_COLUMNS = [
  ['staff_document', 'file_url'],
  ['shift_close', 'deposit_scan_urls'],
  ['shift_close', 'debit_scan_urls'],
  ['shift_close', 'security_scan_urls'],
  ['deposit_records', 'security_slip_url'],
  ['payment_simulations', 'pdf_url'],
  ['applicant_applications', 'pdf_url'],
  ['applicant_applications', 'resume_url'],
  ['inbox_attachments', 'blob_url']
]

async function columnsPresent(databaseUrl) {
  const present = []
  for (const pair of URL_COLUMNS) {
    const [table] = pair
    const reg = await psql(
      databaseUrl,
      `SELECT COALESCE(to_regclass(${dollar(`public.${table}`)})::text, '')`
    )
    if (reg) present.push(pair)
    else console.log(`Skipping missing table ${table}`)
  }
  return present
}

async function countBlobRefs(databaseUrl, columns) {
  if (columns.length === 0) return 0
  const parts = columns.map(
    ([table, column]) =>
      `(SELECT count(*) FROM ${table} WHERE ${column} LIKE '%blob.vercel-storage.com%')`
  )
  const row = await psql(databaseUrl, `SELECT ${parts.join(' + ')}`)
  return Number(row)
}

async function rewriteUrls(databaseUrl, columns, fromOrigin, toOrigin) {
  const from = `${fromOrigin}/`
  const to = `${toOrigin}/`
  for (const [table, column] of columns) {
    await psql(
      databaseUrl,
      `UPDATE ${table} SET ${column} = replace(${column}, ${dollar(from)}, ${dollar(to)}) WHERE ${column} LIKE '%blob.vercel-storage.com%'`
    )
  }
}

async function listAllBlobs() {
  const { list } = await import('@vercel/blob')
  const blobs = []
  let cursor
  do {
    const page = await list({ cursor, limit: 1000 })
    blobs.push(...page.blobs)
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  return blobs
}

async function copyOne(blob) {
  const key = keyFromBlobUrl(blob.url)
  if (!key || key.startsWith('_healthcheck/')) return { skipped: true }
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    if (Number(head.ContentLength) === blob.size) return { skipped: true, key }
  } catch {
    // missing object
  }
  const res = await fetch(blob.downloadUrl || blob.url)
  if (!res.ok) throw new Error(`Download failed ${res.status} for ${key}`)
  const body = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') || 'application/octet-stream'
  await putPublic(key, body, contentType.split(';')[0].trim())
  const rebuiltPath = new URL(publicUrl(key)).pathname
  const originalPath = new URL(blob.url).pathname
  return { key, bytes: body.length, pathMismatch: rebuiltPath !== originalPath }
}

const databases = []
if (localEnv.DATABASE_URL) {
  databases.push({ name: 'raff', url: localEnv.DATABASE_URL })
}
const prodEnv = loadEnvFile(join(root, '.env.production.local'))
const neonUrl = prodEnv.DATABASE_URL_UNPOOLED || prodEnv.POSTGRES_URL_NON_POOLING || prodEnv.DATABASE_URL
if (neonUrl && hostOf(neonUrl) !== hostOf(localEnv.DATABASE_URL || 'http://none')) {
  databases.push({ name: 'neon', url: neonUrl })
}

await probe()
if (probeOnly) process.exit(0)

try {
  await s3.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: ['*'],
            AllowedMethods: ['GET', 'HEAD'],
            AllowedHeaders: ['*'],
            MaxAgeSeconds: 3600
          }
        ]
      }
    })
  )
  console.log('CORS allows browser GET/HEAD')
} catch (error) {
  console.warn('CORS update skipped:', error instanceof Error ? error.message : error)
}

const blobs = (await listAllBlobs()).filter((blob) => !keyFromBlobUrl(blob.url).startsWith('_healthcheck/'))
console.log(`Vercel Blob objects: ${blobs.length}`)

let copied = 0
let skipped = 0
let failed = 0
let mismatches = 0
const origins = new Set()
if (rewriteOnly) {
  for (const blob of blobs) {
    const key = keyFromBlobUrl(blob.url)
    origins.add(new URL(blob.url).origin)
    if (new URL(publicUrl(key)).pathname !== new URL(blob.url).pathname) mismatches += 1
  }
  console.log(`Rewrite only. objects=${blobs.length} pathMismatches=${mismatches}`)
} else for (let i = 0; i < blobs.length; i += 1) {
  const blob = blobs[i]
  origins.add(new URL(blob.url).origin)
  try {
    const result = await copyOne(blob)
    if (result.skipped) skipped += 1
    else copied += 1
    if (result.pathMismatch) mismatches += 1
  } catch (error) {
    failed += 1
    console.error(`Copy failed: ${error instanceof Error ? error.message : error}`)
  }
  if ((i + 1) % 25 === 0 || i + 1 === blobs.length) {
    console.log(`Progress ${i + 1}/${blobs.length} copied=${copied} skipped=${skipped} failed=${failed}`)
  }
}

if (failed > 0 || mismatches > 0) {
  console.error(`Stopped before URL rewrite. failed=${failed} pathMismatches=${mismatches}`)
  process.exit(1)
}
if (origins.size !== 1) {
  console.error(`Expected one Vercel Blob origin, found ${origins.size}. URL rewrite skipped.`)
  process.exit(1)
}

const fromOrigin = [...origins][0]
const toOrigin = `https://${bucket}.s3.raffusercloud.com`
const sample = blobs[0]
if (sample) {
  const sampleUrl = publicUrl(keyFromBlobUrl(sample.url))
  const sampleRes = await fetch(sampleUrl, { method: 'GET' })
  await sampleRes.arrayBuffer()
  console.log(`Sample copied object public read: ${sampleRes.status}`)
  if (!sampleRes.ok) process.exit(1)
}
for (const db of databases) {
  const columns = await columnsPresent(db.url)
  const before = await countBlobRefs(db.url, columns)
  console.log(`${db.name} (${hostOf(db.url)}) blob refs before: ${before}`)
  if (before === 0) continue
  await rewriteUrls(db.url, columns, fromOrigin, toOrigin)
  const after = await countBlobRefs(db.url, columns)
  console.log(`${db.name} blob refs after: ${after}`)
}

console.log(`Done. copied=${copied} already_present=${skipped} origin=${fromOrigin}`)
