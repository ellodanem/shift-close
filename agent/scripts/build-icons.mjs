/**
 * Crops the app tile from the horizontal winner artwork, writes PNGs + Windows .ico.
 * Source: assets/branding/shift-close-lockup-winner.png (may be JPEG data; sharp accepts it).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

const winnerPath = path.join(root, 'assets', 'branding', 'shift-close-lockup-winner.png')
const outPng = path.join(root, 'build', 'icon.png')
const trayPng = path.join(root, 'electron', 'assets', 'tray.png')
const outIco = path.join(root, 'build', 'icon.ico')

if (!fs.existsSync(winnerPath)) {
  console.error('Missing winner artwork:', winnerPath)
  process.exit(1)
}

const meta = await sharp(winnerPath).metadata()
const w = meta.width || 0
const h = meta.height || 0
if (!w || !h) {
  console.error('Could not read winner image dimensions')
  process.exit(1)
}

const side = Math.min(w, h)
const tile = sharp(winnerPath).extract({ left: 0, top: 0, width: side, height: side }).resize(1024, 1024, { fit: 'fill' })

await fs.promises.mkdir(path.dirname(outPng), { recursive: true })
await fs.promises.mkdir(path.dirname(trayPng), { recursive: true })

const pngBuf = await tile.png().toBuffer()
await fs.promises.writeFile(outPng, pngBuf)
await fs.promises.writeFile(trayPng, pngBuf)

const ico = await pngToIco(outPng)
await fs.promises.writeFile(outIco, ico)

console.log('Wrote', path.relative(root, outPng), path.relative(root, trayPng), path.relative(root, outIco))
