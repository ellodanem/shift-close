/**
 * Windows electron-builder entry: avoids winCodeSign.7z extraction failures when 7-Zip
 * cannot create symlinks (common without Developer Mode / elevation).
 * If Windows SDK signtool exists, SIGNTOOL_PATH is set so signing uses it instead of
 * downloading the bundled winCodeSign archive.
 */
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const agentRoot = path.join(__dirname, '..')

const icons = spawnSync(process.execPath, [path.join(agentRoot, 'scripts', 'build-icons.mjs')], {
  cwd: agentRoot,
  stdio: 'inherit',
})
if (icons.status !== 0) {
  process.exit(typeof icons.status === 'number' ? icons.status : 1)
}

function findSigntool() {
  if (process.platform !== 'win32') return null
  const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles]
    .filter(Boolean)
    .map((p) => path.join(p, 'Windows Kits', '10', 'bin'))
  const candidates = []
  for (const binRoot of roots) {
    if (!fs.existsSync(binRoot)) continue
    let versions
    try {
      versions = fs.readdirSync(binRoot)
    } catch {
      continue
    }
    for (const v of versions) {
      const candidate = path.join(binRoot, v, 'x64', 'signtool.exe')
      if (fs.existsSync(candidate)) candidates.push({ v, p: candidate })
    }
  }
  candidates.sort((a, b) => b.v.localeCompare(a.v, undefined, { numeric: true }))
  return candidates[0] ? candidates[0].p : null
}

const env = { ...process.env }
delete env.CSC_LINK
delete env.WIN_CSC_LINK
env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'

const signtool = findSigntool()
if (signtool) {
  env.SIGNTOOL_PATH = signtool
}

const r = spawnSync('npx', ['electron-builder', '--win', '--x64'], {
  cwd: agentRoot,
  env,
  stdio: 'inherit',
  shell: true,
})

if (r.error) {
  console.error(r.error)
  process.exit(1)
}
process.exit(typeof r.status === 'number' ? r.status : 1)
