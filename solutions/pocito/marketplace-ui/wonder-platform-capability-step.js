import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformCapabilityStep', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh, useState}}) => props => {
      const {item, update, repo, openPicker, openEditor, classes, secondary} = props
      const [advancedOpen, setAdvancedOpen] = useState(false), pluginIds = item.pluginIds || []
      const attach = field => openPicker(field, field == 'pluginIds' ? 'plugins' : field == 'skillIds' ? 'skills' :
        field == 'toolIds' ? 'tools' : 'knowledge', {skillIds: 'מיומנויות', toolIds: 'כלים', knowledgeIds: 'ידע'}[field])
      const remove = (field, id) => update({...item, [field]: (item[field] || []).filter(x => x != id)})
      const buildNode = (resource, id) => {
        const r = {skills: 'skillIds', tools: 'toolIds'}[resource], found = repo[resource]?.find(x => x.id == id)
        if (!found) return null
        const children = r ? (found[r] || []).map(cId => buildNode(resource == 'skills' ? 'tools' : 'skills', cId)).filter(x => x) : []
        return {id, item: found, children, resource}
      }
      const renderNode = (node, depth) => {
        if (!node) return null
        return h('div:space-y-1', {key: `${node.resource}-${node.id}`},
          h('div:flex items-center gap-2 py-1.5', {},
            hh(ctx, dsls.react['react-comp'].wonderPlatformMark, {icon: node.item.icon, text: node.item.mark, size: 'sm'}),
            h('span:text-[12px] text-[var(--wp-ink-3)]', {}, node.item.name)),
          node.children?.map(child => renderNode(child, depth + 1)))
      }
      if (pluginIds.length == 0) {
        return h('div:space-y-4', {},
          h('p:text-[13px] text-[var(--wp-ink)]', {}, 'מה הסוכן צריך לדעת לעשות?'),
          h('p:text-[12px] leading-6 text-[var(--wp-ink-3)]', {},
            'פלאגין אורז מיומנויות, כלים וידע ליחידה אחת שהסוכן יכול להשתמש בה.'),
          h('div:grid gap-3 grid-cols-2', {},
            h('button:' + classes.card + ' flex flex-col items-center gap-3 p-4 text-center transition-colors ' +
              'hover:bg-[var(--wp-surface-2)]', {onClick: () => openPicker('pluginIds', 'plugins', 'פלאגינים')},
              h('div:grid h-10 w-10 place-items-center rounded-[8px] border border-[var(--wp-border)]', {},
                h('L:Plus', {size: 16, className: 'text-[var(--wp-ink-3)]'})),
              h('b:text-[13px] text-[var(--wp-ink)]', {}, 'בניית פלאגין חדש'),
              h('p:text-[11px] text-[var(--wp-ink-3)]', {}, 'הגדירו יכולת חדשה')),
            h('button:' + classes.card + ' flex flex-col items-center gap-3 p-4 text-center transition-colors ' +
              'hover:bg-[var(--wp-surface-2)]', {onClick: () => attach('pluginIds')},
              h('div:grid h-10 w-10 place-items-center rounded-[8px] border border-[var(--wp-border)]', {},
                h('L:Zap', {size: 16, className: 'text-[var(--wp-ink-3)]'})),
              h('b:text-[13px] text-[var(--wp-ink)]', {}, 'חיבור פלאגין קיים'),
              h('p:text-[11px] text-[var(--wp-ink-3)]', {}, 'בחרו מתוך הקטלוג'))))
      }
      const hasSecondary = secondary && (item.skillIds?.length || item.toolIds?.length || item.knowledgeIds?.length)
      return h('div:space-y-4', {}, h('div:' + classes.panel + ' divide-y divide-[var(--wp-border)]', {},
        h('div:px-4 py-2.5 flex items-center justify-between', {},
          h('span:text-[12px] font-semibold text-[var(--wp-ink-2)]', {}, `${pluginIds.length} פלאגינים`),
          h('button:text-[12px] text-[var(--wp-ink-3)] hover:text-[var(--wp-ink)]', {onClick: () => attach('pluginIds')},
            'הוספה')),
        pluginIds.map(id => {
          const plugin = repo.plugins?.find(x => x.id == id), skills = (plugin?.skillIds || []).map(sId =>
            buildNode('skills', sId)).filter(x => x)
          return h('div:px-4 py-2.5', {key: id},
            hh(ctx, dsls.react['react-comp'].wonderPlatformMark, {icon: plugin?.icon, text: plugin?.mark, size: 'md'}),
            h('b:block text-[13px] text-[var(--wp-ink)]', {}, plugin?.name),
            h('p:mt-1 text-[12px] text-[var(--wp-ink-3)]', {}, plugin?.desc),
            skills.length > 0 && h('div:mt-3 space-y-1 ps-4', {}, skills.map(s => renderNode(s, 0))))
        })),
      hasSecondary && h('details:' + classes.panel, {open: advancedOpen, onToggle: e => setAdvancedOpen(e.target.open)},
        h('summary:flex cursor-pointer items-center justify-between px-4 py-2.5 text-[12px] font-semibold ' +
          'text-[var(--wp-ink-2)] hover:text-[var(--wp-ink)]', {}, 'מתקדם · חיבור ישיר'),
        secondary.map(([field, resource, title]) => {
          const ids = item[field] || []
          return h('div:divide-y divide-[var(--wp-border)] border-t border-[var(--wp-border)]', {key: field},
            h('div:px-4 py-2.5 flex items-center justify-between bg-[var(--wp-surface-2)]', {},
              h('span:text-[12px] font-semibold text-[var(--wp-ink-2)]', {}, `${ids.length} ${title}`),
              h('button:text-[12px] text-[var(--wp-ink-3)] hover:text-[var(--wp-ink)]', {onClick: () => attach(field)},
                'הוספה')),
            ids.map(id => {
              const res = repo[resource]?.find(x => x.id == id), managed = resource == 'tools' && res?.managed
              return h('div:flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--wp-surface-2)]', {key: id},
                hh(ctx, dsls.react['react-comp'].wonderPlatformMark, {icon: res?.icon, text: res?.mark, size: 'sm'}),
                h('div:min-w-0 flex-1', {},
                  h('b:block text-[12px] text-[var(--wp-ink)]', {}, res?.name),
                  h('p:text-[11px] text-[var(--wp-ink-3)]', {}, res?.desc)),
                managed && h('span:text-[11px] text-[var(--wp-ink-4)]', {}, 'מנוהל'),
                h('button:text-[var(--wp-ink-3)] hover:text-[var(--wp-danger)] transition-colors',
                  {onClick: () => remove(field, id), 'aria-label': `הסרת ${res?.name}`},
                  h('L:X', {size: 14})))
            }))
        })))
    }
  })
})
