/**
 * Generates tray PNG + Windows ICO for the harvest agent installer.
 * No external branding asset required.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

const outPng = path.join(root, 'build', 'icon.png')
const trayPng = path.join(root, 'electron', 'assets', 'tray.png')
const outIco = path.join(root, 'build', 'icon.ico')

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="196" fill="#1e3a5f"/>
  <circle cx="512" cy="512" r="300" fill="none" stroke="#7dd3fc" stroke-width="36"/>
  <text x="512" y="600" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="380" font-weight="700" fill="#ffffff">H</text>
</svg>`

await fs.promises.mkdir(path.dirname(outPng), { recursive: true })
await fs.promises.mkdir(path.dirname(trayPng), { recursive: true })

const pngBuf = await sharp(Buffer.from(svg)).png().toBuffer()
await fs.promises.writeFile(outPng, pngBuf)
await fs.promises.writeFile(trayPng, pngBuf)

const ico = await pngToIco(outPng)
await fs.promises.writeFile(outIco, ico)

console.log('Wrote', path.relative(root, outPng), path.relative(root, trayPng), path.relative(root, outIco))
