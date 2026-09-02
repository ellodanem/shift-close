/**
 * shiftCloseClient.js — heartbeat and task results to Shift Close.
 */

const os = require('os')
const { version } = require('../package.json')

function baseHeaders(config) {
  return {
    'Content-Type': 'application/json',
    'x-agent-secret': config.agentSecret
  }
}

function identity(config) {
  return {
    agentKey: config.agentKey,
    hostname: os.hostname(),
    version
  }
}

async function postJson(config, pathname, body) {
  if (!config.vercelUrl || !config.agentSecret) {
    throw new Error('vercelUrl or agentSecret is not configured')
  }
  const url = `${config.vercelUrl}${pathname}`
  const res = await fetch(url, {
    method: 'POST',
    headers: baseHeaders(config),
    body: JSON.stringify(body)
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status} from ${pathname}`)
  }
  return data
}

async function sendHeartbeat(config, extra = {}) {
  return postJson(config, '/api/harvest-agent/heartbeat', {
    ...identity(config),
    ...extra
  })
}

async function sendTask(config, task) {
  return postJson(config, '/api/harvest-agent/tasks', {
    ...identity(config),
    ...task
  })
}

async function sendCustomerCreditImport(config, body) {
  return postJson(config, '/api/harvest-agent/import/customer-credit-report', {
    ...identity(config),
    ...body
  })
}

module.exports = { sendHeartbeat, sendTask, sendCustomerCreditImport, identity }
