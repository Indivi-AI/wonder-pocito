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
    const conversations = [{id: 'c1', title: 'מוכנות תוכנית שחר', agentId: 'p1', when: 'היום', messages: [
      {id: 'm1', role: 'user', text: 'בדוק האם תוכנית שחר מוכנה ליציאה והצג את הראיות המרכזיות.'},
      {id: 'm2', role: 'agent', status: 'הושלם', duration: '41 שנ׳', steps,
        text: 'תוכנית שחר מוכנה חלקית: האישור התקציבי קיים ו-92% מבדיקות המוכנות עברו. ' +
          'הפער החוסם הוא נוהל ההתאוששות.'}
    ]}, {id: 'c2', title: 'פערי מפרט מוקד צפון', agentId: 'p2', when: 'אתמול', messages: []},
    {id: 'c3', title: 'חריגות שבוע 33', agentId: 'p3', when: 'יום א׳', messages: []}]
    const quickParam = (Name, DisplayName, Type, IsRequired, IsRequireAny) => ({Name, DisplayName, Description: null, Type,
      OntologyType: Type == 'DateTime' ? 'TIME' : 'TEXT', IsSingleValue: true, IsRequired, IsRequireAny})
    const query = (id, Name, ResultsLimit) => ({id, uniqueName: id, Name, Description: '', ResultsLimit, DataSourceName: 'reports', Fields: []})
    const flowPackages = [
      {Id: 4821037, Name: 'איחוד דוחות שבועיים', Description: 'מארז Flow לאיחוד דוחות לפי טווח.', Quick: {default: [
        quickParam('date_from', 'תאריך התחלה', 'DateTime', true, false), quickParam('date_to', 'תאריך סיום', 'DateTime', true, false),
        quickParam('unit_code', 'קוד יחידה', 'String', false, false), quickParam('include_drafts', 'כולל טיוטות', 'Boolean', false, false)]},
      Queries: [query('aggregate_table', 'טבלת איחוד מלאה', 500), query('summary_metrics', 'מדדים מסוכמים', 100)]},
      {Id: 4821048, Name: 'שליחת חבילת מסמכים', Description: 'מארז Flow לשליחת מסמכים.', Quick: {}, Queries: []},
      {Id: 4821062, Name: 'מדדי מחסן', Description: 'מארז Flow לשאילתת מדדים.', Quick: {}, Queries: []}
    ]
    const agents = rows(['id', 'name', 'mark', 'desc', 'pluginIds', 'skillIds', 'toolIds', 'knowledgeIds', 'owner'], [
      ['ag1', 'סוכן תמיכת לקוחות B2B', 'סת', 'עונה לפניות לקוחות עסקיים ומנתב תקלות מורכבות לצוות אנושי.',
        ['p2'], [], [], ['k1'], 'me'],
      ['ag2', 'סוכן ביקורת ספקים', 'סב', 'עוקב אחר בקרת ספקים ומחזיר תמונת מצב מבוססת ראיות.',
        ['p1', 'p4'], [], [], [], 'other'],
      ['ag3', 'סוכן אנליטיקת שוק', 'סש', 'מנתח נתוני שוק גלובליים וממליץ על הזדמנויות.', [], [], [], ['k2'], 'global']
    ]).map(item => ({...item, version: 'V0', created: '08/2026', updated: 'היום', evaluationId: '',
      instructions: 'ענה על בסיס המקורות המצורפים בלבד וציין כל פער מידע.',
      backendConfig: {harness: 'agno', harness_type: 'deepagents'}}))
    const knowledge = rows(['id', 'name', 'mark', 'desc', 'files', 'owner'], [
      ['k1', 'נהלי שירות לקוחות', 'נש', 'אוסף נהלי שירות, תסריטי שיחה ומדיניות החזרות עדכנית.',
        [{name: 'service-procedures.pdf', size: 482304}, {name: 'return-policy.docx', size: 108552}], 'me'],
      ['k2', 'מחקרי שוק גלובליים', 'מש', 'מחקרי שוק וסיכומי מגמות ממקורות חיצוניים.',
        [{name: 'market-trends-2026.pdf', size: 934210}, {name: 'competitor-summary.xlsx', size: 65120}], 'global'],
      ['k3', 'מסמכים אישיים', 'מא', 'טיוטות מחקר וסיכומים אישיים.', [{name: 'draft-notes.txt', size: 4210}], 'other']
    ]).map(item => ({...item, version: 'V0', created: '08/2026', updated: 'היום'}))
    return {version: 5, plugins, skills, tools, subagents, agents, knowledge, evaluations, evalRuns: [],
      conversations, flowPackages}
  }
})

Data('wonderPlatformNormalize', {
  params: [
    {id: 'repo', as: 'object'},
    {id: 'seed', as: 'object'}
  ],
  impl: ({}, {}, {repo, seed}) => {
    const stored = repo && typeof repo == 'object' ? repo : {}, list = key => Array.isArray(stored[key]) ? stored[key] : seed[key]
    const stamp = item => ({version: 'V0', created: '08/2026', updated: 'היום', owner: 'me', ...item})
    const skillId = id => ({s1: 'evidenceVerification', s2: 'serviceSpecification', s3: 'documentationGaps', s4: 'operationalMetrics'}[id] || id)
    return {...seed, ...stored, version: seed.version, plugins: list('plugins').map(item => stamp({...item,
      skillIds: (item.skillIds || []).map(skillId), toolIds: item.toolIds || [], subagentIds: item.subagentIds || [], evaluationId: item.evaluationId || ''})),
    skills: seed.skills.map(item => stamp(item)), subagents: list('subagents').map(item => stamp({...item,
      skillIds: (item.skillIds || []).map(skillId), toolIds: item.toolIds || [], evaluationId: item.evaluationId || ''})), tools: list('tools').map(item => stamp({...item,
      kind: item.managed ? 'connector' : item.kind == 'flow' ? 'flow' : String(item.kind || '').startsWith('Flow') ? 'flow' : 'connector',
      packageId: item.packageId || String(item.kind || '').match(/\d+/)?.[0] || '', inputSchema: item.inputSchema || [], outputCubes: item.outputCubes || []})),
    agents: list('agents').map(item => stamp({...item, pluginIds: item.pluginIds || [], skillIds: item.skillIds || [],
      toolIds: item.toolIds || [], knowledgeIds: item.knowledgeIds || [], evaluationId: item.evaluationId || ''})),
    knowledge: list('knowledge').map(item => stamp({...item, files: item.files || []})),
    evaluations: list('evaluations').map(item => stamp({...item, targetId: item.targetId || '', rubric: item.rubric || '', rows: item.rows || []})),
    evalRuns: list('evalRuns'), conversations: list('conversations').map(({pluginId, ...item}) => ({...item,
      agentId: item.agentId || '', pluginIds: item.pluginIds || [], skillIds: item.skillIds || [], toolIds: item.toolIds || [],
      knowledgeIds: item.knowledgeIds || [], messages: item.messages || []})),
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
        icon: 'PlugZap', label: 'פלאגין', relations: [['skillIds', 'skills', 'מיומנויות'], ['toolIds', 'tools', 'כלים'],
          ['knowledgeIds', 'knowledge', 'ידע']]},
      skills: {title: 'מיומנויות', subtitle: 'ספרייה משותפת של תהליכי ביצוע.', create: 'מיומנות חדשה', icon: 'BookOpenText',
        label: 'מיומנות', relations: [['toolIds', 'tools', 'כלים']]},
      tools: {title: 'כלים', subtitle: 'כלי Connector מנוהלים וכלי Flow ניתנים לעריכה.',
        create: 'כלי ממארז Flow', icon: 'Wrench', label: 'כלי'},
      subagents: {title: 'סאב-אייג׳נטים', subtitle: 'ספרייה משותפת של יעדי האצלה ממוקדים.', create: 'סאב-אייג׳נט חדש',
        icon: 'Network', label: 'סאב-אייג׳נט', relations: [['skillIds', 'skills', 'מיומנויות'], ['toolIds', 'tools', 'כלים']]},
      knowledge: {title: 'ידע', subtitle: 'מקורות מידע ומסמכים המשמשים ל-RAG ומשפרים דיוק סוכנים.', create: 'Knowledge חדש',
        icon: 'Database', label: 'ידע'},
      agents: {title: 'סוכנים', subtitle: 'סוכנים אישיים המרכיבים פלאגינים, מיומנויות, כלים וידע ליחידה אחת.',
        create: 'סוכן חדש', icon: 'Bot', label: 'סוכן',
        relations: [['pluginIds', 'plugins', 'פלאגינים'], ['skillIds', 'skills', 'מיומנויות'], ['toolIds', 'tools', 'כלים'],
          ['knowledgeIds', 'knowledge', 'ידע']]}
    },
    primaryNav: [['plugins', 'PlugZap', 'פלאגינים']],
    libraryNav: [['skills', 'BookOpenText', 'מיומנויות'], ['tools', 'Wrench', 'כלים'], ['knowledge', 'Database', 'ידע'],
      ['evaluations', 'SquareCheckBig', 'אבלואציה']],
    mobileNav: [['plugins', 'PlugZap', 'פלאגינים'], ['skills', 'BookOpenText', 'מיומנויות'], ['tools', 'Wrench', 'כלים'],
      ['knowledge', 'Database', 'ידע'], ['evaluations', 'SquareCheckBig', 'אבלואציה']],
    labels: {plugins: 'פלאגין', skills: 'מיומנות', tools: 'כלי', subagents: 'סאב-אייג׳נט', knowledge: 'ידע', agents: 'סוכן',
      evaluations: 'סט אבלואציה'},
    ownerTabs: [['mine', 'שלי'], ['global', 'קטלוג גלובלי']],
    classes: {
      button: 'inline-flex items-center justify-center gap-2 rounded-[10px] border border-[#e8e8ea] bg-white px-3 py-2 ' +
        'text-[13px] font-medium text-[#2e2e2e] transition-colors hover:border-[#d8d8dc] hover:bg-[#fafafa]',
      primary: 'inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#0f0f10] px-3.5 py-2 text-[13px] ' +
        'font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-30',
      field: 'mt-1.5 w-full rounded-[10px] border border-[#e8e8ea] bg-white px-3 py-2 text-[13px] text-[#0f0f10] ' +
        'outline-none transition-colors placeholder:text-[#9b9ba0] focus:border-[#0f0f10]',
      card: 'rounded-xl border border-[#e8e8ea] bg-white p-4 transition-colors',
      chip: 'rounded-md border border-[#e8e8ea] px-2 py-0.5 text-[11px] font-medium text-[#6b6b6f]'
    }
  })
})
