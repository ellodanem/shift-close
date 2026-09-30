/**
 * Push Raff object-storage credentials from .env.local to Vercel.
 * Never prints secret values.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[t.slice(0, eq)] = v
  }
  return out
}

function run(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['vercel', ...args], {
      cwd: root,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe']
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
      if (code === 0) resolve()
      else reject(new Error(`vercel ${args[0]} ${args[1] || ''} ${args[2] || ''} exited ${code}`))
    })
    child.stdin.write(input)
    child.stdin.end()
  })
}

const env = loadEnvFile(join(root, '.env.local'))
const names = ['RAFF_S3_BUCKET', 'RAFF_S3_ACCESS_KEY_ID', 'RAFF_S3_SECRET_ACCESS_KEY']
for (const name of names) {
  if (!env[name]) throw new Error(`${name} missing from .env.local`)
}

for (const name of names) {
  await run(
    ['env', 'add', name, 'production,preview,development', '--sensitive', '--force', '--yes'],
    env[name]
  )
  console.log(`Set ${name} on production, preview, and development`)
}
