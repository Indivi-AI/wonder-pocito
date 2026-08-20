import { dsls } from '@jb6/core'
import '@jb6/common'

const { common: { Data } } = dsls

Data('platformV0Config', {
  impl: () => ({
    resources: {
      plugins: {title: 'פלאגינים', subtitle: 'פלאגין אורז מיומנויות, כלים וסאב-אייג׳נטים ליחידה אחת.',
        createLabel: 'פלאגין חדש', icon: 'PlugZap', typeLabel: 'פלאגין', relations: [['skills', 'מיומנויות'], ['tools', 'כלים ישירים'],
          ['agents', 'סאב-אייג׳נטים']]},
      skills: {title: 'מיומנויות', subtitle: 'ספרייה משותפת של תהליכי ביצוע.', createLabel: 'מיומנות חדשה', icon: 'BookOpenText',
        typeLabel: 'מיומנות', relations: [['tools', 'כלים']]},
      tools: {title: 'כלים', subtitle: 'כלי Connector מבוססי MCP מנוהלים; כלי Flow ניתנים לעריכה.', createLabel: 'כלי ממארז Flow',
        icon: 'Wrench', typeLabel: 'כלי'},
      agents: {title: 'סאב-אייג׳נטים', subtitle: 'ספרייה משותפת של יעדי האצלה ממוקדים.', createLabel: 'סאב-אייג׳נט חדש',
        icon: 'Network', typeLabel: 'סאב-אייג׳נט', relations: [['skills', 'מיומנויות'], ['tools', 'כלים']]}
    },
    primaryNav: [['plugins', 'PlugZap', 'פלאגינים'], ['chat', 'MessageCircle', 'צ׳אט'],
      ['evaluation', 'SquareCheckBig', 'אבלואציה']],
    libraryNav: [['skills', 'BookOpenText', 'מיומנויות'], ['tools', 'Wrench', 'כלים'], ['agents', 'Network', 'סאב-אייג׳נטים']],
    mobileNav: [['plugins', 'PlugZap', 'פלאגינים'], ['chat', 'MessageCircle', 'צ׳אט'], ['evaluation', 'SquareCheckBig', 'אבלואציה'],
      ['skills', 'BookOpenText', 'מיומנויות'], ['tools', 'Wrench', 'כלים'], ['agents', 'Network', 'סאב-אייג׳נטים']],
    apiResources: ['plugins', 'skills', 'tools', 'agents', 'reports', 'evalSets', 'evalRuns', 'conversations', 'flowPackages'],
    labels: {plugins: 'פלאגין', skills: 'מיומנות', tools: 'כלי', agents: 'סאב-אייג׳נט'},
    classes: {
      button: 'inline-flex items-center justify-center gap-2 rounded-xl border border-[#dfe5e1] bg-white px-3.5 py-2 text-sm',
      primary: 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#2f6b4b] px-4 py-2.5 text-sm font-semibold text-white',
      field: 'mt-2 w-full rounded-xl border border-[#dfe5e1] bg-[#f8faf9] px-3 py-2.5 text-sm outline-none focus:border-[#789b86]',
      card: 'rounded-2xl border border-[#e1e7e3] bg-white p-5 shadow-[0_1px_2px_rgba(30,50,40,.04)]',
      chip: 'rounded-full border border-[#dfe5e1] bg-[#f4f6f5] px-2.5 py-1 text-[11px] text-[#59615d]'
    }
  })
})

Data('platformV0Trace', {
  params: [{id: 'catalog', asIs: true}, {id: 'target', asIs: true}],
  impl: ({}, {}, {catalog, target}) => {
    const labels = {skills: 'מיומנות', tools: 'כלי', agents: 'האצלה'}, seen = new Set(), steps = []
    const visit = (resource, name, parent) => {
      const item = catalog[resource]?.find(value => value.name == name), key = `${resource}:${name}`
      if (!item || seen.has(key)) return
      seen.add(key); steps.push({resource, name, parent, kind: labels[resource], title: item.title})
      ;['skills', 'tools'].forEach(child => (item[child] || []).forEach(childName => visit(child, childName, name)))
    }
    ;['skills', 'tools', 'agents'].forEach(resource => (target[resource] || []).forEach(name => visit(resource, name, target.name)))
    return steps
  }
})
