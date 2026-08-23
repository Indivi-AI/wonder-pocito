import { dsls } from '@jb6/core'
import '@jb6/common'
import './wonder-platform-skills.js'

const { common: { Data } } = dsls

Data('wonderPlatformSeed', {
  impl: () => {
    const rows = (keys, values) => values.map(row => Object.fromEntries(keys.map((key, index) => [key, row[index]])))
    const plugins = rows(['id', 'name', 'mark', 'version', 'status', 'desc', 'skillIds', 'toolIds', 'subagentIds', 'evaluationId'], [
      ['p1', 'אנליסט הוכחת קיום', 'הק', 'V3', 'פורסם',
        'בודק טענות מול מקורות ארגוניים ומחזיר תשובה מנומקת עם ראיות.',
        ['evidenceVerification', 'documentationGaps'], ['t1', 't3'], ['a1'], 'e1'],
      ['p2', 'מפרט שירות', 'מש', 'V2', 'פורסם', 'מנסח מפרטי שירות עקביים מתוך מסמכי ידע, CRM ותקדימים.',
        ['serviceSpecification'], ['t2', 't3'], ['a3'], 'e2'],
      ['p3', 'מבקר תפעולי', 'מת', 'V4', 'טיוטה', 'מאתר חריגות במדדים תפעוליים ומנסח תמונת מצב ניתנת לפעולה.',
        ['operationalMetrics'], ['t4', 't6'], ['a2'], 'e3'],
      ['p4', 'חבילת ספק', 'חס', 'V1', 'פורסם', 'מרכז מסמכי ספק, פערים ואישורים לחבילה אחת מוכנה לבקרה.',
        ['evidenceVerification', 'serviceSpecification'], ['t2', 't5'], [], 'e4']
    ]).map(item => ({...item, created: '08/2026', updated: 'היום',
      instructions: 'בסס כל מסקנה על מקורות, ציין פערים והחזר תשובה תמציתית שניתנת לאימות.',
      categories: item.id == 'p1' ? ['audit', 'he'] : item.id == 'p2' ? ['regulated', 'he'] : item.id == 'p3' ? ['warehouse', 'he'] : ['audit']}))
    const skills = dsls.common.data.wonderPlatformSkillDefinitions.$run()
    const tools = rows(['id', 'name', 'mark', 'desc', 'kind', 'managed', 'packageId'], [
      ['t1', 'חיפוש Jira', 'Ji', 'איתור משימות, סטטוסים וקישורים.', 'connector', true, ''],
      ['t2', 'חיפוש Confluence', 'Co', 'איתור דפים ומקטעי ידע ארגוני.', 'connector', true, ''],
      ['t3', 'CRM ארגוני', 'CR', 'קריאת חשבונות, אנשי קשר והזדמנויות.', 'connector', true, ''],
      ['t4', 'איחוד דוחות שבועיים', 'דש', 'איחוד דוחות לפי טווח תאריכים.', 'flow', false, '4821037'],
      ['t5', 'שליחת חבילת מסמכים', 'שמ', 'אריזה ושליחת מסמכים בדוא״ל.', 'flow', false, '4821048'],
      ['t6', 'מדדי מחסן', 'ממ', 'שאילתת מדדי תפעול ומלאי.', 'flow', false, '4821062']
    ]).map(item => ({...item, version: 'V0', created: '08/2026', updated: 'היום', inputSchema: [], outputCubes: []}))
    const subagents = rows(['id', 'name', 'mark', 'desc', 'skillIds', 'toolIds'], [
      ['a1', 'מחלץ ישויות', 'מי', 'מחלץ ארגונים, אנשים, תאריכים ומזהים.', [], ['t1', 't2']],
      ['a2', 'מסכם תמיכה', 'מת', 'מסכם רצף אירועי תמיכה לפי ציר זמן.', ['operationalMetrics'], []],
      ['a3', 'בודק עקביות', 'בע', 'מאתר סתירות בין מסמכים ורשומות.', ['documentationGaps'], ['t3']]
    ]).map(item => ({...item, version: 'V0', created: '08/2026', updated: 'היום', evaluationId: '',
      instructions: 'החזר רק מידע שנתמך במקורות שסופקו.'}))
    const report = (id, name, status, verifiedAt, desc, sourceCount, reportRows) => ({
      id, name, mark: 'דו', status, verifiedAt, desc, sourceCount, rows: rows(['subject', 'value', 'evidence'], reportRows)
    })
    const reports = [
      report('r1', 'דוח ראיות — תוכנית שחר', 'מאומת', '18.08.2026 · 14:32',
        'תמונת ראיות מאומתת לדרישות הליבה של תוכנית שחר.', 8, [
          ['אישור תקציבי', 'מאושר', 'Jira FIN-184 · פרוטוקול ועדה 12/08'],
          ['מוכנות תפעולית', '92%', 'דוח מחסן שבוע 33 · 46 מתוך 50 בדיקות'],
          ['פער פתוח', 'נוהל התאוששות', 'Confluence OPS-DR · חסר אישור בעל תפקיד']]),
      report('r2', 'כיסוי מפרט שירות — מוקד צפון', 'מאומת', '17.08.2026 · 09:10',
        'בדיקת כיסוי בין המפרט המחייב לבין תצורת השירות הפעילה.', 5, [
          ['חלון שירות', 'תואם', 'מפרט V6 · CRM SLA-41'], ['זמן תגובה', 'חריגה של 12 דק׳', 'ממוצע 42 דק׳ מול יעד 30 דק׳'],
          ['ערוץ חירום', 'פעיל', 'בדיקת קבלה 16/08 · קריאה INC-290']]),
      report('r3', 'בקרת ספקים — אוגוסט', 'בטיוטה', 'טרם אומת', 'סטטוס מסמכי חובה ואישורים לספקים פעילים.', 12, [
        ['ספקים תקינים', '18 מתוך 21', 'CRM ספקים · 18/08'], ['חסרי ביטוח', '2', 'ספקי אורן וקשת · אישור פג תוקף'],
        ['חסר אישור מס', '1', 'ספק גליל · בקשה פתוחה']])
    ]
    const evaluations = rows(['id', 'name', 'desc', 'rubric', 'input', 'expected'], [
      ['e1', 'אימות טענות ומקורות', 'בדיקות דיוק, כיסוי מקורות והצגת סתירות.', 'זהה כל פער וציין את מקורו.',
        'האם תוכנית שחר מוכנה ליציאה?', 'תשובה מבוססת עם מקורות ובלי מידע מומצא.'],
      ['e2', 'איכות מפרט שירות', 'מבנה, שלמות ועמידה במקור.', 'סמן מידע חסר וסתירות.', 'בנה מפרט למוקד צפון.',
        'מפרט מובנה שמפריד עובדה מהשערה.'],
      ['e3', 'דיוק מדדים תפעוליים', 'יחידות, תקופות וחישובי חריגה.', 'נרמל יחידות לפני השוואה.',
        'סכם חריגות שבוע 33.',
        'חריגות עם ערך, סף ומקור.'],
      ['e4', 'שלמות חבילת ספק', 'מסמכי חובה ועקביות פרטים.', 'אל תנחש מסמך חסר.', 'בדוק את ספק גליל.',
        'רשימת מסמכים קיימים וחסרים.']
    ]).map(({input, expected, ...item}) => ({...item, version: 'V0', created: '08/2026', updated: 'היום',
      rows: [{input, expected, notes: ''}]}))
    const steps = rows(['kind', 'name', 'ms'], [
      ['מיומנות', 'הוכחת קיום — תהליך מלא', '8.4s'], ['כלי', 'חיפוש Jira', '4.7s'],
      ['כלי', 'חיפוש Confluence', '6.2s'], ['האצלה', 'מחלץ ישויות', '5.1s'], ['מודל', 'ניסוח תשובה מאומתת', '4.4s']
    ])
    const conversations = [{id: 'c1', title: 'מוכנות תוכנית שחר', agentId: 'a1', when: 'היום', messages: [
      {id: 'm1', role: 'user', text: 'בדוק האם תוכנית שחר מוכנה ליציאה והצג את הראיות המרכזיות.'},
      {id: 'm2', role: 'agent', reportIds: ['r1', 'r2'], status: 'הושלם', duration: '41 שנ׳', steps,
        text: 'תוכנית שחר מוכנה חלקית: האישור התקציבי קיים ו-92% מבדיקות המוכנות עברו. ' +
          'הפער החוסם הוא נוהל ההתאוששות.'}
    ]}, {id: 'c2', title: 'פערי מפרט מוקד צפון', agentId: 'a3', when: 'אתמול', messages: []},
    {id: 'c3', title: 'חריגות שבוע 33', agentId: 'a2', when: 'יום א׳', messages: []}]
    const flowPackages = [
      {id: '4821037', name: 'איחוד דוחות שבועיים', desc: 'מארז Flow לאיחוד דוחות לפי טווח.', inputSchema: [
        {id: 'date_from', title: 'תאריך התחלה', type: 'DateTime', required: true},
        {id: 'date_to', title: 'תאריך סיום', type: 'DateTime', required: true},
        {id: 'unit_code', title: 'קוד יחידה', type: 'String'}, {id: 'include_drafts', title: 'כולל טיוטות', type: 'Boolean'}],
      cubes: [{id: 'aggregate_table', title: 'טבלת איחוד מלאה'}, {id: 'summary_metrics', title: 'מדדים מסוכמים'}]},
      {id: '4821048', name: 'שליחת חבילת מסמכים', desc: 'מארז Flow לשליחת מסמכים.', inputSchema: [], cubes: []},
      {id: '4821062', name: 'מדדי מחסן', desc: 'מארז Flow לשאילתת מדדים.', inputSchema: [], cubes: []}
    ]
    return {version: 4, plugins, skills, tools, subagents, reports, evaluations, evalRuns: [], conversations, flowPackages}
  }
})

Data('wonderPlatformNormalize', {
  params: [
    {id: 'repo', as: 'object'},
    {id: 'seed', as: 'object'}
  ],
  impl: ({}, {}, {repo, seed}) => {
    const stored = repo && typeof repo == 'object' ? repo : {}, list = key => Array.isArray(stored[key]) ? stored[key] : seed[key]
    const stamp = item => ({version: 'V0', created: '08/2026', updated: 'היום', ...item})
    const skillId = id => ({s1: 'evidenceVerification', s2: 'serviceSpecification', s3: 'documentationGaps', s4: 'operationalMetrics'}[id] || id)
    return {...seed, ...stored, version: seed.version, plugins: list('plugins').map(item => stamp({...item,
      skillIds: (item.skillIds || []).map(skillId), toolIds: item.toolIds || [], subagentIds: item.subagentIds || [], evaluationId: item.evaluationId || ''})),
    skills: seed.skills, subagents: list('subagents').map(item => stamp({...item,
      skillIds: (item.skillIds || []).map(skillId), toolIds: item.toolIds || [], evaluationId: item.evaluationId || ''})), tools: list('tools').map(item => stamp({...item,
      kind: item.managed ? 'connector' : item.kind == 'flow' ? 'flow' : String(item.kind || '').startsWith('Flow') ? 'flow' : 'connector',
      packageId: item.packageId || String(item.kind || '').match(/\d+/)?.[0] || '', inputSchema: item.inputSchema || [], outputCubes: item.outputCubes || []})),
    evaluations: list('evaluations').map(item => stamp({...item, rubric: item.rubric || '', rows: item.rows || []})),
    evalRuns: list('evalRuns'), conversations: list('conversations').map(({pluginId, ...item}) => ({...item,
      agentId: item.agentId || '', messages: item.messages || []})),
    flowPackages: list('flowPackages')}
  }
})

Data('wonderPlatformUpsert', {
  params: [{id: 'repo', as: 'object'}, {id: 'resource', as: 'string'}, {id: 'item', as: 'object'}],
  impl: ({}, {}, {repo, resource, item}) => {
    const {originalId, ...saved} = {...item, updated: 'עכשיו'}, id = originalId || saved.id, items = repo[resource]
    return {saved, repo: {...repo, [resource]: items.some(value => value.id == id)
      ? items.map(value => value.id == id ? saved : value) : [...items, saved]}}
  }
})

Data('wonderPlatformTrace', {
  params: [{id: 'repo', as: 'object'}, {id: 'target', as: 'object'}],
  impl: ({}, {}, {repo, target}) => {
    const labels = {skills: 'מיומנות', tools: 'כלי', subagents: 'האצלה'}, fields = {skills: 'skillIds', tools: 'toolIds', subagents: 'subagentIds'}
    const steps = [], seen = new Set(), visit = (resource, id, parent) => {
      const item = repo[resource]?.find(value => value.id == id), key = `${resource}:${id}`
      if (!item || seen.has(key)) return
      seen.add(key); steps.push({resource, id, parent, kind: labels[resource], title: item.name})
      ;['skills', 'tools'].forEach(child => (item[fields[child]] || []).forEach(childId => visit(child, childId, id)))
    }
    ;['skills', 'tools', 'subagents'].forEach(resource => (target[fields[resource]] || []).forEach(id => visit(resource, id, target.id)))
    return steps
  }
})

Data('wonderPlatformUi', {
  impl: () => ({
    resources: {
      plugins: {title: 'פלאגינים', subtitle: 'פלאגין אורז מיומנויות וכלים ליחידה אחת.',
        create: 'פלאגין חדש',
        icon: 'PlugZap', label: 'פלאגין', relations: [['skillIds', 'skills', 'מיומנויות'], ['toolIds', 'tools', 'כלים']]},
      skills: {title: 'מיומנויות', subtitle: 'ספרייה משותפת של תהליכי ביצוע.', create: 'מיומנות חדשה', icon: 'BookOpenText',
        label: 'מיומנות', relations: [['toolIds', 'tools', 'כלים']]},
      tools: {title: 'כלים', subtitle: 'כלי Connector מנוהלים וכלי Flow ניתנים לעריכה.',
        create: 'כלי ממארז Flow', icon: 'Wrench', label: 'כלי'},
      subagents: {title: 'סאב-אייג׳נטים', subtitle: 'ספרייה משותפת של יעדי האצלה ממוקדים.', create: 'סאב-אייג׳נט חדש',
        icon: 'Network', label: 'סאב-אייג׳נט', relations: [['skillIds', 'skills', 'מיומנויות'], ['toolIds', 'tools', 'כלים']]},
      reports: {title: 'דוחות מאומתים', subtitle: 'דוחות מבוססי ראיות שניתן לצרף לתשובות.',
        create: 'דוח חדש', icon: 'BadgeCheck', label: 'דוח'}
    },
    primaryNav: [['plugins', 'PlugZap', 'פלאגינים'], ['chat', 'MessageCircle', 'צ׳אט'], ['evaluations', 'SquareCheckBig', 'אבלואציה']],
    libraryNav: [['skills', 'BookOpenText', 'מיומנויות'], ['tools', 'Wrench', 'כלים'], ['subagents', 'Network', 'סאב-אייג׳נטים'],
      ['reports', 'BadgeCheck', 'דוחות']],
    mobileNav: [['plugins', 'PlugZap', 'פלאגינים'], ['chat', 'MessageCircle', 'צ׳אט'], ['evaluations', 'SquareCheckBig', 'אבלואציה'],
      ['skills', 'BookOpenText', 'מיומנויות'], ['tools', 'Wrench', 'כלים'], ['subagents', 'Network', 'סאב-אייג׳נטים'],
      ['reports', 'BadgeCheck', 'דוחות']],
    labels: {plugins: 'פלאגין', skills: 'מיומנות', tools: 'כלי', subagents: 'סאב-אייג׳נט', evaluations: 'סט אבלואציה'},
    prefixes: {plugins: 'p', skills: 's', tools: 't', subagents: 'a', reports: 'r', evaluations: 'e'},
    classes: {
      button: 'inline-flex items-center justify-center gap-2 rounded-xl border border-[#dfe5e1] bg-white px-3.5 py-2 text-sm',
      primary: 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#2f6b4b] px-4 py-2.5 text-sm font-semibold text-white',
      field: 'mt-2 w-full rounded-xl border border-[#dfe5e1] bg-[#f8faf9] px-3 py-2.5 text-sm outline-none focus:border-[#789b86]',
      card: 'rounded-2xl border border-[#e1e7e3] bg-white p-5 shadow-[0_1px_2px_rgba(30,50,40,.04)]',
      chip: 'rounded-full border border-[#dfe5e1] bg-[#f4f6f5] px-2.5 py-1 text-[11px] text-[#59615d]'
    }
  })
})
