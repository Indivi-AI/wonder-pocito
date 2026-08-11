import { dsls, coreUtils } from '@jb6/core'
import '@jb6/react'
import '@wonder/llm-flow/llm-flow-core.js'
import '@wonder/core/content-types.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls
const LOG_WURL = 'room://idf/logExample.json'

const QA_JQ = `$top | select(.runRes and .workflowLog) | {userMessage: (.metadata.userMessage // .workflowLog[0].userMessage),
  responseText: (.responseText // .runRes.text // .runRes), userId: .workflowLog[0].userId}`
const CALLS_JQ = `$top | select(.routeTaken)`

const CODE_TEXT = `// a log viewer is just a ReactComp. its metadata declares the tab:
//   abbr - the tab label, priority - tab order
//   matchData - a JQ over the log ($top): a match means "this tab applies", and its output is the data the tab renders

ReactComp('biglogQandA', {
  impl: comp({
    hFunc: renderQuestionAnswer,
    metadata: [abbr('Q&A'), matchData(jqSingle(\`${QA_JQ}\`)), priority(0)]
  })
})

ReactComp('agentRunView', {              // the llm-calls tab
  impl: comp({
    hFunc: renderLlmCalls,
    metadata: [abbr('AGENT'), matchData(jq('${CALLS_JQ}', { first: true })), priority(0)]
  })
})

ReactComp('topView', {                   // the ALL tab - matches every log
  impl: comp({
    hFunc: renderRawJson,
    metadata: [abbr('ALL'), matchData('%$top%'), priority(5)]
  })
})

// the viewer scans the registered comps, runs each matchData JQ over the log - every match becomes a tab`

const LOGS_CSS = `
.log-pane{flex:1;min-height:0;overflow:auto;padding:18px 24px;text-align:left}
.log-label{font:700 16px Sora;color:#67e8f9;margin:14px 0 6px}
.log-q,.log-a{border:1px solid #26324a;border-radius:12px;padding:14px 18px;font:500 23px/1.5 Heebo;color:#e8ebf6;background:rgba(34,211,238,.06)}
.log-a{background:rgba(255,255,255,.04);white-space:pre-wrap;overflow-wrap:anywhere}
.log-route{display:flex;gap:10px;align-items:center;font:600 18px Heebo;color:#9fb0d0;margin-bottom:14px}
.log-chip{border:1px solid rgba(34,211,238,.5);border-radius:999px;padding:4px 16px;color:#67e8f9}
.log-call{display:flex;justify-content:space-between;align-items:baseline;gap:14px;border-bottom:1px solid #26324a;padding:12px 4px;
font:500 21px Heebo;color:#c7cce0;cursor:pointer}
.log-call:hover{background:rgba(34,211,238,.05)}
.log-io{margin:0 0 12px;padding:16px;border:1px solid #26324a;border-radius:10px;background:#0b1322;color:#c7d2fe;
font:400 13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere;max-height:460px;overflow:auto;text-align:left}
.log-call b{color:#e8ebf6;font-weight:600}
.log-call .mono{font:500 16px ui-monospace,Menlo,monospace;color:#8ea0c0;white-space:nowrap}
`
const shorten = obj => JSON.parse(JSON.stringify(obj, (k, v) => typeof v == 'string' && v.length > 400 ? v.slice(0, 400) + `...[${v.length} chars]` : v))
const callBody = ({ messages = [], fullContent }) => `== System ==
${messages.find(m => m.role == 'system')?.content || ''}

== User ==
${messages.find(m => m.role == 'user')?.content || ''}

== Result ==
${fullContent || ''}`

ReactComp('idfLogsViz', {
  impl: comp({
    hFunc: (ctx, { react: { h, useState, useEffect } }) => () => {
      const [log, setLog] = useState(null)
      const [tab, setTab] = useState('Q&A')
      const [openCalls, setOpenCalls] = useState({})
      useEffect(() => { dsls.common.data.wonderGet.$runWithCtx(ctx, LOG_WURL)
        .then(data => setLog(data && coreUtils.resolveRefs(data))).catch(() => setLog(null)) }, [])
      const qa = log && dsls.common.data.jqSingle.$runWithCtx(ctx.setVars({ top: log }), QA_JQ)
      const calls = (log?.workflowLog || []).filter(x => /llm call finished$/.test(x.t || ''))
      const secs = ms => `${(ms / 1000).toFixed(1)}s`
      return h('div:iv', {}, h('style', {}, LOGS_CSS), h('div:iv-title', {}, 'Logs'),
        h('div:toggle', {}, ...['ALL', 'Q&A', 'llm calls', 'Code'].map(id =>
          h('button', { key: id, className: tab == id ? 'on' : '', onClick: () => setTab(id) }, id))),
        h('div:win', {}, h('div:chrome', {}, h('i'), h('i'), h('i'), `${LOG_WURL} — agent-comaxAgent (the applet on this deck)`),
          !log ? h('div:log-pane', {}, 'loading...')
          : tab == 'ALL' ? h('pre:code-pane', {}, JSON.stringify(shorten(log), null, 2).slice(0, 12000))
          : tab == 'Q&A' ? h('div:log-pane', {},
              h('div:log-label', {}, `Question · ${qa?.userId || ''}`), h('div:log-q', {}, qa?.userMessage),
              h('div:log-label', {}, 'Answer'), h('div:log-a', {}, qa?.responseText))
          : tab == 'llm calls' ? h('div:log-pane', {},
              h('div:log-route', {}, 'route:', ...(log.routeTaken || []).map(step => h('span:log-chip', { key: step }, step))),
              ...calls.flatMap((call, i) => [
                h('div:log-call', { key: i, onClick: () => setOpenCalls(o => ({ ...o, [i]: !(o[i] ?? false) })) },
                  h('div', {}, h('b', {}, `${openCalls[i] ? '▾' : '▸'} ${call.goal || call.t}`),
                    h('div:mono', {}, `in ${call.inputTokens} / out ${call.outputTokens} tok`)),
                  h('div:mono', {}, `${call.model} · ${secs(call.duration || 0)}`)),
                openCalls[i] && h('pre:log-io', { key: `io${i}` }, callBody(call))
              ].filter(Boolean)))
          : h('pre:code-pane', {}, CODE_TEXT)),
        h('div:iv-caption', {}, 'Every log viewer is a ', h('b', {}, 'ReactComp whose metadata JQ selects the logs it can show'),
          ' — the viewers matching a log become its tabs.'))
    }
  })
})
