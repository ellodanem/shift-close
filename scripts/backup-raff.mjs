/**
 * Backup Raff Postgres (direct URL) to a dated dump file.
 * Default destination: Google Drive\ShiftClose-DB-Backups when available
 * (G:\My Drive\…), else OneDrive, else home folder. Not Vercel Blob.
 * Never logs connection strings.
 *
 * Usage:
 *   node scripts/backup-raff.mjs
 *   node scripts/backup-raff.mjs --keep 12
 *
 * Config (optional) in .env.backup.local or app/.env.raff.local:
 *   RAFF_DIRECT_URL   (required; usually in app/.env.raff.local)
 *   BACKUP_DIR        absolute path to backup folder
 *   BACKUP_KEEP       number of dated dumps to keep (default 12)
 */
import { spawn } from 'node:child_process'
import {
  readFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  unlinkSync,
  statSync,
  copyFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pgDump = join(root, 'tools', 'pgsql', 'bin', 'pg_dump.exe')

function loadEnvFile(path) {
  if (!existsSync(path)) return {}
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
    child.stdout.on('data', (d) => process.stdout.write(d))
    child.stderr.on('data', (d) => {
      process.stderr.write(d.toString().replace(/postgres(ql)?:\/\/[^\s]+/gi, '[redacted]'))
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${bin} exited ${code}`))
    })
  })
}

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag)
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]
  return fallback
}

function defaultBackupDir() {
  // Prefer Google Drive (Drive for desktop often mounts as G:\My Drive on Windows).
  const googleCandidates = [
    process.env.GOOGLE_DRIVE,
    'G:\\My Drive',
    join(homedir(), 'Google Drive'),
    join(homedir(), 'My Drive')
  ].filter(Boolean)
  for (const base of googleCandidates) {
    if (existsSync(base)) return join(base, 'ShiftClose-DB-Backups')
  }
  const oneDrive = process.env.OneDrive || process.env.ONEDrive
  if (oneDrive) return join(oneDrive, 'ShiftClose-DB-Backups')
  return join(homedir(), 'ShiftClose-DB-Backups')
}

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}

function prune(dir, keep) {
  const files = readdirSync(dir)
    .filter((f) => /^shiftclose-\d{4}-\d{2}-\d{2}.*\.dump$/i.test(f))
    .map((f) => {
      const full = join(dir, f)
      return { full, name: f, mtime: statSync(full).mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)

  const removed = []
  for (const f of files.slice(keep)) {
    unlinkSync(f.full)
    removed.push(f.name)
  }
  return { kept: files.length - removed.length, removed }
}

if (!existsSync(pgDump)) {
  throw new Error(`Missing pg_dump at ${pgDump}. Restore tools/pgsql first.`)
}

const raff = {
  ...loadEnvFile(join(root, 'app', '.env.raff.local')),
  ...loadEnvFile(join(root, '.env.backup.local'))
}
if (!raff.RAFF_DIRECT_URL) {
  throw new Error('RAFF_DIRECT_URL missing (app/.env.raff.local)')
}

const backupDir = raff.BACKUP_DIR || defaultBackupDir()
const keep = Number(argValue('--keep', raff.BACKUP_KEEP || '12'))
if (!Number.isFinite(keep) || keep < 1) throw new Error('BACKUP_KEEP must be >= 1')

mkdirSync(backupDir, { recursive: true })
mkdirSync(join(root, 'dumps'), { recursive: true })

const fileName = `shiftclose-${stamp()}.dump`
const destFile = join(backupDir, fileName)
const localLatest = join(root, 'dumps', 'raff-latest.dump')
const parsed = parsePgUrl(raff.RAFF_DIRECT_URL)

console.log(`Backing up Raff → ${destFile}`)
console.log(`Host ${parsed.host}:${parsed.port} db=${parsed.database}`)

await run(
  pgDump,
  ['-Fc', '--no-owner', '--no-acl', '--file', destFile],
  {
    PGHOST: parsed.host,
    PGPORT: parsed.port,
    PGUSER: parsed.user,
    PGPASSWORD: parsed.password,
    PGDATABASE: parsed.database,
    PGSSLMODE: parsed.sslmode
  }
)

copyFileSync(destFile, localLatest)
const sizeMb = (statSync(destFile).size / (1024 * 1024)).toFixed(2)
const { kept, removed } = prune(backupDir, keep)

console.log(`Dump OK (${sizeMb} MB)`)
console.log(`Local latest → dumps/raff-latest.dump`)
console.log(`Retention keep=${keep}; files kept=${kept}; pruned=${removed.length}`)
if (removed.length) console.log(`Pruned: ${removed.join(', ')}`)
console.log('Done.')
