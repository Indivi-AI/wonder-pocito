import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

const wonderPlatformInline = (h, text) => text.split(/(\*\*.+?\*\*|`[^`]+?`|\[[^\]]+?\]\([^)]+?\))/g).filter(Boolean)
  .map((part, index) => {
    const bold = part.match(/^\*\*(.+)\*\*$/); if (bold) return h('b', {key: index}, bold[1])
    const code = part.match(/^`([^`]+)`$/)
    if (code) return h('code:wp-num rounded-[4px] bg-[var(--wp-surface-code)] px-1 py-0.5 text-[12px]', {key: index, dir: 'ltr'}, code[1])
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) return h('a:text-[var(--wp-ink)] underline underline-offset-2', {key: index, href: link[2],
      target: '_blank', rel: 'noreferrer'}, link[1])
    return part
  })

const wonderPlatformMarkdownBlocks = (h, text) => {
  const lines = text.split('\n'), blocks = []
  let listBuf = [], i = 0
  const flushList = () => { if (listBuf.length) blocks.push(h('ul:my-1.5 ms-4 list-disc space-y-1', {key: blocks.length},
    listBuf.map((item, index) => h('li', {key: index}, wonderPlatformInline(h, item))))); listBuf = [] }
  while (i < lines.length) {
    const line = lines[i]
    if (line.match(/^```/)) {
      flushList(); const body = []; i++
      while (i < lines.length && !lines[i].match(/^```/)) { body.push(lines[i]); i++ }
      blocks.push(h('pre:wp-scroll my-1.5 max-w-full overflow-auto rounded-[8px] bg-[var(--wp-surface-code)] p-2.5 text-[12px] ' +
        'leading-[1.6] wp-num', {key: blocks.length, dir: 'ltr'}, body.join('\n')))
      i++; continue
    }
    const heading = line.match(/^(#{1,3})\s+(.+)/)
    if (heading) { flushList()
      const size = {1: 'text-[15px]', 2: 'text-[14px]', 3: 'text-[13px]'}[heading[1].length]
      blocks.push(h(`h3:${size} mt-3 font-semibold text-[var(--wp-ink)]`, {key: blocks.length}, wonderPlatformInline(h, heading[2])))
      i++; continue
    }
    const item = line.match(/^[-*]\s+(.+)/)
    if (item) { listBuf.push(item[1]); i++; continue }
    flushList()
    if (line.trim()) blocks.push(h('p:my-1.5 leading-[1.7]', {key: blocks.length, dir: 'auto'}, wonderPlatformInline(h, line)))
    i++
  }
  flushList()
  return blocks
}

ReactComp('wonderPlatformAgentResult', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({result, setMessage}) => h('div', {},
      h('div:text-[13px] text-[var(--wp-ink)]', {}, wonderPlatformMarkdownBlocks(h, result.text || result.output || '')),
      (result.followUps || []).length > 0 && h('div:mt-2 divide-y divide-[var(--wp-border)] overflow-hidden rounded-[8px] ' +
        'border border-[var(--wp-border)]', {}, result.followUps.map(text => h(
        'button:flex w-full items-center gap-2 bg-[var(--wp-surface)] px-3 py-2 text-start text-[12.5px] text-[var(--wp-ink-2)] ' +
        'transition-colors hover:bg-[var(--wp-surface-2)] hover:text-[var(--wp-ink)]',
        {key: text, onClick: () => setMessage?.(text)},
        h('span:min-w-0 flex-1 truncate', {}, text), h('L:ArrowLeft', {size: 13, className: 'shrink-0 text-[var(--wp-ink-4)]'})))),
      (result.duration || result.runId || result.opikUrl) && h('div:mt-3 flex flex-wrap items-center gap-x-3 gap-y-1', {},
        result.duration && h('span:wp-num text-[11px] text-[var(--wp-ink-5)]', {}, result.duration),
        result.runId && h('button:wp-num cursor-pointer text-[11px] text-[var(--wp-ink-5)] transition-colors ' +
          'hover:text-[var(--wp-ink-3)]', {onClick: () => navigator.clipboard?.writeText(result.runId), title: result.runId},
          `run · ${result.runId.slice(0, 8)}`),
        result.opikUrl && h('a:text-[11px] text-[var(--wp-ink-5)] underline underline-offset-2 transition-colors ' +
          'hover:text-[var(--wp-ink-3)]', {href: result.opikUrl, target: '_blank', rel: 'noreferrer'}, 'Opik ↗')))
  })
})
