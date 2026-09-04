import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-kit.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformHome', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh}}) => ({repo, createAgent, startChat, createPlugin, openItem, openConversation}) => {
      const {classes, resources} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const mine = (repo.agents || []).filter(item => (item.owner || 'me') != 'global').slice(0, 4)
      const talks = (repo.conversations || []).filter(item => item.messages?.length).slice(0, 4)
      const action = (icon, title, body, onClick) => h(
        `button:${classes.panel} flex flex-1 flex-col items-start gap-2 p-6 text-start transition-colors ` +
        `hover:border-[var(--wp-border-strong)] hover:shadow-[var(--wp-sh-1)]`, {key: title, onClick},
        hh(ctx, dsls.react['react-comp'].wonderPlatformMark, {icon, size: 'lg'}),
        h(`h2:${classes.h2} mt-2`, {}, title),
        h(`p:${classes.body} text-[13px]`, {}, body))
      const row = (icon, title, subtitle, onClick) => h(
        'button:flex w-full items-center gap-3 bg-[var(--wp-surface)] px-3.5 py-2.5 text-start ' +
        'transition-colors hover:bg-[var(--wp-surface-2)]', {key: title, onClick},
        hh(ctx, dsls.react['react-comp'].wonderPlatformMark, {icon, size: 'sm'}),
        h('span:min-w-0 flex-1', {},
          h('span:block truncate text-[13px] font-medium text-[var(--wp-ink)]', {title}, title),
          h('span:block truncate text-[12px] text-[var(--wp-ink-4)]', {}, subtitle)),
        h('L:ArrowLeft', {size: 14, className: 'shrink-0 text-[var(--wp-ink-4)]'}))
      const group = (label, rows) => rows.length > 0 && h('div:min-w-0', {},
        h('div:pb-2 text-[11px] font-medium text-[var(--wp-ink-4)]', {}, label),
        h('div:grid gap-px overflow-hidden rounded-[8px] border border-[var(--wp-border)] bg-[var(--wp-border)]',
          {}, rows))
      return h(`main:${classes.page} wp-scroll`, {},
        h('div:mx-auto w-full max-w-[1180px] px-8 pb-20 pt-20', {},
          h(`h1:${classes.h1}`, {}, 'מה נעשה היום?'),
          h(`p:mt-1.5 ${classes.body}`, {}, 'בנו סוכן חדש, פתחו שיחה עם סוכן קיים, או ארזו פלאגין חדש.'),
          h('div:mt-6 flex gap-3', {},
            action('Bot', 'צור סוכן',
              'הגדירו מה הסוכן עושה ובנו לו את היכולות שהוא צריך.', createAgent),
            action(resources.plugins.icon, 'בנה פלאגין',
              'אריזה של מיומנויות, כלים וידע, כדי לתת לכל סוכן', createPlugin),
            action('MessageCircle', 'התחל שיחה', 'דברו עם סוכן קיים, או פשוט שאלו שאלה.', startChat)),
          h('div:mt-10 grid grid-cols-2 gap-6', {},
            group('הסוכנים שלי', mine.map(item => row(item.icon || resources.agents.icon, item.name,
              item.desc || '', () => openItem('agents', item)))),
            group('שיחות אחרונות', talks.map(item => row('MessageCircle', item.title,
              item.when || '', () => openConversation(item.id)))))))
    }
  })
})
