/**
 * secrets.js — harvest agent secret storage (Windows DPAPI or Electron safeStorage).
 * Plaintext agentSecret in harvest-agent.config.json is migrated out on first load.
 */

const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execSync } = require('child_process')

const CONFIG_DIR = process.env.HARVEST_CONFIG_DIR || process.cwd()
const CONFIG_FILE = path.join(CONFIG_DIR, 'harvest-agent.config.json')

const SECRET_DPAPI_FILE = path.join(CONFIG_DIR, 'agent-secret.dpapi')
const SECRET_SAFE_FILE = path.join(CONFIG_DIR, 'agent-secret.bin')

function safeStorageAvailable() {
  try {
    if (!process.versions.electron) return false
    const { safeStorage } = require('electron')
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function encryptWithSafeStorage(plaintext) {
  const { safeStorage } = require('electron')
  const buf = safeStorage.encryptString(plaintext)
  fs.writeFileSync(SECRET_SAFE_FILE, buf)
  if (fs.existsSync(SECRET_DPAPI_FILE)) fs.unlinkSync(SECRET_DPAPI_FILE)
}

function decryptFromSafeStorage() {
  if (!fs.existsSync(SECRET_SAFE_FILE)) return ''
  const { safeStorage } = require('electron')
  return safeStorage.decryptString(fs.readFileSync(SECRET_SAFE_FILE))
}

function encryptWithDpapi(plaintext) {
  if (process.platform !== 'win32') {
    return encryptWithFallback(plaintext)
  }
  const inputB64 = Buffer.from(plaintext, 'utf8').toString('base64')
  const cmd = [
    'powershell',
    '-NoProfile',
    '-Command',
    `$b=[Convert]::FromBase64String('${inputB64}');$e=[System.Security.Cryptography.ProtectedData]::Protect($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);[Convert]::ToBase64String($e)`
  ].join(' ')
  const out = execSync(cmd, { encoding: 'utf8', windowsHide: true }).trim()
  fs.writeFileSync(SECRET_DPAPI_FILE, out, 'utf8')
  if (fs.existsSync(SECRET_SAFE_FILE)) fs.unlinkSync(SECRET_SAFE_FILE)
}

function decryptFromDpapi() {
  if (!fs.existsSync(SECRET_DPAPI_FILE)) return ''
  const enc = fs.readFileSync(SECRET_DPAPI_FILE, 'utf8').trim()
  const cmd = [
    'powershell',
    '-NoProfile',
    '-Command',
    `$e=[Convert]::FromBase64String('${enc}');$d=[System.Security.Cryptography.ProtectedData]::Unprotect($e,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);[Text.Encoding]::UTF8.GetString($d)`
  ].join(' ')
  return execSync(cmd, { encoding: 'utf8', windowsHide: true }).trim()
}

function encryptWithFallback(plaintext) {
  const key = crypto.scryptSync(
    `${os.hostname()}:${os.userInfo().username}:shift-close-harvest`,
    'harvest-agent',
    32
  )
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const payload = {
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: enc.toString('base64')
  }
  fs.writeFileSync(SECRET_DPAPI_FILE, JSON.stringify(payload), 'utf8')
}

function decryptFromFallback() {
  if (!fs.existsSync(SECRET_DPAPI_FILE)) return ''
  const raw = fs.readFileSync(SECRET_DPAPI_FILE, 'utf8')
  if (!raw.trim().startsWith('{')) return ''
  const payload = JSON.parse(raw)
  const key = crypto.scryptSync(
    `${os.hostname()}:${os.userInfo().username}:shift-close-harvest`,
    'harvest-agent',
    32
  )
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(payload.iv, 'base64')
  )
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
  const plain = Buffer.concat([
    decipher.update(Buffer.from(payload.data, 'base64')),
    decipher.final()
  ])
  return plain.toString('utf8')
}

function getStoredSecret() {
  try {
    if (safeStorageAvailable() && fs.existsSync(SECRET_SAFE_FILE)) {
      return decryptFromSafeStorage()
    }
    if (fs.existsSync(SECRET_DPAPI_FILE)) {
      const raw = fs.readFileSync(SECRET_DPAPI_FILE, 'utf8').trim()
      if (raw.startsWith('{')) return decryptFromFallback()
      if (process.platform === 'win32') return decryptFromDpapi()
    }
  } catch (err) {
    console.warn('[Secrets] Could not read stored secret:', err.message)
  }
  return ''
}

function setStoredSecret(secret) {
  if (!secret || typeof secret !== 'string') {
    throw new Error('Secret is required')
  }
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
  if (safeStorageAvailable()) {
    encryptWithSafeStorage(secret)
  } else if (process.platform === 'win32') {
    encryptWithDpapi(secret)
  } else {
    encryptWithFallback(secret)
  }
  scrubPlaintextFromConfig()
}

function clearStoredSecret() {
  if (fs.existsSync(SECRET_DPAPI_FILE)) fs.unlinkSync(SECRET_DPAPI_FILE)
  if (fs.existsSync(SECRET_SAFE_FILE)) fs.unlinkSync(SECRET_SAFE_FILE)
  scrubPlaintextFromConfig()
}

function hasStoredSecret() {
  if (getStoredSecret()) return true
  if (!fs.existsSync(CONFIG_FILE)) return false
  try {
    const j = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    return Boolean(j.agentSecret)
  } catch {
    return false
  }
}

function scrubPlaintextFromConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return
  try {
    const j = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    if (!j.agentSecret) return
    delete j.agentSecret
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(j, null, 2), 'utf8')
  } catch {
    // ignore
  }
}

function migratePlaintextFromConfig(plaintext) {
  if (!plaintext) return
  if (getStoredSecret()) {
    scrubPlaintextFromConfig()
    return
  }
  try {
    setStoredSecret(plaintext)
    console.log('[Secrets] Migrated agentSecret from config file into secure storage')
  } catch (err) {
    console.warn('[Secrets] Could not migrate secret:', err.message)
  }
}

module.exports = {
  getStoredSecret,
  setStoredSecret,
  clearStoredSecret,
  hasStoredSecret,
  migratePlaintextFromConfig,
  scrubPlaintextFromConfig
}
