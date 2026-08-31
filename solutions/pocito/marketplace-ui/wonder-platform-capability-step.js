import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

const fields = {plugins: 'pluginIds', skills: 'skillIds', tools: 'toolIds', knowledge: 'knowledgeIds'}
const emptyLines = {
  plugins: 'עדיין אין פלאגין. בנו פלאגין חדש, או חברו פלאגין קיים מהקטלוג.',
  skills: 'עדיין אין מיומנות — תהליך עבודה מוגדר שהסוכן יודע לבצע.',
  tools: 'עדיין אין כלי — פעולה במערכת חיצונית, כמו חיפוש או שליחה.',
  knowledge: 'עדיין אין מקור ידע — מסמכים שהתשובות מסתמכות עליהם.'
}

ReactComp('wonderPlatformCapabilityStep', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh}}) => props => {
      const {item, update, repo, openPicker, openEditor, createNested, primary, secondary = [], headline, intro} = props
      const {classes, resources} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const ids = resource => item[fields[resource]] || []
      const remove = (resource, id) => update({...item, [fields[resource]]: ids(resource).filter(value => value != id)})
      const contents = plugin => ['skills', 'tools', 'knowledge'].flatMap(resource =>
        (plugin[fields[resource]] || []).map(id => [resource, repo[resource]?.find(value => value.id == id)])
          .filter(([, found]) => found).map(([kind, found]) => h(`span:${classes.chip}`, {key: `${kind}-${found.id}`},
            h(`L:${found.icon || resources[kind].icon}`, {size: 11}), found.name)))
      const row = (resource, id) => {
        const found = repo[resource]?.find(value => value.id == id)
        if (!found) return h('div:px-4 py-3 text-[12px] text-[var(--wp-danger)]', {key: id},
          `${id} — המשאב אינו קיים עוד בקטלוג`)
        const inner = resource == 'plugins' ? contents(found) : []
        return h('div:group px-4 py-3 transition-colors hover:bg-[var(--wp-surface-2)]', {key: id},
          h('div:flex items-center gap-3', {},
            hh(ctx, dsls.react['react-comp'].wonderPlatformMark,
              {icon: found.icon || resources[resource].icon, text: found.mark, size: 'md'}),
            h('div:min-w-0 flex-1', {}, h('b:block truncate text-[13px] text-[var(--wp-ink)]', {}, found.name),
              h('p:truncate text-[12px] text-[var(--wp-ink-3)]', {}, found.desc || '')),
            found.managed && h(`span:${classes.chip}`, {}, 'מנוהל'),
            !found.managed && h(`button:${classes.icon} opacity-0 group-hover:opacity-100`,
              {onClick: () => openEditor(resource, found, fields[resource]), 'aria-label': `עריכת ${found.name}`,
                title: `עריכת ${found.name}`}, h('L:Pencil', {size: 14})),
            h(`button:${classes.icon} opacity-0 hover:bg-[var(--wp-danger-soft)] hover:text-[var(--wp-danger)] ` +
              'group-hover:opacity-100', {onClick: () => remove(resource, id), 'aria-label': `הסרת ${found.name}`,
              title: `הסרת ${found.name}`}, h('L:X', {size: 14}))),
          inner.length > 0 && h('div:mt-2 flex flex-wrap gap-1.5 ps-12', {}, inner))
      }
      const group = (resource, quiet) => {
        const list = ids(resource), meta = resources[resource]
        const action = (label, icon, onClick, aria) => h(`button:${quiet
          ? 'text-[12px] font-medium text-[var(--wp-ink-3)] transition-colors hover:text-[var(--wp-ink)]'
          : `${classes.button} h-8`}`, {onClick, 'aria-label': aria},
        !quiet && h(`L:${icon}`, {size: 14}), label)
        return h(`section:${classes.panel} overflow-hidden`, {key: resource},
          h(`div:flex items-center justify-between gap-3 px-4 py-2.5 ${quiet
            ? '' : 'border-b border-[var(--wp-border)] bg-[var(--wp-surface-2)]'}`, {},
          h(`span:flex min-w-0 items-center gap-2 text-[12px] font-semibold ${quiet
            ? 'text-[var(--wp-ink-3)]' : 'text-[var(--wp-ink-2)]'}`, {},
          h(`L:${meta.icon}`, {size: 14}), meta.title,
          h('span:wp-num text-[var(--wp-ink-4)]', {}, list.length)),
          h('div:flex shrink-0 items-center gap-3', {},
            action(meta.create, 'Plus', () => createNested(resource, fields[resource]), meta.create),
            action('חיבור קיים', 'Link', () => openPicker(fields[resource], resource, meta.title),
              `חיבור ${meta.title} קיימים`))),
          list.length > 0 && h(`div:divide-y divide-[var(--wp-border)] ${quiet
            ? 'border-t border-[var(--wp-border)]' : ''}`, {}, list.map(id => row(resource, id))),
          !list.length && !quiet && h('p:px-4 py-6 text-center text-[12px] leading-6 text-[var(--wp-ink-3)]', {},
            emptyLines[resource]))
      }
      return h('div:space-y-5', {},
        h('div', {}, h('h2:text-[15px] font-semibold text-[var(--wp-ink)]', {}, headline),
          h(`p:mt-1.5 ${classes.body} text-[13px]`, {}, intro)),
        h('div:space-y-3', {}, primary.map(resource => group(resource))),
        secondary.length > 0 && h('section:pt-1', {},
          h('h3:text-[13px] font-semibold text-[var(--wp-ink-2)]', {}, 'חיבור ישיר'),
          h(`p:mb-3 ${classes.help}`, {},
            'אפשר גם לחבר מיומנות, כלי או מקור ידע ישירות, בלי לעטוף אותם בפלאגין.'),
          h('div:space-y-2', {}, secondary.map(resource => group(resource, true)))))
    }
  })
})
