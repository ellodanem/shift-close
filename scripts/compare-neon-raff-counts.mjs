import { spawn } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvFile(path) {
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
    database: db || 'postgres'
  }
}

function sql(url, query) {
  const p = parsePgUrl(url)
  const psql = join(root, 'tools', 'pgsql', 'bin', 'psql.exe')
  return new Promise((resolve, reject) => {
    const child = spawn(
      psql,
      ['-t', '-A', '-c', query],
      {
        env: {
          ...process.env,
          PGHOST: p.host,
          PGPORT: p.port,
          PGUSER: p.user,
          PGPASSWORD: p.password,
          PGDATABASE: p.database,
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
      if (code !== 0) reject(new Error(err || `psql ${code}`))
      else resolve(out.trim())
    })
  })
}

const neon = loadEnvFile(join(root, '.env.production.local'))
const raff = loadEnvFile(join(root, 'app', '.env.raff.local'))
const neonUrl = neon.DATABASE_URL_UNPOOLED || neon.POSTGRES_URL_NON_POOLING
const tables = ['staff', 'shift_close', 'attendance_logs', 'app_users', 'deposit_records']

for (const t of tables) {
  const q = `SELECT count(*) FROM ${t}`
  const n = await sql(neonUrl, q)
  const r = await sql(raff.RAFF_DIRECT_URL, q)
  console.log(`${t}\tneon=${n}\traff=${r}\t${n === r ? 'ok' : 'MISMATCH'}`)
}
