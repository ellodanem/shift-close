/**
 * Windows electron-builder entry for Shift Close Harvest Agent.
 * Builds icons, bundles portable Node 20, then creates the NSIS installer.
 */
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const agentRoot = path.join(__dirname, '..')

function run(label, command, args, useShell = false) {
  console.log(`[build-win] ${label}`)
  const r = spawnSync(command, args, {
    cwd: agentRoot,
    env: process.env,
    stdio: 'inherit',
    shell: useShell
  })
  if (r.error) {
    console.error(r.error)
    process.exit(1)
  }
  if (r.status !== 0) {
    process.exit(typeof r.status === 'number' ? r.status : 1)
  }
}

run('Generating icons', process.execPath, [path.join(agentRoot, 'scripts', 'build-icons.mjs')])
run('Bundling portable Node', process.execPath, [path.join(agentRoot, 'scripts', 'bundle-node.js')])

const nodeExe = path.join(agentRoot, 'vendor', 'node', 'node.exe')
if (!fs.existsSync(nodeExe)) {
  console.error('[build-win] Portable Node missing at', nodeExe)
  process.exit(1)
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

console.log('[build-win] Running electron-builder…')
const r = spawnSync('npx.cmd', ['electron-builder', '--win', '--x64', '--publish', 'never'], {
  cwd: agentRoot,
  env,
  stdio: 'inherit',
  shell: true
})

if (r.error) {
  console.error(r.error)
  process.exit(1)
}
if (r.status !== 0) {
  process.exit(typeof r.status === 'number' ? r.status : 1)
}

// gh release upload replaces spaces in asset names with dots. latest.yml must
// use those names or the installed app requests a file that is not on the release.
const outDir = path.join(agentRoot, 'installer-release')
const latestPath = path.join(outDir, 'latest.yml')
if (fs.existsSync(latestPath)) {
  let yml = fs.readFileSync(latestPath, 'utf8')
  const fileNames = [...yml.matchAll(/^(?:path| {4}- url): (.+\.exe)\s*$/gm)].map((m) => m[1])
  for (const name of [...new Set(fileNames)]) {
    if (!name.includes(' ')) continue
    const dotted = name.replace(/ /g, '.')
    for (const suffix of ['', '.blockmap']) {
      const from = path.join(outDir, name + suffix)
      const to = path.join(outDir, dotted + suffix)
      if (!fs.existsSync(from)) continue
      if (fs.existsSync(to)) fs.unlinkSync(to)
      fs.renameSync(from, to)
      console.log('[build-win] Renamed', path.basename(from), '->', path.basename(to))
    }
    yml = yml.split(name).join(dotted)
  }
  fs.writeFileSync(latestPath, yml)
}

console.log('[build-win] Installer ready in installer-release')
