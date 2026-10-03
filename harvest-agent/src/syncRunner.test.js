const test = require('node:test')
const assert = require('node:assert/strict')
const { executeSyncRun } = require('./syncRunner')

function runFixture() {
  return {
    id: 'run-1',
    year: 2026,
    month: 10,
    steps: [
      { taskKey: 'customer_accounts', status: 'waiting' },
      { taskKey: 'vendor_invoices', status: 'waiting' },
      { taskKey: 'fuel_invoices', status: 'pass' },
      { taskKey: 'lpg_invoices', status: 'waiting' }
    ]
  }
}

test('a failed step still runs the later jobs', async () => {
  const reports = []
  const jobs = []
  const outcome = await executeSyncRun({
    run: runFixture(),
    isPaused: () => false,
    pauseMessage: () => '',
    reportStep: async (step) => {
      reports.push(step)
    },
    runJob: async (taskKey) => {
      jobs.push(taskKey)
      if (taskKey === 'customer_accounts') return { ok: false, message: 'one account failed' }
      return { ok: true, message: 'ok' }
    }
  })
  assert.equal(outcome, 'done')
  assert.deepEqual(jobs, ['customer_accounts', 'vendor_invoices', 'lpg_invoices'])
  assert.deepEqual(
    reports.filter((step) => step.status !== 'running').map((step) => [step.taskKey, step.status]),
    [
      ['customer_accounts', 'fail'],
      ['vendor_invoices', 'pass'],
      ['lpg_invoices', 'pass']
    ]
  )
})

test('a login pause stops the queue', async () => {
  const jobs = []
  const reports = []
  const outcome = await executeSyncRun({
    run: runFixture(),
    isPaused: () => false,
    pauseMessage: () => 'Check the password',
    reportStep: async (step) => {
      reports.push(step)
    },
    runJob: async (taskKey) => {
      jobs.push(taskKey)
      return { ok: false, loginFailed: true, message: 'Cstore rejected login' }
    }
  })
  assert.equal(outcome, 'paused')
  assert.deepEqual(jobs, ['customer_accounts'])
  assert.equal(reports.at(-1).status, 'paused')
  assert.equal(reports.at(-1).message, 'Cstore rejected login')
})

test('an already paused agent does not start the next job', async () => {
  const jobs = []
  const outcome = await executeSyncRun({
    run: runFixture(),
    isPaused: () => true,
    pauseMessage: () => 'Cloudflare is still waiting',
    reportStep: async () => {},
    runJob: async (taskKey) => {
      jobs.push(taskKey)
      return { ok: true }
    }
  })
  assert.equal(outcome, 'paused')
  assert.deepEqual(jobs, [])
})
