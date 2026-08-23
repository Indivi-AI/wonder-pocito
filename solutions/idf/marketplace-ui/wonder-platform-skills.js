import { coreUtils, dsls } from '@jb6/core'
import '@jb6/llm-guide'
import '@wonder/ai/doclet-storage.js'

const {
  common: { Data, data: { publishDocletFamily, publishedDocletCatalog, wFetch } },
  'llm-guide': { Doclet }
} = dsls

Doclet('evidenceVerification', {
  title: 'הוכחת קיום — תהליך מלא', mark: 'הק', toolIds: ['t1', 't2', 't6'],
  description: 'פירוק טענה, איסוף ראיות, הצלבה וניסוח מסקנה.',
  impl: `# הוכחת קיום

1. פרק את השאלה לטענות נפרדות שניתן לאמת.
2. קשר כל טענה למקור ארגוני מזוהה ולתאריך שלו.
3. הפרד בין עובדה, מסקנה ופער פתוח.
4. אל תשלים מידע שלא קיים במקורות.
5. סיים במסקנה תמציתית וברשימת הראיות המרכזיות.`
})

Doclet('evidenceVerification.audit', {
  title: 'הוכחת קיום — ביקורת', mark: 'הק', toolIds: ['t1', 't2', 't6'],
  description: 'גרסת ביקורת המחייבת שרשרת ראיות ופערים מפורשים.',
  impl: `# הוכחת קיום לביקורת

בנה שרשרת ראיות מלאה: טענה ← מקור ← נתון ← מסקנה.
מקור יחיד אינו מספיק כאשר קיימים מקורות בלתי תלויים נוספים.
ציין סתירות, מידע מיושן, בעל תפקיד מאשר וכל חסם שנותר פתוח.`
})

Doclet('evidenceVerification.audit.he', {
  title: 'הוכחת קיום — ביקורת בעברית', mark: 'הק', toolIds: ['t1', 't2', 't6'],
  description: 'גרסת ביקורת בעברית עם ניסוח ניהולי קצר.',
  impl: `# כללי תשובה בעברית

ענה בעברית תקינה. פתח במסקנה של שורה אחת, המשך בראיות מזוהות וסיים בפער החוסם ובפעולה הבאה.
אל תתרגם מזהי מקור, מספרי קריאה או אחוזים.`
})

Doclet('serviceSpecification', {
  title: 'בניית מפרט שירות', mark: 'מש', toolIds: ['t2', 't3'],
  description: 'הפקת מפרט שירות מובנה ממקורות ארגוניים.',
  impl: `# בניית מפרט שירות

חלץ קהל יעד, שעות פעילות, ערוצים, SLA, הסלמה, חריגים ובעלי תפקידים.
לכל שדה ציין מקור. כאשר מקורות סותרים, הצג את שתי הגרסאות ואל תכריע ללא סמכות.
מידע חסר נשאר מסומן כחסר ואינו הופך להנחה.`
})

Doclet('serviceSpecification.regulated', {
  title: 'מפרט שירות — סביבה מפוקחת', mark: 'מש', toolIds: ['t2', 't3'],
  description: 'מפרט שירות עם בקרות, אישורים ועקיבות.',
  impl: `# בקרות למפרט מפוקח

הוסף לכל דרישה בעלים, תוקף, מקור מאשר ותדירות בקרה.
סמן במפורש דרישה שאין לה אסמכתה בתוקף.`
})

Doclet('documentationGaps', {
  title: 'איתור פערי תיעוד', mark: 'פת', toolIds: ['t2'],
  description: 'השוואת מסמכים ואיתור מידע חסר או סותר.',
  impl: `# איתור פערי תיעוד

השווה כותרות, גרסאות, תאריכים, בעלים ודרישות בין המקורות.
סווג כל פער כחסר, סתירה, מידע שפג תוקפו או מקור שאינו מוסמך.
דרג את הפערים לפי ההשפעה על ההחלטה המבוקשת.`
})

Doclet('operationalMetrics', {
  title: 'חילוץ מדדים תפעוליים', mark: 'מת', toolIds: ['t6', 't4'],
  description: 'חילוץ, נרמול וסיכום מדדים מתוך דוחות תפעול.',
  impl: `# מדדים תפעוליים

חלץ ערך, יחידה, תקופה, אוכלוסייה ומקור לכל מדד.
נרמל יחידות ותקופות לפני השוואה, והצג את הסף לצד הערך בפועל.
אל תחבר מדדים מגרעינים שונים ללא הסבר מפורש.`
})

Doclet('operationalMetrics.warehouse', {
  title: 'מדדים תפעוליים — מחסן', mark: 'מת', toolIds: ['t6', 't4'],
  description: 'חילוץ מדדי מלאי ומוכנות מחסן.',
  impl: `# מדדי מחסן

הפרד בין יתרה נוכחית, תנועה בתקופה וקצב צריכה.
למוכנות הצג בדיקות שעברו מתוך כלל הבדיקות, אחוז, חריגים ותאריך צילום המצב.`
})

Data('wonderPlatformSkillDefinitions', {
  params: [{id: 'roomWUrl', as: 'string', defaultValue: 'room:minio//wonder-platform'}],
  impl: ({}, {}, {roomWUrl}) => ['evidenceVerification', 'serviceSpecification', 'documentationGaps', 'operationalMetrics'].map(id => {
    const comp = coreUtils.asComp(dsls['llm-guide'].doclet[id])
    const variants = Object.keys(dsls['llm-guide'].doclet).filter(variant => variant == id || variant.startsWith(`${id}.`))
    return {id, name: comp.title, mark: comp.mark, desc: comp.description, version: '1.0.0', created: '08/2026', updated: 'פורסם',
      toolIds: comp.toolIds || [], docletUrl: `${roomWUrl}/doclets/${id}`, variants,
      categories: [...new Set(variants.flatMap(variant => variant.split('.').slice(1)))]}
  })
})

Data('wonderPlatformSeedSkills', {
  params: [
    {id: 'roomWUrl', as: 'string', mandatory: true},
    {id: 'names', as: 'array', defaultValue: []},
    {id: 'publish', dynamic: true,
      defaultValue: publishDocletFamily('%$roomWUrl%', '%$name%', '1.0.0', 'wonder-platform-skills-v1')}
  ],
  impl: (ctx, {}, {roomWUrl, names, publish}) => Promise.all(dsls.common.data.wonderPlatformSkillDefinitions.$runWithCtx(ctx, {roomWUrl})
    .filter(({id}) => !names.length || names.includes(id)).map(({id: name}) => publish(ctx.setVars({roomWUrl, name}))))
})

Data('wonderPlatformListSkills', {
  params: [
    {id: 'roomWUrl', as: 'string', mandatory: true},
    {id: 'seed', dynamic: true, defaultValue: dsls.common.data.wonderPlatformSeedSkills('%$roomWUrl%', '%$names%')},
    {id: 'catalog', dynamic: true, defaultValue: publishedDocletCatalog('%$roomWUrl%')}
  ],
  impl: async (ctx, {}, {roomWUrl, seed, catalog}) => {
    let skills = await catalog(ctx.setVars({roomWUrl})), names = dsls.common.data.wonderPlatformSkillDefinitions.$runWithCtx(ctx, {roomWUrl})
      .map(({id}) => id).filter(id => !skills.some(skill => skill.id == id))
    if (names.length) await seed(ctx.setVars({roomWUrl, names})), skills = await catalog(ctx.setVars({roomWUrl}))
    return skills
  }
})

Data('wonderPlatformLoadSkill', {
  params: [
    {id: 'docletWUrl', as: 'string', mandatory: true},
    {id: 'load', dynamic: true, defaultValue: wFetch('%$docletWUrl%')}
  ],
  impl: (ctx, {}, {docletWUrl, load}) => load(ctx.setVars({docletWUrl}))
})

Data('wonderPlatformLoadTargetSkills', {
  params: [
    {id: 'roomWUrl', as: 'string', mandatory: true},
    {id: 'target', as: 'object', mandatory: true},
    {id: 'load', dynamic: true, defaultValue: dsls.common.data.wonderPlatformLoadSkill('%$docletWUrl%')}
  ],
  impl: (ctx, {}, {roomWUrl, target, load}) => {
    const skillCtx = ctx.setVars({roomWUrl, categories: Object.fromEntries((target.categories || []).map(category => [category, true]))})
    return Promise.all((target.skillIds || []).map(id => load(skillCtx.setVars({docletWUrl: `${roomWUrl}/doclets/${id}`}))))
  }
})

Data('wonderPlatformPublishSkill', {
  params: [
    {id: 'roomWUrl', as: 'string', mandatory: true},
    {id: 'skill', as: 'object', mandatory: true},
    {id: 'publish', dynamic: true,
      defaultValue: publishDocletFamily('%$roomWUrl%', '%$name%', '%$version%', 'wonder-platform-editor')}
  ],
  impl: (ctx, {}, {roomWUrl, skill, publish}) => {
    Doclet(skill.id, {title: skill.name, mark: skill.mark, toolIds: skill.toolIds || [], description: skill.desc, impl: skill.content})
    return publish(ctx.setVars({roomWUrl, name: skill.id, version: skill.publishVersion || skill.version}))
  }
})

Data('wonderPlatformNextVersion', {
  params: [{id: 'version', as: 'string'}],
  impl: ({}, {}, {version}) => {
    const [major = 1, minor = 0, patch = 0] = String(version || '1.0.0').split('.').map(Number)
    return `${major}.${minor}.${patch + 1}`
  }
})
