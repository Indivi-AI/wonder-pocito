import { dsls } from '@jb6/core'
import '@jb6/common'

const { common: { Data } } = dsls

Data('platformV0Config', {
  impl: () => ({
    resources: {
      plugins: {title: 'פלאגינים', subtitle: 'פלאגין אורז מיומנויות, כלים וסאב-אייג׳נטים ליחידה אחת.',
        createLabel: 'פלאגין חדש', icon: 'PlugZap', typeLabel: 'פלאגין'},
      skills: {title: 'מיומנויות', subtitle: 'הוראות וידע ממוקד שהסוכנים יכולים לטעון לפי הצורך.',
        createLabel: 'מיומנות חדשה', icon: 'BookOpenText'},
      tools: {title: 'כלים', subtitle: 'חיבורים ופעולות שהסוכנים יכולים להפעיל בזמן ריצה.',
        createLabel: 'כלי חדש', icon: 'Wrench'},
      reports: {title: 'דוחות מאומתים', subtitle: 'שאילתות פרמטריות עם תצוגה עשירה ומוגדרת מראש.',
        createLabel: 'דוח מאומת חדש', icon: 'BadgeCheck', verified: true},
      agents: {title: 'סאב-אייג׳נטים', subtitle: 'סוכנים ממוקדים שניתן להאציל אליהם משימות.',
        createLabel: 'סאב-אייג׳נט חדש', icon: 'Network'}
    },
    primaryNav: [['plugins', 'PlugZap', 'פלאגינים'], ['chat', 'MessageCircle', 'צ׳אט'],
      ['evaluation', 'SquareCheckBig', 'אבלואציה']],
    libraryNav: [['skills', 'BookOpenText', 'מיומנויות'], ['tools', 'Wrench', 'כלים'], ['reports', 'BadgeCheck', 'דוחות מאומתים'],
      ['agents', 'Network', 'סאב-אייג׳נטים']],
    mobileNav: [['plugins', 'PlugZap', 'פלאגינים'], ['chat', 'MessageCircle', 'צ׳אט'],
      ['skills', 'BookOpenText', 'מיומנויות'], ['tools', 'Wrench', 'כלים'], ['reports', 'BadgeCheck', 'דוחות']],
    chatHistory: ['אורלייט תעשיות — Q2', 'פערים בדוח תפעול 28/7', 'אפיון שירות החזרות',
      'תיק ספק — נובה לוגיסטיקה'],
    initialMessages: [
      {role: 'user', text: 'בדוק הוכחת קיום עבור ספק "אורלייט תעשיות" לפי מסמכי הרכש של Q2, ' +
        'וסמן פערים מול הדוח הקודם.'},
      {role: 'assistant',
        text: 'נמצאו 14 מסמכי רכש רלוונטיים, מהם 12 עם התאמה מלאה. שני פערים דורשים בדיקה ידנית.',
        reports: ['procurement-gaps', 'supplier-evidence']}
    ],
    initialEvaluations: [
      {name: 'דיוק התאמת מסמכים', score: 94, runs: 24}, {name: 'שלמות תשובה', score: 89, runs: 18},
      {name: 'שימוש נכון בכלים', score: 97, runs: 31}
    ]
  })
})
