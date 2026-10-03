/**
 * Walk a claimed sync run one step at a time.
 * A pause stops the queue. A normal failure is recorded and the next step still runs.
 */

async function executeSyncRun({ run, isPaused, pauseMessage, reportStep, runJob }) {
  const steps = Array.isArray(run?.steps) ? run.steps : []
  for (const step of steps) {
    if (step.status === 'pass' || step.status === 'fail') continue

    if (isPaused()) {
      await reportStep({
        runId: run.id,
        taskKey: step.taskKey,
        status: 'paused',
        message: pauseMessage() || 'Paused'
      })
      return 'paused'
    }

    await reportStep({
      runId: run.id,
      taskKey: step.taskKey,
      status: 'running',
      message: null
    })

    const result = await runJob(step.taskKey, { year: run.year, month: run.month })
    const paused =
      isPaused() || Boolean(result && (result.cloudflarePending || result.loginFailed))
    if (paused) {
      await reportStep({
        runId: run.id,
        taskKey: step.taskKey,
        status: 'paused',
        message: (result && result.message) || pauseMessage() || 'Paused'
      })
      return 'paused'
    }

    if (!result) {
      await reportStep({
        runId: run.id,
        taskKey: step.taskKey,
        status: 'fail',
        message: 'Job did not start'
      })
      continue
    }

    await reportStep({
      runId: run.id,
      taskKey: step.taskKey,
      status: result.ok ? 'pass' : 'fail',
      message: result.message || null
    })
  }
  return 'done'
}

module.exports = { executeSyncRun }
