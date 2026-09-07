import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformAgnoResult', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({result}) => {
      const {classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const isStreaming = !!result.streaming
      return h(
        `div:${classes.card}`, {'data-agent-harness': 'agno'},
        h('div:mb-3 flex items-center justify-between gap-3 text-[12px] font-semibold text-[var(--wp-ink-2)]', {},
          h('span:flex items-center gap-1.5', {},
            isStreaming && h('span:inline-block h-2 w-2 animate-ping rounded-full bg-[var(--wp-ink)]'),
            h('span', {}, isStreaming ? 'הסוכן משיב כעת…' : 'תשובת AgentOS')),
          h(`span:${classes.mono}`, {}, isStreaming ? 'כותב…' : (result.runId || 'הושלם'))),
        h('div:whitespace-pre-wrap text-[13px] leading-7', {dir: 'auto'}, result.text || (isStreaming ? '…' : result.output)),
        result.sessionId && h(`div:mt-3 ${classes.mono}`, {}, `session · ${result.sessionId}`)
      )
    }
  })
})
ReactComp('wonderPlatformLlmFlowResult', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({result, setMessage}) => {
      const {classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      return h(
        `div:${classes.card}`, {'data-agent-harness': 'llmflow'},
        h('div:mb-3 flex items-center justify-between gap-3 text-[12px] font-semibold text-[var(--wp-ink-2)]', {},
          h('span', {}, 'תשובת LLM Flow'), h(`span:${classes.mono}`, {}, `${result.runtimeSteps?.length || 0} שלבים`)),
        h('div:whitespace-pre-wrap text-[13px] leading-7', {}, result.text || result.output || JSON.stringify(result, null, 2)),
        (result.followUps || []).length > 0 && h('div:mt-4 flex flex-wrap gap-2', {}, result.followUps.map(text => h(
          'button:rounded-full border border-[var(--wp-border-strong)] bg-[var(--wp-surface-3)] px-3 py-1.5 ' +
          'text-[12px] text-[var(--wp-ink-2)]',
          {key: text, onClick: () => setMessage?.(text)}, text)))
      )
    }
  })
})
ReactComp('wonderPlatformAgentResult', {
  impl: comp({
    hFunc: (ctx, {react: {hh}}) => props => hh(ctx,
      props.result.harness == 'llmflow'
        ? dsls.react['react-comp'].wonderPlatformLlmFlowResult
        : dsls.react['react-comp'].wonderPlatformAgnoResult,
      props)
  })
})

ReactComp('wonderPlatformRunTrace', {
  impl: comp({
    hFunc: (ctx, {react: {h, useState}}) => ({steps = [], status}) => {
      if (!steps.length) return null
      const [fullTables, setFullTables] = useState({})
      const toggleFull = key => setFullTables(prev => ({...prev, [key]: !prev[key]}))
      const failed = steps.some(step => step.status == 'נכשל'), text = value => typeof value == 'string' ? value : JSON.stringify(value, null, 2)
      const parseValue = val => {
        if (typeof val != 'string') return val
        try { return JSON.parse(val) } catch {}
        try {
          return JSON.parse(val.replace(/'/g, '"').replace(/\bNone\b/g, 'null').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false'))
        } catch { return val }
      }
      const rowsOf = value => {
        if (Array.isArray(value)) return value
        if (!value || typeof value != 'object') return []
        for (const child of Object.values(value)) { const rows = rowsOf(child); if (rows.length) return rows }
        return []
      }
      const valueBlock = (label, rawVal, blockKey) => {
        if (rawVal == null || rawVal === '') return null
        const value = parseValue(rawVal)
        const rows = rowsOf(value), isFull = !!fullTables[blockKey], shown = isFull ? rows : rows.slice(0, 5)
        const columns = [...new Set(shown.flatMap(row =>
          row && typeof row == 'object' && !Array.isArray(row) ? Object.keys(row) : ['ערך']))].slice(0, 8)
        const fileInfo = value?._file || (value && typeof value == 'object' && Object.values(value).find(v => v?._file)?._file)
        const downloadJson = () => {
          const content = JSON.stringify(rows.length ? rows : value, null, 2)
          const blob = new Blob([content], {type: 'application/json'})
          const a = document.createElement('a')
          a.href = URL.createObjectURL(blob)
          a.download = fileInfo?.name || 'table_results.json'
          a.click()
        }
        const table = rows.length > 0 && h('div:overflow-x-auto rounded-[7px] border border-[var(--wp-border)]', {},
          h('div:flex flex-wrap items-center justify-between gap-2 border-b border-[var(--wp-border)] bg-[var(--wp-surface-2)] px-2.5 py-1.5 text-[11px] text-[var(--wp-ink-3)]', {},
            h('span:font-medium', {}, `${isFull ? rows.length : Math.min(5, rows.length)} מתוך ${rows.length} שורות${fileInfo ? ` · ${fileInfo.name}` : ''}`),
            h('div:flex items-center gap-1.5', {},
              h('button:rounded bg-[var(--wp-surface-3)] px-2 py-0.5 text-[11px] font-medium text-[var(--wp-ink)] transition-colors hover:bg-[var(--wp-border)]',
                {onClick: downloadJson, title: 'הורדת הקובץ המלא'}, 'הורדת קובץ מלא'),
              rows.length > 5 && h('button:rounded bg-[var(--wp-surface-3)] px-2 py-0.5 text-[11px] font-medium text-[var(--wp-ink)] transition-colors hover:bg-[var(--wp-border)]',
                {onClick: () => toggleFull(blockKey), title: isFull ? 'הצגת 5 שורות' : 'הצגת כל השורות'}, isFull ? 'הסתרת שורות' : 'הצגת כל השורות')
            )),
          h('table:w-full border-collapse text-start text-[11px]', {dir: 'auto'},
            h('thead', {}, h('tr', {}, columns.map(column => h(
              'th:border-b border-[var(--wp-border)] px-2 py-1.5 text-start font-semibold', {key: column}, column)))),
            h('tbody', {}, shown.map((row, index) => h('tr', {key: index}, columns.map(column => h(
              'td:max-w-[240px] border-b border-[var(--wp-border)] px-2 py-1.5 align-top', {key: column},
              text(column == 'ערך' ? row : row?.[column]))))))))
        return h('div:mt-3', {}, h('div:mb-1 text-[11px] font-semibold text-[var(--wp-ink-3)]', {}, label), table,
          h('details:mt-2', {}, h('summary:cursor-pointer text-[11px] text-[var(--wp-ink-3)]', {}, 'הצגת המידע המלא'),
            h('pre:mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-[7px] bg-[var(--wp-surface-3)] p-3 ' +
              'text-start font-mono text-[11px] leading-5 text-[var(--wp-ink)]', {dir: 'ltr'}, text(value))))
      }
      return h('details:mt-3 rounded-[8px] border border-[var(--wp-border)] bg-[var(--wp-surface-2)]',
        {'data-testid': 'run-trace', open: failed || undefined},
        h('summary:flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[12px] font-medium', {},
          h(`span:h-2 w-2 rounded-full ${failed ? 'bg-[var(--wp-danger)]' : 'bg-[var(--wp-success)]'}`),
          `מעקב הרצה · ${steps.length} שלבים · ${failed ? 'נכשל' : status || 'הושלם'}`),
        h('div:border-t border-[var(--wp-border)] p-3', {}, steps.map((step, index) => {
          const isFailed = step.status == 'נכשל'
          return h(`article:relative border-s-2 ${isFailed ? 'border-[var(--wp-danger)]' : 'border-[var(--wp-success)]'} ps-4 pb-4`,
            {key: `${step.kind}-${step.title}-${index}`, 'data-trace-status': isFailed ? 'failed' : 'completed'},
            h(`span:absolute -start-[7px] top-0 grid h-3 w-3 place-items-center rounded-full ${isFailed
              ? 'bg-[var(--wp-danger)]' : 'bg-[var(--wp-success)]'}`),
            h('div:flex flex-wrap items-center gap-2', {}, h('b:text-[12px]', {}, `${index + 1}. ${step.title || step.kind}`),
              h('span:rounded-full bg-[var(--wp-surface-3)] px-2 py-0.5 text-[10px] text-[var(--wp-ink-3)]', {}, step.kind),
              step.duration != null && h('span:font-mono text-[10px] text-[var(--wp-ink-4)]', {dir: 'ltr'},
                `${Number(step.duration).toFixed(2)}s`)),
            valueBlock('קלט', step.input, `${index}-in`), valueBlock('פלט', step.output, `${index}-out`), isFailed && valueBlock('שגיאה', step.error || 'שגיאה לא ידועה', `${index}-err`))
        })))
    }
  })
})
