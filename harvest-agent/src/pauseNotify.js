/**
 * pauseNotify.js — notify Shift Close when the agent enters a paused state.
 */

const { sendHeartbeat, sendTask } = require('./shiftCloseClient')

async function notifyCloudPaused(config, { reason, message }) {
  const startedAt = new Date()
  const finishedAt = new Date()
  const pauseReason = reason || 'cstore_login_failed'
  const pauseMessage =
    message ||
    'Cstore login failed. Verify the password in Chrome on this PC, then click Resume in the harvest dashboard.'

  try {
    await sendTask(config, {
      taskKey: 'agent_paused',
      status: 'fail',
      message: pauseMessage,
      details: {
        pauseReason,
        code: pauseReason,
        loginFailed: pauseReason === 'cstore_login_failed'
      },
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      cstoreSessionOk: false,
      paused: true,
      pauseReason
    })
  } catch (err) {
    console.error('[Harvest] Failed to record paused task:', err.message)
  }

  try {
    await sendHeartbeat(config, {
      cstoreSessionOk: false,
      paused: true,
      pauseReason
    })
  } catch (err) {
    console.error('[Harvest] Paused heartbeat failed:', err.message)
  }
}

module.exports = { notifyCloudPaused }
