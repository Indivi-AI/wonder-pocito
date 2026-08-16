export const authHttpLogger = (req, source) => {
  const active = req.query.logger === 'authLogger', startedAtEpoch = Date.now(), authLog = [], authErrors = []
  const runtime = {service: process.env.K_SERVICE || 'localhost', revision: process.env.K_REVISION,
    callId: req.query.callId}
  const entry = (data, severity) => ({...data, ...(severity && {severity}), seq: authLog.length + 1,
    at: Date.now() - startedAtEpoch, atEpoch: Date.now(), $source: source, ...runtime})
  return {
    info: data => active && authLog.push(entry(data)),
    error: data => active && ((e => (authLog.push(e), authErrors.push(e)))(entry(data, 'error'))),
    merge: logs => active && ['authLog', 'authErrors'].forEach(k => ({authLog, authErrors})[k].push(...(logs?.[k] || []))),
    body: body => active ? {...body, logs: {authLogger: {authLog: authLog.sort(byTime), authErrors: authErrors.sort(byTime)}}} : body
  }
}

const byTime = (a, b) => a.atEpoch - b.atEpoch || String(a.$source).localeCompare(String(b.$source)) || a.seq - b.seq
export const safeError = error => ({name: error?.name, message: error?.message || String(error), code: error?.code,
  status: error?.status, stack: error?.stack})
