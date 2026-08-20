import { dsls } from '@jb6/core'
import '@jb6/react'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformSidebar', {
  impl: comp({
    hFunc: (ctx, { react: { h } }) => ({ screen, setScreen, setQuery, ui }) => h('aside', { className: (
      'w-[206px] shrink-0 sticky top-0 h-screen p-2.5 bg-white border-l border-gray-200 z-10 max-md:fixed max-md:bottom-0 max-md:top-auto ' +
      'max-md:w-full max-md:h-16 max-md:p-2 max-md:border-l-0 max-md:border-t'
    ) }, h('div', { className: 'flex items-center gap-2 px-2 pt-1 pb-5 font-bold text-[15px] max-md:hidden' }, h('span', {
      className: 'w-7 h-7 rounded-lg grid place-items-center bg-[#e3f2ea] border border-[#c7e4d5] text-[#0a4a32]'
    }, h('L:Plug', { size: 16 })), 'פלאגין סטודיו'),
    h('nav', { className: 'flex flex-col gap-1 max-md:grid max-md:grid-cols-7' }, ui.nav.map((item, i) => h('div', { key: item[0] },
      i === 3 && h('div', { className: 'px-2.5 pt-4 pb-1 text-[#9ea3a9] text-[10px] font-bold tracking-wide max-md:hidden' }, 'ספרייה'),
      h('button', { className: 'flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-right max-md:justify-center max-md:text-[0] ' +
        (screen === item[0] ? 'bg-[#e3f2ea] text-[#0a4a32] font-semibold' : 'text-[#6d7278] hover:bg-gray-100'),
        onClick: () => { setScreen(item[0]); setQuery('') } }, h('L:' + item[1], { size: 17 }), h('span', {}, item[2]))))))
  })
})
ReactComp('wonderPlatformCatalog', {
  impl: comp({
    hFunc: (ctx, { react: { h } }) => ({ repo, screen, query, setQuery, fileRef, importAssets, openEditor, ui }) => {
      const items = repo[screen].filter(x => !query || (x.name + x.desc).includes(query))
      return h('div', {}, h('header', { className: 'flex justify-between gap-5 px-8 pt-7 max-md:px-4 max-md:flex-col' },
        h('div', {}, h('h1', {}, ui.meta[screen][0]), h('p', { className: 'mt-1.5 text-[#6d7278] text-[13px]' }, ui.meta[screen][1])),
        h('div', { className: 'flex items-center gap-2.5' }, ['skills', 'reports'].includes(screen) && h('button', {
          className: ui.classes.button, onClick: () => fileRef.current.click()
        }, h('L:Upload', { size: 15 }), 'ייבוא'),
        h('input', { ref: fileRef, hidden: true, type: 'file', accept: '.json,application/json', onChange: importAssets }),
        h('button', { className: ui.classes.primaryButton, onClick: () => openEditor(screen) },
          h('L:Plus', { size: 15 }), ui.meta[screen][2]))),
      h('div', { className: 'flex items-center gap-2.5 px-8 pt-5 pb-2 max-md:px-4' }, h('label', { className: ui.classes.search },
        h('L:Search', { size: 15 }), h('input', { value: query, onChange: e => setQuery(e.target.value), placeholder: 'חיפוש לפי שם או תיאור…' })),
      h('span', { className: 'text-xs text-gray-400' }, items.length + ' פריטים')),
      h('div', { className: 'grid grid-cols-[repeat(auto-fill,minmax(316px,1fr))] gap-4 px-8 pt-3.5 pb-10 max-md:grid-cols-1 max-md:px-4' },
        items.map(item => h('article', { className: (
          'min-h-[182px] flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 cursor-pointer shadow-sm hover:border-[#c7e4d5] ' +
          'hover:-translate-y-px [&_p]:m-0 [&_p]:text-[13px] [&_p]:leading-6 [&_p]:text-[#6d7278]'
        ), key: item.id, onClick: () => openEditor(screen, item) },
        h('div', { className: 'flex items-center gap-3' }, h('span', { className: ui.classes.assetMark }, item.mark),
          h('div', {}, h('div', { className: 'text-[15px] font-semibold' }, item.name),
            h('span', { className: ['מאומת', 'פורסם'].includes(item.status) ? ui.classes.positiveBadge : ui.classes.neutralBadge },
              item.status || item.kind))),
        h('p', {}, item.desc), h('div', { className: 'mt-auto flex flex-wrap items-center gap-2 text-xs text-gray-400' },
          item.managed && h('span', { className: ui.classes.neutralBadge }, 'מנוהל'),
          screen === 'reports' && h('span', {}, item.sourceCount + ' מקורות'),
          screen === 'plugins' && h('span', {}, (item.skillIds?.length || 0) + ' מיומנויות · ' + (item.toolIds?.length || 0) + ' כלים'),
          screen === 'skills' && h('span', {}, (item.toolIds?.length || 0) + ' כלים')))))
      )
    }
  })
})
ReactComp('wonderPlatformEditor', {
  impl: comp({
    hFunc: (ctx, { react: { h } }) => ({ repo, assetType, draftAsset, setDraftAsset, setScreen, saveDraft, deleteDraft, ui }) => h('div', {
      className: 'max-w-[1040px] mx-auto px-8 py-6 pb-12 max-md:px-4'
    }, h('button', { className: ui.classes.button, onClick: () => setScreen(assetType) }, h('L:ArrowRight', { size: 15 }),
      'חזרה ל' + ui.plural[assetType]),
    h('div', { className: 'flex justify-between items-end gap-5 my-6 max-md:flex-col max-md:items-start' },
      h('div', {}, h('h1', {}, draftAsset.name || ui.meta[assetType][2]), h('p', { className: 'mt-1.5 text-[#6d7278] text-[13px]' }, 'נשמר בחדר')),
      h('div', { className: 'flex items-center gap-2.5' }, draftAsset.id && h('button', {
        className: ui.classes.button + ' hover:bg-red-50 hover:text-red-700', onClick: deleteDraft
      }, h('L:Trash2', { size: 14 }), 'מחיקה'), h('button', { className: ui.classes.primaryButton, onClick: saveDraft }, 'שמירה'))),
    h('section', { className: 'rounded-2xl border border-gray-200 bg-white p-5 mb-4 grid grid-cols-2 gap-4 max-md:grid-cols-1' },
      h('label', { className: ui.classes.field }, h('span', {}, 'שם'),
        h('input', { value: draftAsset.name, onChange: e => setDraftAsset({ ...draftAsset, name: e.target.value }) })),
      h('label', { className: ui.classes.field }, h('span', {}, 'תיאור'),
        h('input', { value: draftAsset.desc, onChange: e => setDraftAsset({ ...draftAsset, desc: e.target.value }) })),
      !['reports', 'evaluations'].includes(assetType) && h('label', { className: (
        'col-span-full flex flex-col gap-2 [&>span]:text-xs [&>span]:font-medium [&>span]:text-gray-600 [&>textarea]:w-full ' +
        '[&>textarea]:rounded-lg [&>textarea]:border [&>textarea]:border-gray-200 [&>textarea]:bg-gray-50 [&>textarea]:px-3 ' +
        '[&>textarea]:py-2 max-md:col-span-1'
      ) }, h('span', {}, 'הנחיות'), h('textarea', { rows: 7, value: draftAsset.instructions || '',
        onChange: e => setDraftAsset({ ...draftAsset, instructions: e.target.value }) }))),
    (ui.relations[assetType] || []).map(([key, type]) => h('section', {
      className: 'rounded-2xl border border-gray-200 bg-white p-5 mb-4', key
    }, h('div', { className: 'text-[15px] font-semibold' }, ui.plural[type]),
    h('p', { className: 'mt-1.5 text-[#6d7278] text-[13px]' }, 'צירוף מהקטלוג המשותף'),
    h('div', { className: 'flex flex-wrap gap-2' }, repo[type].map(item => {
      const selected = (draftAsset[key] || []).includes(item.id)
      return h('button', { className: 'flex items-center gap-2 rounded-full border px-3 py-2 ' +
        (selected ? 'border-[#c7e4d5] bg-[#e3f2ea]' : 'border-gray-200 bg-gray-50'), key: item.id,
        onClick: () => setDraftAsset({ ...draftAsset,
          [key]: selected ? draftAsset[key].filter(x => x !== item.id) : [...(draftAsset[key] || []), item.id] }) },
      h('span', { className: 'w-1.5 h-1.5 rounded-full bg-current' }), item.name)
    })))),
    assetType === 'reports' && h('section', { className: 'rounded-2xl border border-gray-200 bg-white p-5 mb-4' },
      h('label', { className: ui.classes.field }, h('span', {}, 'שורות הדוח · נושא | ממצא | ראיה'), h('textarea', { rows: 9,
        value: (draftAsset.rows || []).map(x => [x.subject, x.value, x.evidence].join(' | ')).join('\n'),
        onChange: e => setDraftAsset({ ...draftAsset, rows: e.target.value.split('\n').filter(Boolean).map(line => {
          const [subject, value, evidence] = line.split('|').map(x => x.trim())
          return { subject, value, evidence }
        }) }) }))),
    assetType === 'evaluations' && h('section', {
      className: 'rounded-2xl border border-gray-200 bg-white p-5 mb-4 grid grid-cols-2 gap-4 max-md:grid-cols-1'
    }, h('label', { className: ui.classes.field }, h('span', {}, 'פלאגין'), h('select', { value: draftAsset.pluginId,
      onChange: e => setDraftAsset({ ...draftAsset, pluginId: e.target.value }) }, repo.plugins.map(x => h('option', { value: x.id, key: x.id }, x.name)))),
    h('label', { className: (
      'col-span-full flex flex-col gap-2 [&>span]:text-xs [&>span]:font-medium [&>span]:text-gray-600 [&>textarea]:w-full ' +
      '[&>textarea]:rounded-lg [&>textarea]:border [&>textarea]:border-gray-200 [&>textarea]:bg-gray-50 [&>textarea]:px-3 ' +
      '[&>textarea]:py-2 max-md:col-span-1'
    ) }, h('span', {}, 'תרחישים · קלט | תוצאה צפויה'), h('textarea', { rows: 9,
      value: (draftAsset.rows || []).map(x => [x.input, x.expected].join(' | ')).join('\n'),
      onChange: e => setDraftAsset({ ...draftAsset, rows: e.target.value.split('\n').filter(Boolean).map(line => {
        const [input, expected] = line.split('|').map(x => x.trim())
        return { input, expected }
      }) }) }))))
  })
})
ReactComp('wonderPlatformReport', {
  impl: comp({
    hFunc: (ctx, { react: { h } }) => ({ report, ui }) => h('div', {
      className: 'overflow-hidden rounded-2xl border border-[#c7e4d5] bg-white', 'data-report-id': report.id
    }, h('div', { className: 'flex items-center gap-2.5 px-4 py-3 bg-[#e3f2ea] border-b border-[#c7e4d5]' },
      h('L:BadgeCheck', { size: 17 }), h('div', { className: 'flex-1' }, h('div', { className: 'font-semibold' }, report.name),
        h('div', { className: 'text-xs text-gray-400' }, report.verifiedAt + ' · ' + report.sourceCount + ' מקורות')),
      h('span', { className: ui.classes.positiveBadge }, h('L:Check', { size: 12 }), report.status)),
    h('table', { className: (
      'w-full border-collapse text-xs [&_th]:bg-gray-50 [&_th]:text-gray-400 [&_th]:font-medium [&_th]:text-right [&_th]:px-3 ' +
      '[&_th]:py-2 [&_td]:text-right [&_td]:px-3 [&_td]:py-2 [&_td]:border-b [&_td]:border-gray-100'
    ) }, h('thead', {}, h('tr', {}, h('th', {}, 'נושא'), h('th', {}, 'ממצא'), h('th', {}, 'ראיה'))),
    h('tbody', {}, (report.rows || []).map((row, i) => h('tr', { key: i }, h('td', {}, row.subject), h('td', {}, row.value),
      h('td', {}, row.evidence))))))
  })
})
ReactComp('wonderPlatformTrace', {
  impl: comp({
    hFunc: (ctx, { react: { h } }) => ({ item, toggleTrace, ui }) => h('div', {
      className: 'overflow-hidden rounded-2xl border border-gray-200 bg-white'
    }, h('div', { className: 'flex items-center gap-2.5 px-4 py-3 bg-gray-50 cursor-pointer', onClick: () => toggleTrace(item.id) },
      h('L:ChevronDown', { size: 14 }), h('strong', {}, 'מעקב הרצה'),
      h('span', { className: 'text-xs text-gray-400' }, (item.steps?.length || 0) + ' שלבים · ' + item.duration),
      h('span', { className: (item.status === 'הושלם' ? ui.classes.positiveBadge : ui.classes.neutralBadge) + ' ms-auto' }, item.status)),
    item.traceOpen && h('div', { className: 'py-2' }, (item.steps || []).map((step, i) => h('div', {
      className: 'flex items-center gap-2 px-4 py-2', key: i
    }, h('span', { className: ui.classes.neutralBadge }, step.kind), h('span', {}, step.name),
    h('span', { className: 'ms-auto text-[11px] font-mono text-gray-400' }, step.ms)))))
  })
})
ReactComp('wonderPlatformChat', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh } }) => props => {
      const { repo, activeConversation, activePlugin, busy, chatEndRef, message, setMessage, send, updateConversation, newConversation,
        setConversationId, toggleTrace, ui } = props
      return h('div', { className: 'h-screen flex min-h-0 max-md:h-[calc(100vh-4rem)]' },
        h('section', { className: 'flex-1 min-w-0 flex flex-col' },
          h('header', { className: 'flex items-center justify-between gap-4 px-8 py-4 bg-white border-b border-gray-200 max-md:px-4' },
            h('div', { className: 'flex items-center gap-3' }, h('span', { className: ui.classes.assetMark }, activePlugin?.mark || '—'),
              h('strong', {}, activePlugin?.name || 'בחר פלאגין')),
            h('span', { className: 'flex items-center gap-1.5 text-[#0a4a32] text-xs' }, 'ה-trace המלא ב-Opik',
              h('L:ExternalLink', { size: 14 }))),
          h('div', { className: 'flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-5 px-8 py-6 max-md:px-4' },
            activeConversation?.messages.length > 0 && h('div', { className: 'border-b border-gray-200 pb-2 text-center text-xs text-gray-400' },
              'שיחה מתמשכת · ' + activePlugin?.name + ' · ההקשר נשמר בין הפניות'),
            (activeConversation?.messages || []).map(item => item.role === 'user' ? h('div', { className: (
              'self-start max-w-[72%] rounded-2xl rounded-bl bg-[#e3f2ea] border border-[#c7e4d5] px-4 py-3 text-[13px] ' +
              'whitespace-pre-wrap max-md:max-w-[92%]'
            ), key: item.id, 'data-message-role': 'user' }, item.text) : h('div', { className: 'flex flex-col gap-3', key: item.id },
              hh(ctx, dsls.react['react-comp'].wonderPlatformTrace, { item, toggleTrace, ui }),
              h('div', { className: 'rounded-2xl rounded-br border border-gray-200 bg-white px-5 py-4 text-[13px] leading-7 ' +
                'whitespace-pre-wrap shadow-sm', 'data-message-role': 'agent' }, item.text),
              (item.reportIds || []).map(id => {
                const report = repo.reports.find(x => x.id === id)
                return report && hh(ctx, dsls.react['react-comp'].wonderPlatformReport, { report, ui, key: id })
              }),
              item.followUps?.length && h('div', { className: 'flex flex-wrap gap-2' }, item.followUps.map((text, i) => h('button', {
                className: ui.classes.softButton, key: i, onClick: () => setMessage(text)
              }, text))))),
            busy && h('div', { className: 'overflow-hidden rounded-2xl border border-gray-200 bg-white' },
              h('div', { className: 'flex items-center gap-2.5 px-4 py-3 bg-gray-50 cursor-pointer' },
                h('span', { className: 'w-5 h-5 rounded-full border-2 border-[#c7e4d5] border-t-[#0e5c3f] animate-spin' }),
                h('strong', {}, 'llm-flow מריץ את הפלאגין…'))), h('div', { ref: chatEndRef })),
          hh(ctx, dsls.react['react-comp'].wonderPlatformComposer, {
            message, setMessage, send, busy, activeConversation, plugins: repo.plugins, updateConversation
          })),
        h('aside', { className: 'w-[262px] shrink-0 overflow-y-auto border-r border-gray-200 bg-white p-3.5 max-md:hidden' },
          h('button', { className: ui.classes.softButton, onClick: newConversation }, h('L:Plus', { size: 15 }), 'שיחה חדשה'),
          h('div', { className: 'px-2 py-2 text-xs text-gray-400' }, 'היסטוריית שיחות'),
          repo.conversations.map(conversation => h('button', { className: (
            'w-full flex flex-col gap-1 rounded-xl border p-2.5 text-right [&_small]:text-gray-400 ' +
            (conversation.id === activeConversation?.id ? 'border-[#c7e4d5] bg-[#e3f2ea]' : 'border-transparent hover:bg-gray-50')
          ), key: conversation.id, onClick: () => setConversationId(conversation.id) }, h('strong', {}, conversation.title), h('small', {},
            repo.plugins.find(x => x.id === conversation.pluginId)?.name + ' · ' + conversation.when))))
      )
    }
  })
})
ReactComp('wonderPlatformComposer', {
  impl: comp({
    hFunc: (ctx, { react: { h, useEffect, useRef } }) => ({ message, setMessage, send, busy, activeConversation, plugins,
      updateConversation }) => {
      const ref = useRef(), submit = () => message.trim() && !busy && send()
      useEffect(() => {
        const textarea = ref.current
        if (textarea) textarea.style.height = 'auto', textarea.style.height = Math.min(textarea.scrollHeight, 144) + 'px'
      }, [message])
      return h('div:rounded-2xl border border-gray-200 bg-gray-50 p-2.5', {},
        h('select:self-start max-w-full rounded-full border border-[#c7e4d5] bg-[#e3f2ea] px-2.5 py-1 text-xs text-[#0a4a32]', {
          value: activeConversation?.pluginId || '', disabled: activeConversation?.messages.length > 0,
          onChange: e => updateConversation({ ...activeConversation, pluginId: e.target.value })
        }, plugins.map(x => h('option', { value: x.id, key: x.id }, x.name))),
        h('div:flex items-end gap-2', {}, h('textarea:flex-1 min-w-0 resize-none bg-transparent px-1 py-2 outline-none leading-6', {
          ref, rows: 1, value: message, 'data-testid': 'chat-input', placeholder: 'כתוב הודעה לפלאגין…',
          onInput: e => setMessage(e.target.value),
          onKeyDown: e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), submit())
        }), h('button:w-9 h-9 shrink-0 rounded-full bg-[#0e5c3f] text-white grid place-items-center disabled:opacity-40', {
          disabled: !message.trim() || busy, onClick: submit, 'aria-label': 'שליחה'
        }, h('L:Send', { size: 16 }))))
    }
  })
})
ReactComp('wonderPlatformEvaluations', {
  impl: comp({
    hFunc: (ctx, { react: { h } }) => ({ repo, query, setQuery, openEditor, runningEvaluationId, runEvaluation, ui }) => h('div', {},
      h('header', { className: 'flex justify-between gap-5 px-8 pt-7 max-md:px-4 max-md:flex-col' }, h('div', {},
        h('h1', {}, ui.meta.evaluations[0]), h('p', { className: 'mt-1.5 text-[#6d7278] text-[13px]' }, ui.meta.evaluations[1])),
      h('button', { className: ui.classes.primaryButton, onClick: () => openEditor('evaluations') },
        h('L:Plus', { size: 15 }), ui.meta.evaluations[2])),
    h('div', { className: 'flex items-center gap-2.5 px-8 pt-5 pb-2 max-md:px-4' }, h('label', { className: ui.classes.search },
      h('L:Search', { size: 15 }), h('input', { value: query, onChange: e => setQuery(e.target.value), placeholder: 'חיפוש לפי כותרת…' }))),
    h('div', { className: 'px-8 py-4 pb-11 max-md:px-3' }, h('div', { className: 'overflow-hidden rounded-2xl border border-gray-200 bg-white' },
      h('div', { className: (
        'grid grid-cols-[minmax(180px,1.5fr)_80px_145px_minmax(120px,1fr)_92px_100px] gap-2.5 items-center px-4 py-3 ' +
        'bg-gray-50 text-xs text-gray-400'
      ) }, h('span', {}, 'שם הסט'), h('span', {}, 'רשומות'), h('span', {}, 'הרצה אחרונה'), h('span', {}, 'פלאגין'),
      h('span', {}, 'סטטוס'), h('span')),
      repo.evaluations.filter(x => !query || x.name.includes(query)).map(item => h('div', { className: (
        'grid grid-cols-[minmax(180px,1.5fr)_80px_145px_minmax(120px,1fr)_92px_100px] gap-2.5 items-center px-4 py-3 ' +
        'border-b border-gray-200'
      ), key: item.id }, h('div', { onClick: () => openEditor('evaluations', item) }, h('strong', {}, item.name), h('small', {}, item.desc)),
      h('span', {}, item.rows.length), h('span', {}, item.lastRun), h('span', {}, repo.plugins.find(x => x.id === item.pluginId)?.name),
      h('span', { className: ['עבר', 'הושלם'].includes(item.status) ? ui.classes.positiveBadge : ui.classes.neutralBadge }, item.status),
      h('button', { className: ui.classes.button, disabled: runningEvaluationId === item.id, onClick: () => void runEvaluation(item) },
        runningEvaluationId === item.id ? h('span', {
          className: 'w-3 h-3 rounded-full border-2 border-[#c7e4d5] border-t-[#0e5c3f] animate-spin'
        }) : 'הרצה'))))))
  })
})
