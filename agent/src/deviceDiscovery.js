const os = require('os')
const net = require('net')
const DeviceClient = require('./deviceClient')

function isPrivateIpv4(ip) {
  if (!ip || net.isIP(ip) !== 4) return false
  if (ip.startsWith('10.')) return true
  if (ip.startsWith('192.168.')) return true
  const m = /^172\.(\d+)\./.exec(ip)
  if (!m) return false
  const n = parseInt(m[1], 10)
  return n >= 16 && n <= 31
}

function localPrivateIpv4() {
  const out = []
  const ifaces = os.networkInterfaces()
  for (const arr of Object.values(ifaces)) {
    for (const a of arr || []) {
      if (!a || a.family !== 'IPv4' || a.internal) continue
      if (isPrivateIpv4(a.address)) out.push(a.address)
    }
  }
  return [...new Set(out)]
}

function ipsFromLocalSubnets(seedIps) {
  const set = new Set()
  for (const ip of seedIps) {
    const parts = ip.split('.')
    if (parts.length !== 4) continue
    const base = `${parts[0]}.${parts[1]}.${parts[2]}.`
    for (let i = 1; i <= 254; i++) {
      const candidate = base + i
      if (candidate !== ip) set.add(candidate)
    }
  }
  return [...set]
}

function tcpOpen(host, port, timeoutMs = 250) {
  return new Promise((resolve) => {
    const sock = new net.Socket()
    let done = false
    const finish = (ok) => {
      if (done) return
      done = true
      try { sock.destroy() } catch {}
      resolve(ok)
    }
    sock.setTimeout(timeoutMs)
    sock.once('connect', () => finish(true))
    sock.once('timeout', () => finish(false))
    sock.once('error', () => finish(false))
    sock.connect(port, host)
  })
}

async function asyncPool(limit, items, worker) {
  const pending = new Set()
  const results = []
  for (const item of items) {
    const p = Promise.resolve().then(() => worker(item))
    pending.add(p)
    p.finally(() => pending.delete(p))
    results.push(p)
    if (pending.size >= limit) {
      await Promise.race(pending)
    }
  }
  return Promise.all(results)
}

async function discoverDeviceIp(options = {}) {
  const port = parseInt(options.port, 10) || 4370
  const timeoutMs = Math.max(100, parseInt(options.timeoutMs, 10) || 250)
  const concurrency = Math.max(8, parseInt(options.concurrency, 10) || 64)
  const localIps = localPrivateIpv4()
  const hinted = options.hintIp && isPrivateIpv4(options.hintIp) ? [options.hintIp] : []
  const candidates = [...new Set([...hinted, ...ipsFromLocalSubnets(localIps)])]

  const openHosts = []
  await asyncPool(concurrency, candidates, async (host) => {
    if (await tcpOpen(host, port, timeoutMs)) {
      openHosts.push(host)
    }
  })

  const found = []
  for (const host of openHosts) {
    const device = new DeviceClient(host, port)
    const test = await device.testConnection()
    if (test.ok) {
      found.push(host)
    }
  }

  return {
    ok: found.length > 0,
    ip: found[0] || null,
    found,
    scanned: candidates.length,
    openPorts: openHosts.length
  }
}

module.exports = { discoverDeviceIp }
