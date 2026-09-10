/**
 * Copy Neon → Raff using pg_dump/pg_restore. Never logs connection strings.
 * Reads .env.production.local and app/.env.raff.local
 */
import { spawn } from 'node:child_process'
import { readFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pgDump = join(root, 'tools', 'pgsql', 'bin', 'pg_dump.exe')
const pgRestore = join(root, 'tools', 'pgsql', 'bin', 'pg_restore.exe')
const dumpFile = join(root, 'dumps', 'neon.dump')

function loadEnvFile(path) {
  if (!existsSync(path)) throw new Error(`Missing ${path}`)
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

function parsePgUrl(raw) {
  const u = new URL(raw.replace(/^postgres(ql)?:/i, 'http:'))
  const db = decodeURIComponent(u.pathname.replace(/^\//, '').split('?')[0] || '')
  return {
    host: u.hostname,
    port: u.port || '5432',
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: db || 'postgres',
    sslmode: u.searchParams.get('sslmode') || 'require'
  }
}

function run(bin, args, extraEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      env: { ...process.env, ...extraEnv, PGSSLMODE: extraEnv.PGSSLMODE || 'require' },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stderr = ''
    child.stdout.on('data', (d) => process.stdout.write(d))
    child.stderr.on('data', (d) => {
      const s = d.toString()
      stderr += s
      process.stderr.write(s.replace(/postgres(ql)?:\/\/[^\s]+/gi, '[redacted]'))
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${bin} exited ${code}`))
    })
  })
}

function pgEnv(parsed) {
  return {
    PGHOST: parsed.host,
    PGPORT: parsed.port,
    PGUSER: parsed.user,
    PGPASSWORD: parsed.password,
    PGDATABASE: parsed.database,
    PGSSLMODE: parsed.sslmode
  }
}

const step = process.argv[2] || 'dump'
const neon = loadEnvFile(join(root, '.env.production.local'))
const raff = loadEnvFile(join(root, 'app', '.env.raff.local'))
const neonUrl = neon.DATABASE_URL_UNPOOLED || neon.POSTGRES_URL_NON_POOLING || neon.DATABASE_URL
if (!neonUrl || !neonUrl.includes('postgresql') && !neonUrl.includes('postgres')) {
  throw new Error('Neon URL missing from .env.production.local')
}
if (!raff.RAFF_DIRECT_URL) throw new Error('RAFF_DIRECT_URL missing')

mkdirSync(join(root, 'dumps'), { recursive: true })

if (step === 'dump') {
  console.log('Dumping Neon (unpooled) to dumps/neon.dump …')
  await run(
    pgDump,
    ['-Fc', '--no-owner', '--no-acl', '--file', dumpFile],
    pgEnv(parsePgUrl(neonUrl))
  )
  console.log('Dump finished.')
} else if (step === 'restore' || step === 'restore-clean') {
  if (!existsSync(dumpFile)) throw new Error('Run dump first')
  console.log(
    step === 'restore-clean'
      ? 'Restoring onto Raff (direct, replace existing objects) …'
      : 'Restoring onto Raff (direct) …'
  )
  const raffParsed = parsePgUrl(raff.RAFF_DIRECT_URL)
  const args = [
    '--no-owner',
    '--no-acl',
    '--verbose',
    '--dbname',
    raffParsed.database
  ]
  if (step === 'restore-clean') {
    args.push('--clean', '--if-exists')
  }
  args.push(dumpFile)
  await run(pgRestore, args, pgEnv(raffParsed))
  console.log('Restore finished.')
} else {
  throw new Error('Usage: dump | restore | restore-clean')
}
