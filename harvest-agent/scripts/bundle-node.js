/**
 * Downloads a portable Node.js win-x64 build into vendor/node for the installer.
 * Playwright needs a real Node 20+ runtime; Electron's embedded Node is too old.
 */
const fs = require('fs')
const path = require('path')
const https = require('https')
const { execFileSync } = require('child_process')

const NODE_VERSION = process.env.HARVEST_BUNDLE_NODE_VERSION || '20.18.1'
const root = path.join(__dirname, '..')
const vendorDir = path.join(root, 'vendor')
const nodeDir = path.join(vendorDir, 'node')
const nodeExe = path.join(nodeDir, 'node.exe')
const stamp = path.join(nodeDir, `.node-${NODE_VERSION}`)

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const go = (u, redirects = 0) => {
      https
        .get(u, (res) => {
          if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
            if (redirects > 5) return reject(new Error('Too many redirects'))
            res.resume()
            return go(res.headers.location, redirects + 1)
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Download failed HTTP ${res.statusCode} for ${u}`))
            return
          }
          res.pipe(file)
          file.on('finish', () => file.close(() => resolve()))
        })
        .on('error', reject)
    }
    go(url)
  })
}

async function main() {
  if (fs.existsSync(nodeExe) && fs.existsSync(stamp)) {
    console.log(`[bundle-node] Reusing ${nodeExe}`)
    return
  }

  fs.mkdirSync(vendorDir, { recursive: true })
  const zipName = `node-v${NODE_VERSION}-win-x64.zip`
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${zipName}`
  const zipPath = path.join(vendorDir, zipName)

  console.log(`[bundle-node] Downloading ${url}`)
  await download(url, zipPath)

  if (fs.existsSync(nodeDir)) {
    fs.rmSync(nodeDir, { recursive: true, force: true })
  }

  const expand = path.join(vendorDir, `node-v${NODE_VERSION}-win-x64`)
  if (fs.existsSync(expand)) {
    fs.rmSync(expand, { recursive: true, force: true })
  }

  console.log('[bundle-node] Extracting…')
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${vendorDir.replace(/'/g, "''")}' -Force`
    ],
    { stdio: 'inherit' }
  )

  fs.renameSync(expand, nodeDir)
  fs.writeFileSync(stamp, NODE_VERSION, 'utf8')
  fs.unlinkSync(zipPath)

  if (!fs.existsSync(nodeExe)) {
    throw new Error(`node.exe missing after extract: ${nodeExe}`)
  }
  console.log(`[bundle-node] Ready at ${nodeExe}`)
}

main().catch((err) => {
  console.error('[bundle-node]', err)
  process.exit(1)
})
