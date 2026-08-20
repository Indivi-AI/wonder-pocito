import { dsls, jb } from '@jb6/core'
import '@jb6/llm-guide'
import '@wonder/ai/llm-flow-main-workflow.js'
import '@wonder/db/db-drivers.js'
import '@wonder/db/db-drivers-s3-minio.js'

const {
  common: { Data },
  'llm-guide': { Booklet, Doclet, booklet: { booklet } },
  workflow: { Workflow, workflow: { mainWorkflow }, mpi: { mpi } }
} = dsls

Data('wonderPlatformSeed', {
  impl: () => {
    const assets = (rows, keys) => rows.map(row => Object.fromEntries(keys.map((key, i) => [key, row[i]])))
    const plugins = assets([
      ['p1', 'אנליסט הוכחת קיום', 'הק', 'V3', 'פורסם',
        'בודק טענות מול מקורות ארגוניים ומחזיר תשובה מנומקת עם ראיות.',
        ['s1', 's3'], ['t1', 't3'], ['a1'], 'e1'],
      ['p2', 'מפרט שירות', 'מש', 'V2', 'פורסם', 'מנסח מפרטי שירות עקביים מתוך מסמכי ידע, CRM ותקדימים.',
        ['s2'], ['t2', 't3'], ['a3'], 'e2'],
      ['p3', 'מבקר תפעולי', 'מת', 'V4', 'טיוטה', 'מאתר חריגות במדדים תפעוליים ומנסח תמונת מצב ניתנת לפעולה.',
        ['s4'], ['t4', 't6'], ['a2'], 'e3'],
      ['p4', 'חבילת ספק', 'חס', 'V1', 'פורסם', 'מרכז מסמכי ספק, פערים ואישורים לחבילה אחת מוכנה לבקרה.',
        ['s1', 's2'], ['t2', 't5'], [], 'e4']
    ], ['id', 'name', 'mark', 'version', 'status', 'desc', 'skillIds', 'toolIds', 'subagentIds', 'evaluationId'])
      .map(x => ({ ...x, instructions: 'בסס כל מסקנה על מקורות, ציין פערים והחזר תשובה תמציתית שניתנת לאימות.' }))
    const skills = assets([
      ['s1', 'הוכחת קיום — תהליך מלא', 'הק', 'פירוק טענה, איסוף ראיות, הצלבה וניסוח מסקנה.', ['t1', 't2', 't6']],
      ['s2', 'בניית מפרט שירות', 'מש', 'הפקת מפרט שירות מובנה ממקורות ארגוניים.', ['t2', 't3']],
      ['s3', 'איתור פערי תיעוד', 'פת', 'השוואת מסמכים ואיתור מידע חסר או סותר.', ['t2']],
      ['s4', 'חילוץ מדדים תפעוליים', 'מת', 'חילוץ, נרמול וסיכום מדדים מתוך דוחות תפעול.', ['t6', 't4']]
    ], ['id', 'name', 'mark', 'desc', 'toolIds'])
      .map(x => ({ ...x, instructions: 'פעל לפי שלבים סמנטיים, שמור את המקורות והצג רק ממצאים מבוססים.' }))
    const tools = assets([
      ['t1', 'חיפוש Jira', 'Ji', 'איתור משימות, סטטוסים וקישורים.', 'MCP · Connector', true],
      ['t2', 'חיפוש Confluence', 'Co', 'איתור דפים ומקטעי ידע ארגוני.', 'MCP · Connector', true],
      ['t3', 'CRM ארגוני', 'CR', 'קריאת חשבונות, אנשי קשר והזדמנויות.', 'MCP · Connector', true],
      ['t4', 'איחוד דוחות שבועיים', 'דש', 'איחוד דוחות לפי טווח תאריכים.', 'Flow · 4821037'],
      ['t5', 'שליחת חבילת מסמכים', 'שמ', 'אריזה ושליחת מסמכים בדוא״ל.', 'Flow · 4821048'],
      ['t6', 'מדדי מחסן', 'ממ', 'שאילתת מדדי תפעול ומלאי.', 'Flow · 4821062']
    ], ['id', 'name', 'mark', 'desc', 'kind', 'managed'])
    const subagents = assets([
      ['a1', 'מחלץ ישויות', 'מי', 'מחלץ ארגונים, אנשים, תאריכים ומזהים.', [], ['t1', 't2']],
      ['a2', 'מסכם תמיכה', 'מת', 'מסכם רצף אירועי תמיכה לפי ציר זמן.', ['s4'], []],
      ['a3', 'בודק עקביות', 'בע', 'מאתר סתירות בין מסמכים ורשומות.', ['s3'], ['t3']]
    ], ['id', 'name', 'mark', 'desc', 'skillIds', 'toolIds'])
      .map(x => ({ ...x, instructions: 'החזר רק מידע שנתמך במקורות שסופקו.' }))
    const report = (id, name, status, verifiedAt, desc, sourceCount, rows) => ({
      id, name, mark: 'דו', status, verifiedAt, desc, sourceCount, rows: assets(rows, ['subject', 'value', 'evidence'])
    })
    const reports = [
      report('r1', 'דוח ראיות — תוכנית שחר', 'מאומת', '18.08.2026 · 14:32',
        'תמונת ראיות מאומתת לדרישות הליבה של תוכנית שחר.', 8, [
          ['אישור תקציבי', 'מאושר', 'Jira FIN-184 · פרוטוקול ועדה 12/08'],
          ['מוכנות תפעולית', '92%', 'דוח מחסן שבוע 33 · 46 מתוך 50 בדיקות'],
          ['פער פתוח', 'נוהל התאוששות', 'Confluence OPS-DR · חסר אישור בעל תפקיד']
        ]),
      report('r2', 'כיסוי מפרט שירות — מוקד צפון', 'מאומת', '17.08.2026 · 09:10',
        'בדיקת כיסוי בין המפרט המחייב לבין תצורת השירות הפעילה.', 5, [
          ['חלון שירות', 'תואם', 'מפרט V6 · CRM SLA-41'],
          ['זמן תגובה', 'חריגה של 12 דק׳', 'ממוצע 42 דק׳ מול יעד 30 דק׳'],
          ['ערוץ חירום', 'פעיל', 'בדיקת קבלה 16/08 · קריאה INC-290']
        ]),
      report('r3', 'בקרת ספקים — אוגוסט', 'בטיוטה', 'טרם אומת', 'סטטוס מסמכי חובה ואישורים לספקים פעילים.', 12, [
        ['ספקים תקינים', '18 מתוך 21', 'CRM ספקים · 18/08'],
        ['חסרי ביטוח', '2', 'ספקי אורן וקשת · אישור פג תוקף'],
        ['חסר אישור מס', '1', 'ספק גליל · בקשה פתוחה']
      ])
    ]
    const evaluations = assets([
      ['e1', 'אימות טענות ומקורות', 'בדיקות דיוק, כיסוי מקורות והצגת סתירות.', 'p1', '18.08.2026 · 16:40', 'עבר',
        'האם תוכנית שחר מוכנה ליציאה?'],
      ['e2', 'איכות מפרט שירות', 'מבנה, שלמות ועמידה במקור.', 'p2', '17.08.2026 · 11:18', 'עבר', 'בנה מפרט למוקד צפון.'],
      ['e3', 'דיוק מדדים תפעוליים', 'יחידות, תקופות וחישובי חריגה.', 'p3', '16.08.2026 · 18:05', 'עבר',
        'סכם חריגות שבוע 33.'],
      ['e4', 'שלמות חבילת ספק', 'מסמכי חובה ועקביות פרטים.', 'p4', '—', 'טרם הורץ', 'בדוק את ספק גליל.']
    ], ['id', 'name', 'desc', 'pluginId', 'lastRun', 'status', 'input'])
      .map(({ input, ...x }) => ({ ...x, rows: [{ input, expected: 'תשובה מבוססת עם מקורות ובלי מידע מומצא.' }] }))
    const steps = assets([
      ['מיומנות', 'הוכחת קיום — תהליך מלא', '8.4s'], ['כלי', 'חיפוש Jira', '4.7s'],
      ['כלי', 'חיפוש Confluence', '6.2s'], ['האצלה', 'מחלץ ישויות', '5.1s'], ['כלי', 'מדדי מחסן', '7.8s'],
      ['מיומנות', 'איתור פערי תיעוד', '4.4s'], ['מודל', 'ניסוח תשובה מאומתת', '4.4s']
    ], ['kind', 'name', 'ms'])
    const conversations = [{
      id: 'c1', title: 'מוכנות תוכנית שחר', pluginId: 'p1', when: 'היום', messages: [
        { id: 'm1', role: 'user', text: 'בדוק האם תוכנית שחר מוכנה ליציאה והצג את הראיות המרכזיות.' },
        { id: 'm2', role: 'agent', reportIds: ['r1', 'r2'], traceOpen: true, status: 'הושלם', duration: '41 שנ׳', steps,
          text: 'תוכנית שחר מוכנה חלקית: האישור התקציבי קיים ו-92% מבדיקות המוכנות עברו. ' +
            'הפער היחיד שחוסם אישור מלא הוא נוהל ההתאוששות, שעדיין חסר אישור בעל תפקיד.' }
      ]
    },
    { id: 'c2', title: 'פערי מפרט מוקד צפון', pluginId: 'p2', when: 'אתמול', messages: [] },
    { id: 'c3', title: 'חריגות שבוע 33', pluginId: 'p3', when: 'יום א׳', messages: [] }]
    return { version: 1, plugins, skills, tools, subagents, reports, evaluations, conversations }
  }
})
Data('wonderPlatformUi', {
  impl: () => {
    const button = 'inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-2 cursor-pointer disabled:opacity-40'
    const neutralBadge = 'inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-600'
    const positiveBadge = 'inline-flex items-center gap-1 rounded-full border border-[#bcdcc9] bg-[#e7f4ec] px-2.5 py-1 text-xs text-[#1c7c54]'
    const field = 'flex flex-col gap-2 [&>span]:text-xs [&>span]:font-medium [&>span]:text-gray-600 [&>input]:w-full [&>input]:min-w-0 ' +
      '[&>input]:rounded-lg [&>input]:border [&>input]:border-gray-200 [&>input]:bg-gray-50 [&>input]:px-3 [&>input]:py-2 ' +
      '[&>textarea]:w-full [&>textarea]:min-w-0 [&>textarea]:rounded-lg [&>textarea]:border [&>textarea]:border-gray-200 ' +
      '[&>textarea]:bg-gray-50 [&>textarea]:px-3 [&>textarea]:py-2'
    return {
      nav: [['plugins', 'Plug', 'פלאגינים'], ['chat', 'MessageCircle', 'צ׳אט'], ['evaluations', 'ClipboardCheck', 'אבלואציה'],
        ['skills', 'FileText', 'מיומנויות'], ['tools', 'Wrench', 'כלים'], ['subagents', 'Bot', 'סאב-אייג׳נטים'],
        ['reports', 'BadgeCheck', 'דוחות מאומתים']],
      meta: {
        plugins: ['פלאגינים', 'פלאגין אורז מיומנויות, כלים וסאב-אייג׳נטים ליחידה אחת.', 'פלאגין חדש'],
        skills: ['מיומנויות', 'ספרייה משותפת של תהליכי ביצוע.', 'מיומנות חדשה'],
        tools: ['כלים', 'כלי Connector מנוהלים וכלים ממארזי Flow.', 'כלי ממארז Flow'],
        subagents: ['סאב-אייג׳נטים', 'ספרייה משותפת של אייג׳נטים מתמחים.', 'סאב-אייג׳נט חדש'],
        reports: ['דוחות מאומתים', 'דוחות מבוססי ראיות שניתן לצרף לתשובות ולהפיץ.', 'דוח מאומת חדש'],
        evaluations: ['סטי אבלואציה', 'ספרייה של תרחישי בדיקה, לשימוש חוזר מכל פלאגין.', 'סט חדש']
      },
      plural: { plugins: 'פלאגינים', skills: 'מיומנויות', tools: 'כלים', subagents: 'סאב-אייג׳נטים', reports: 'דוחות',
        evaluations: 'סטים' },
      prefixes: { plugins: 'p', skills: 's', tools: 't', subagents: 'a', reports: 'r', evaluations: 'e' },
      relations: { plugins: [['skillIds', 'skills'], ['toolIds', 'tools'], ['subagentIds', 'subagents']],
        skills: [['toolIds', 'tools']], subagents: [['skillIds', 'skills'], ['toolIds', 'tools']] },
      classes: { button, primaryButton: button + ' border-[#0e5c3f] bg-[#0e5c3f] text-white',
        softButton: button + ' border-[#c7e4d5] bg-[#e3f2ea] text-[#0a4a32]', neutralBadge, positiveBadge, field,
        assetMark: 'w-9 h-9 shrink-0 rounded-xl grid place-items-center bg-[#e3f2ea] border border-[#c7e4d5] text-[#0a4a32] font-semibold',
        search: 'relative flex-1 max-w-[380px] [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-gray-200 ' +
          '[&_input]:bg-white [&_input]:py-2 [&_input]:pr-9 [&_input]:pl-3 [&_input]:outline-none [&_svg]:absolute ' +
          '[&_svg]:right-3 [&_svg]:top-2.5 [&_svg]:text-gray-400' }
    }
  }
})
Data('wonderPlatformRoomStore', {
  params: [
    {id: 'roomWUrl', as: 'string'}
  ],
  impl: (ctx, {}, {roomWUrl}) => {
    const url = roomWUrl.replace(/\/$/, '') + '/usersRW/wonder-platform/assets'
    return {
      load: async seed => {
        const res = await jb.wonderUtils.wfetch2(url, {}, ctx)
        if (res.ok) return res.json()
        await jb.wonderUtils.wfetch2(url, { method: 'PUT', body: seed }, ctx)
        return seed
      },
      save: repo => jb.wonderUtils.wfetch2(url, { method: 'PUT', body: repo }, ctx)
    }
  }
})
Data('wonderPlatformAnswer', {
  params: [
    {id: 'text', as: 'string'},
    {id: 'plugin', as: 'object'},
    {id: 'repo', as: 'object'},
    {id: 'history', as: 'array'}
  ],
  impl: async (ctx, {}, {text, plugin, repo, history}) => {
    const started = Date.now(), workflowCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx.setVars({
      userMessage: text, selectedPlugin: JSON.stringify(plugin), accumulatedContext: { chatHistory: history },
      assetRepoText: JSON.stringify({ plugin, skills: repo.skills.filter(x => plugin.skillIds?.includes(x.id)),
        tools: repo.tools.filter(x => plugin.toolIds?.includes(x.id)), subagents: repo.subagents.filter(x => plugin.subagentIds?.includes(x.id)),
        reports: repo.reports }), llmProxyUrl: 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy'
    }))
    const result = await dsls.workflow.workflow.wonderPlatformAgent.$run().calcWorkflow(workflowCtx)
    const output = typeof result.runRes === 'string' ? { text: result.runRes } : result.runRes || {}
    return { text: output.text || result.workflowErrors?.[0]?.t || 'ההרצה הסתיימה ללא תשובה.', reportIds: output.reportIds || [],
      followUps: output.followUps || [], status: result.workflowErrors?.length ? 'נכשל' : 'הושלם',
      duration: Math.max(1, Math.round((Date.now() - started) / 1000)) + ' שנ׳',
      steps: (result.workflowTrace || []).filter(x => x.flowIndex != null).map((x, i) => ({ kind: i ? 'כלי' : 'מודל',
        name: x.setVars ? Object.keys(x.setVars)[0] : 'שלב llm-flow ' + (i + 1), ms: '—' })) }
  }
})
Booklet('wonderPlatform', {
  impl: booklet('wonderPlatformAssets,wonderPlatformResponse')
})
Doclet('wonderPlatformAssets', {
  impl: `
The ASSET_REPOSITORY in the prompt is authoritative room data.
Use only its plugins, skills, tools, subagents and reports.
Honor the selected plugin instructions and connected asset IDs.
Never claim that a connector ran when its room asset supplies no result.
A verified report may be cited only by a real report id from ASSET_REPOSITORY.
`
})
Doclet('wonderPlatformResponse', {
  impl: `
Answer in the user's language, concisely and professionally.
Lead with the conclusion, then name supporting evidence and any material gap.
Return zero to three reportIds that directly support the answer. Prefer status "מאומת" reports.
followUps contains two short, useful next questions.
`
})
Doclet('essentialOutputFormat.wonderPlatform', {
  impl: `
Return one javascript code block containing one flow.
The flow has one setCtxData element whose jqSingle exp is a literal object.
The object shape is {text: string, reportIds: string[], followUps: string[]}.
Escape quotes for one jq string and emit no other code.
Example:
\`\`\`javascript
{$: 'flow-elem<workflow>flow', elems: [
  {$: 'flow-elem<workflow>setCtxData', goal: 'Compose grounded answer', status: 'מנסח תשובה מאומתת...',
    value: {$: 'data<common>jqSingle', exp: '{text:"המסקנה המבוססת",reportIds:["r1"],followUps:["בדוק פער","הצג מקורות"]}'}}
]}
\`\`\`
`
})
Workflow('wonderPlatformAgent', {
  params: [
    {id: 'model', as: 'string', defaultValue: 'gemini/gemini-3.5-flash'}
  ],
  impl: mainWorkflow({
    main: mpi('%$model%', {
      prompt: `USER_MESSAGE: %$userMessage%
SELECTED_PLUGIN: %$selectedPlugin%
ASSET_REPOSITORY: %$assetRepoText%
Return a grounded answer and relevant verified report ids.`,
      instructions: `%$llmFlowBooklet%
%$wonderPlatform%
Use the exact structured response flow and no unavailable component.`,
      thinkingBudget: 0
    }),
    categories: ['wonderPlatform'],
    bookletsToLoad: ['wonderPlatform']
  })
})
