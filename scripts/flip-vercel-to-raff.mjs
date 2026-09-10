/**
 * Phase 3: backup Neon URLs, push Raff pooled/direct to Vercel production.
 * Never prints connection strings.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvFile(path) {
  if (!existsSync(path)) throw new Error(`Missing ${path}`)
  const out = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 1) continue
    let v = t.slice(eq + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    out[t.slice(0, eq)] = v
  }
  return out
}

function withPgbouncer(url) {
  const qAt = url.indexOf('?')
  const base = qAt >= 0 ? url.slice(0, qAt) : url
  const params = new URLSearchParams(qAt >= 0 ? url.slice(qAt + 1) : '')
  if (!params.has('sslmode')) params.set('sslmode', 'require')
  params.set('pgbouncer', 'true')
  return `${base}?${params.toString()}`
}

function hostPort(url) {
  const u = new URL(url.replace(/^postgres(ql)?:/i, 'http:'))
  return `${u.hostname}:${u.port || '5432'}`
}

function run(bin, args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => {
      out += d.toString()
    })
    child.stderr.on('data', (d) => {
      err += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve({ out, err })
      else reject(new Error(`${bin} ${args.join(' ')} exited ${code}: ${err || out}`))
    })
    if (input != null) {
      child.stdin.write(input)
      child.stdin.end()
    } else {
      child.stdin.end()
    }
  })
}

async function setProdEnv(name, value) {
  // Remove existing (ignore failure), then add.
  try {
    await run('npx', ['vercel', 'env', 'rm', name, 'production', '--yes'])
  } catch {
    // may not exist
  }
  await run('npx', ['vercel', 'env', 'add', name, 'production'], { input: value })
  console.log(`Set production ${name} -> ${hostPort(value)}`)
}

const prod = loadEnvFile(join(root, '.env.production.local'))
const raff = loadEnvFile(join(root, 'app', '.env.raff.local'))
if (!raff.RAFF_POOLED_URL || !raff.RAFF_DIRECT_URL) {
  throw new Error('Raff URLs missing')
}
if (!prod.DATABASE_URL) throw new Error('Neon DATABASE_URL missing from production pull')

const neonPooled = prod.DATABASE_URL
const neonUnpooled =
  prod.DATABASE_URL_UNPOOLED || prod.POSTGRES_URL_NON_POOLING || prod.DATABASE_URL

const backupPath = join(root, '.env.neon-backup.local')
writeFileSync(
  backupPath,
  [
    '# Neon URLs before Phase 3 cutover. Gitignored. Rollback: put these back on Vercel production.',
    `DATABASE_URL=${JSON.stringify(neonPooled)}`,
    `DATABASE_URL_UNPOOLED=${JSON.stringify(neonUnpooled)}`,
    `BACKUP_AT=${new Date().toISOString()}`
  ].join('\n') + '\n',
  'utf8'
)
console.log(`Wrote Neon backup -> ${hostPort(neonPooled)} (file .env.neon-backup.local)`)

const raffPooled = withPgbouncer(raff.RAFF_POOLED_URL)
const raffDirect = raff.RAFF_DIRECT_URL.includes('sslmode=')
  ? raff.RAFF_DIRECT_URL
  : `${raff.RAFF_DIRECT_URL}${raff.RAFF_DIRECT_URL.includes('?') ? '&' : '?'}sslmode=require`

await setProdEnv('DATABASE_URL', raffPooled)
await setProdEnv('DATABASE_URL_UNPOOLED', raffDirect)
console.log('Vercel production DATABASE_URL flipped to Raff.')
