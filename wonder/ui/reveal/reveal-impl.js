import { jb, dsls, coreUtils } from '@jb6/core'
import '@jb6/react/reveal.js'
import './reveal-dsl.js'

const {
  tgp: { 'ctx-enricher': { loadReveal } },
  common: { Data },
  react: { ReactComp, 'react-comp': { comp } }
} = dsls

function textToVdom(ctx, text, strongTag = 'strong') {
  return String(text ?? '').split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith('**')
    ? ctx.vars.react.h(strongTag, { key: i }, part.slice(2, -2)) : part)
}

function titleToHashId(title) {
  return String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

Object.assign(jb.revealUtils ||= {}, { resolveSlideView, textToVdom, titleToHashId })

const ThemeLogo = ReactComp('themeLogo.reveal', {
  impl: comp({
    hFunc: (ctx, { react: { h } }) => ({ theme }) => theme.logo && h(
      'div:flex items-center gap-[13px] whitespace-nowrap pb-2 text-[var(--text)] [font-family:var(--font-body)]', {},
      theme.logo.src && h('img:h-9 w-auto', { src: theme.logo.src, alt: theme.logo.wordmark || '' }),
      theme.logo.mark && h(
        'i:grid size-9 place-items-center rounded-[11px] bg-[var(--accent)] text-[21px] font-extrabold not-italic text-[var(--on-accent)]', {},
        ...textToVdom(ctx, theme.logo.mark)
      ),
      theme.logo.mark && theme.logo.wordmark && h('i:h-[26px] w-[1.5px] bg-[var(--border)]'),
      theme.logo.wordmark && h('span:text-2xl font-extrabold', {}, ...textToVdom(ctx, theme.logo.wordmark))
    )
  })
})

const SlideHeader = ReactComp('slideHeader.reveal', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh } }) => ({ eyebrow, title, theme, tgpPath, visitVdom }) => {
      const editable = (vdom, paramId) => visitVdom({ vdom, revealType: 'editable-text<reveal>', tgpPath: `${tgpPath}~${paramId}` })
      return h('header:mb-[var(--section-gap)]', {},
        eyebrow && editable(h(
          'div:mb-[10px] text-[var(--accent)] [font-family:var(--label-font)] [font-size:var(--label-size)] '
            + '[font-weight:var(--label-weight)] [line-height:var(--label-leading)] [letter-spacing:var(--label-tracking)]', {},
          ...textToVdom(ctx, eyebrow)
        ), 'eyebrow'),
        h('div:flex items-end justify-between gap-10', {},
          editable(h(
            'h2:!m-0 !max-w-[1500px] !text-[var(--text)] !normal-case ![font-family:var(--font-body)] '
              + '![font-size:var(--title-size)] ![font-weight:var(--title-weight)] ![line-height:var(--title-leading)] '
              + '![letter-spacing:var(--title-tracking)]', {}, ...textToVdom(ctx, title)
          ), 'title'),
          hh(ctx, ThemeLogo, { theme })))
    }
  })
})

ReactComp('coverSlide.reveal', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh } }) => ({ slide, theme, tgpPath, visitVdom }) => {
      const editable = (vdom, paramId) => visitVdom({ vdom, revealType: 'editable-text<reveal>', tgpPath: `${tgpPath}~${paramId}` })
      return h(
        'div:flex h-full flex-col bg-[var(--canvas)] pt-[var(--slide-top)] pr-[var(--slide-right)] pb-[var(--slide-bottom)] '
          + 'pl-[var(--slide-left)] text-left', {},
        hh(ctx, ThemeLogo, { theme }),
        h('div:flex flex-1 flex-col justify-center gap-[30px]', {},
          slide.eyebrow && editable(h(
            'div:text-[var(--accent)] [font-family:var(--font-code)] [font-size:var(--hero-label-size)] '
              + '[font-weight:var(--hero-label-weight)] [line-height:var(--hero-label-leading)] '
              + '[letter-spacing:var(--hero-label-tracking)]', {}, ...textToVdom(ctx, slide.eyebrow)
          ), 'eyebrow'),
          editable(h(
            'h1:!m-0 !max-w-[1400px] !text-[var(--text)] !normal-case ![font-family:var(--font-body)] '
              + '![font-size:var(--hero-title-size)] ![font-weight:var(--hero-title-weight)] '
              + '![line-height:var(--hero-title-leading)] ![letter-spacing:var(--hero-title-tracking)]', {},
            ...textToVdom(ctx, slide.title)
          ), 'title'),
          slide.subtitle && editable(h(
            'p:!m-0 !max-w-[1150px] !text-[var(--secondary-text)] ![font-family:var(--font-body)] '
              + '![font-size:var(--lead-size)] ![font-weight:var(--lead-weight)] ![line-height:var(--lead-leading)]', {},
            ...textToVdom(ctx, slide.subtitle)
          ), 'subtitle')),
        slide.foot && editable(h(
          'footer:flex items-center gap-3 text-[var(--muted-text)] [font-family:var(--font-code)] '
            + '[font-size:var(--caption-size)] [font-weight:var(--caption-weight)] [line-height:var(--caption-leading)]', {},
          h('i:size-[15px] rounded-full bg-[var(--accent)]'), ...textToVdom(ctx, slide.foot)), 'foot'))
    }
  })
})

ReactComp('teamSlide.reveal', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh } }) => ({ slide, theme, tgpPath, visitVdom }) => {
      const editable = (vdom, paramId) => visitVdom({ vdom, revealType: 'editable-text<reveal>', tgpPath: `${tgpPath}~${paramId}` })
      return h('div:flex h-full flex-col bg-[var(--canvas)] pt-[var(--slide-top)] pr-[var(--slide-right)] pb-[var(--slide-bottom)] '
        + 'pl-[var(--slide-left)] text-left', {},
        hh(ctx, SlideHeader, { eyebrow: slide.eyebrow, title: slide.title, theme, tgpPath, visitVdom }),
        h('div:grid min-h-0 flex-1 auto-cols-fr grid-flow-col gap-9', {}, ...(slide.people || []).map((person, i) => h(
          'article:flex flex-col overflow-hidden rounded-3xl border border-[var(--surface-border)] bg-[var(--panel)] '
            + 'shadow-[0_22px_60px_#17171712]', { key: i },
          person.image
            ? h('img:h-[470px] w-full border-b-4 border-[var(--accent)] object-cover', {
              src: `${slide.imageRoot || ''}${person.image}`, alt: person.name
            })
            : h('div:grid h-[260px] place-items-center border-b-4 border-[var(--accent)] bg-[var(--accent-soft)] text-7xl font-extrabold', {},
              person.name.split(/\s+/).map(part => part[0]).join('')),
          h('div:flex flex-1 flex-col gap-[14px] px-9 py-[34px]', {},
            editable(h(
              'h3:!m-0 !text-[37px] !font-semibold !leading-[1.2] !tracking-[-.02em] !text-[var(--text)] !normal-case '
                + '![font-family:var(--font-body)]', {}, ...textToVdom(ctx, person.name)
            ), `people~${i}~name`),
            person.role && editable(h(
              'p:!m-0 !text-[22px] !leading-[1.5] !text-[var(--secondary-text)] ![font-family:var(--font-body)]', {},
              ...textToVdom(ctx, person.role)
            ), `people~${i}~role`),
            person.tags?.length && h('div:mt-auto flex flex-wrap gap-2', {}, ...person.tags.map((tag, j) => editable(
              h('span:rounded-full bg-[var(--accent-soft)] px-4 py-2 text-base font-bold text-[var(--accent-text)]', { key: j },
                ...textToVdom(ctx, tag)),
              `people~${i}~tags~${j}`))))))),
        slide.foot && editable(h(
          'div:mt-[30px] border-t border-[var(--surface-border)] pt-[22px] text-center text-2xl text-[var(--secondary-text)]', {},
          ...textToVdom(ctx, slide.foot)
        ), 'foot'))
    }
  })
})

ReactComp('cardGridSlide.reveal', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh } }) => ({ slide, theme, tgpPath, visitVdom }) => {
      const editable = (vdom, paramId) => visitVdom({ vdom, revealType: 'editable-text<reveal>', tgpPath: `${tgpPath}~${paramId}` })
      return h('div:flex h-full flex-col bg-[var(--canvas)] pt-[var(--slide-top)] pr-[var(--slide-right)] pb-[var(--slide-bottom)] '
        + 'pl-[var(--slide-left)] text-left', {},
        hh(ctx, SlideHeader, { eyebrow: slide.eyebrow, title: slide.title, theme, tgpPath, visitVdom }),
        h('div:grid min-h-0 flex-1 auto-cols-fr grid-flow-col gap-10', {}, ...(slide.cards || []).map((card, i) => h(
          'article:flex flex-col gap-5 rounded-[26px] border-t-[7px] border-[var(--accent)] bg-[var(--panel)] px-11 py-10 '
            + 'shadow-[0_30px_70px_#1717171a]',
          { key: i },
          editable(h('h3:m-0 text-[37px] font-extrabold leading-tight tracking-[-.02em] normal-case', {},
            ...textToVdom(ctx, card.title)), `cards~${i}~title`),
          h('div:flex flex-wrap gap-2', {}, ...(card.tags || []).map((tag, j) => editable(
            h('span:rounded-full border border-[var(--accent-border)] px-5 py-2 text-base font-extrabold text-[var(--accent-text)]', { key: j },
              ...textToVdom(ctx, tag)),
            `cards~${i}~tags~${j}`))),
          card.value && editable(h('strong:text-[54px] font-extrabold text-[var(--accent)]', {},
            ...textToVdom(ctx, card.value)), `cards~${i}~value`),
          card.text && editable(h('p:m-0 text-[27px] leading-normal text-[var(--secondary-text)]', {},
            ...textToVdom(ctx, card.text)), `cards~${i}~text`),
          card.footnote && editable(h('div:mt-auto border-t border-[var(--border)] pt-5 text-lg font-semibold text-[var(--secondary-text)]', {},
            ...textToVdom(ctx, card.footnote)), `cards~${i}~footnote`)))))
    }
  })
})

const StatementCardFrame = ReactComp('statementCardFrame.reveal', {
  impl: comp({
    hFunc: (ctx, { react: { h } }) => ({ card, children }) => h(
      'article:relative flex flex-col gap-5 overflow-hidden rounded-[26px] border border-[var(--surface-border)] bg-[var(--panel)] '
        + 'px-[46px] pt-[50px] pb-9 shadow-[0_30px_70px_#1717171a] transition hover:-translate-y-2 '
        + 'hover:shadow-[0_40px_90px_#ff480029]', {},
      h('i:absolute inset-x-0 top-0 h-[7px] bg-[linear-gradient(90deg,var(--accent),#ffb79b)]'),
      h(
        'h3:!m-0 !text-[37px] !font-semibold !leading-[1.16] !tracking-[-.02em] !text-[var(--text)] !normal-case '
          + '![font-family:var(--font-body)]', {}, ...textToVdom(ctx, card.title)
      ),
      card.tags?.length && h('div:flex flex-wrap gap-[10px]', {}, ...card.tags.map((tag, i) => h(
        'span:rounded-full border border-[var(--accent-border)] bg-[var(--panel)] px-5 py-2 text-[16.5px] font-extrabold '
          + 'tracking-[.06em] text-[var(--accent-text)]', { key: i }, ...textToVdom(ctx, tag)
      ))),
      children,
      card.footnote && h(
        'div:mt-auto border-t border-[var(--surface-border)] pt-[18px] text-[18.5px] font-semibold text-[var(--secondary-text)]', {},
        h('span:mr-[10px] text-xs text-[var(--accent)]', {}, '◆'), ...textToVdom(ctx, card.footnote)
      ))
  })
})

ReactComp('card.reveal.statement.valueComparison', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh } }) => ({ card }) => hh(ctx, StatementCardFrame, { card,
      children: h('div:flex flex-wrap items-baseline', {},
        h('span:text-[58px] font-extrabold tracking-[-.03em] text-[var(--muted-text)] line-through decoration-[4px]', {},
          ...textToVdom(ctx, card.previousValue)),
        h('span:mx-[10px] text-4xl text-[var(--border)]', {}, '→'),
        h('b:text-4xl font-extrabold text-[var(--accent)]', {}, ...textToVdom(ctx, card.value)))
    })
  })
})

ReactComp('card.reveal.statement.metric', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh } }) => ({ card }) => hh(ctx, StatementCardFrame, { card,
      children: h('div:flex flex-wrap items-baseline', {},
        h('b:text-[50px] font-extrabold text-[var(--text)]', {}, ...textToVdom(ctx, card.value)),
        card.valueContext && h('span:ml-2 text-[27px] font-bold text-[var(--muted-text)]', {},
          ...textToVdom(ctx, card.valueContext)))
    })
  })
})

ReactComp('card.reveal.statement.message', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh } }) => ({ card }) => hh(ctx, StatementCardFrame, { card,
      children: card.text && h(
        'p:!m-0 !text-[27px] !leading-[1.45] !text-[var(--secondary-text)] ![font-family:var(--font-body)]', {},
        ...textToVdom(ctx, card.text)
      )
    })
  })
})

ReactComp('cardGridSlide.reveal.statement', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh } }) => ({ slide, viewOf }) => h(
        'div:flex h-full flex-col bg-[radial-gradient(58%_55%_at_50%_0%,var(--accent-soft)_0%,var(--canvas)_65%)] '
          + 'px-[84px] pt-[56px] pb-[60px]', {},
        h('div:flex min-h-0 flex-1 flex-col items-center justify-center gap-7 text-center', {},
          h(
            'div:text-[var(--accent)] [font-family:var(--statement-label-font)] [font-size:var(--statement-label-size)] '
              + '[font-weight:var(--statement-label-weight)] [line-height:var(--statement-label-leading)] '
              + '[letter-spacing:var(--statement-label-tracking)]', {}, ...textToVdom(ctx, slide.eyebrow)
          ),
          h(
            'h1:!m-0 !max-w-[1620px] !text-[var(--text)] !normal-case ![font-family:var(--statement-title-font)] '
              + '![font-size:var(--statement-title-size)] ![font-weight:var(--statement-title-weight)] '
              + '![line-height:var(--statement-title-leading)] ![letter-spacing:var(--statement-title-tracking)] '
              + '[&_strong]:text-[var(--accent)]', {}, ...textToVdom(ctx, slide.title)
          )),
        h('div:grid min-h-0 flex-1 grid-cols-3 gap-10', {}, ...slide.cards.map((card, i) =>
          hh(ctx, viewOf('card', { statement: true, [card.lookAndFeel]: true }), { key: i, card }))))
  })
})

ReactComp('showcaseSlide.reveal', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh, useState } }) => ({ slide, theme, tgpPath, visitVdom }) => {
      const [selected, setSelected] = useState(0), item = slide.items[selected]
      const editable = (vdom, paramId) => visitVdom({ vdom, revealType: 'editable-text<reveal>', tgpPath: `${tgpPath}~${paramId}` })
      const select = index => {
        setSelected(index)
        ctx.vars.revealLogger?.info?.({ t: 'reveal.showcaseSelected', itemId: slide.items[index].id }, {}, { ctx })
      }
      return h('div:flex h-full flex-col bg-[var(--canvas)] pt-[var(--slide-top)] pr-[var(--slide-right)] pb-[var(--slide-bottom)] '
        + 'pl-[var(--slide-left)] text-left', {},
        hh(ctx, SlideHeader, { eyebrow: slide.eyebrow, title: slide.title, theme, tgpPath, visitVdom }),
        slide.subtitle && editable(h('div:-mt-2 mb-6 text-2xl text-[var(--secondary-text)]', {},
          ...textToVdom(ctx, slide.subtitle)), 'subtitle'),
        h('div:grid min-h-0 flex-1 grid-cols-[470px_1fr] gap-8', {},
          h('div:flex flex-col gap-3', {}, ...slide.items.map((entry, i) => h(
            'button:flex flex-1 flex-col justify-center rounded-[18px] border px-6 py-5 text-left transition', {
              key: entry.id,
              className: i == selected ? 'border-[var(--accent)] bg-[var(--panel)] shadow-[0_14px_40px_#ff480021]'
                : 'border-[var(--border)] bg-[var(--surface)]',
              onClick: () => select(i),
              'data-testid': `showcase-${entry.id}`
            },
            editable(h('b:text-2xl text-[var(--text)]', {}, ...textToVdom(ctx, entry.title)), `items~${i}~title`),
            entry.text && editable(h('span:mt-2 text-lg leading-normal text-[var(--secondary-text)]', {},
              ...textToVdom(ctx, entry.text)), `items~${i}~text`),
            i == selected && entry.details?.length && h('div:mt-3 grid gap-2', {}, ...entry.details.map((detail, j) => editable(
              h('div:text-base font-semibold text-[var(--accent-text)]', { key: j }, '◆ ', ...textToVdom(ctx, detail)),
              `items~${i}~details~${j}`)))))),
          h('div:flex min-h-0 min-w-0', {}, item?.content && hh(ctx, item.content))))
    }
  })
})

ReactComp('coverSlide.reveal.inPlace', {
  impl: comp({
    hFunc: (ctx, { react: { h } }) => ({ slide, theme, tgpPath, visitVdom }) => {
      const editable = (vdom, paramId) => visitVdom({ vdom, revealType: 'editable-text<reveal>', tgpPath: `${tgpPath}~${paramId}` })
      return h('article:flex h-full flex-col justify-center gap-6 rounded-3xl bg-[var(--surface)] px-14 text-left', {},
        slide.subtitle && editable(h('p:m-0 text-2xl leading-normal text-[var(--secondary-text)]', {},
          ...textToVdom(ctx, slide.subtitle)), 'subtitle'))
    }
  })
})

ReactComp('columnsSlide.reveal.inPlace', {
  impl: comp({
    hFunc: (ctx, { react: { h } }) => ({ slide, theme, tgpPath, visitVdom }) => {
      const editable = (vdom, paramId) => visitVdom({ vdom, revealType: 'editable-text<reveal>', tgpPath: `${tgpPath}~${paramId}` })
      const columns = slide.columns.map((column, i) => h('section:rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6', {},
        editable(h('h4:!m-0 !mb-5 !text-2xl !font-bold !text-[var(--accent)] !normal-case', {},
          ...textToVdom(ctx, column.title)), `columns~${i}~title`),
        h('ul:m-0 grid gap-3 pl-6 text-lg text-[var(--secondary-text)]', {}, ...coreUtils.asArray(column.items).map((item, j) =>
          editable(h('li', {}, ...textToVdom(ctx, item.text)), `columns~${i}~items~${j}~text`)))))
      return h('article:flex h-full flex-col text-left', {},
        h('div:grid min-h-0 flex-1 auto-cols-fr grid-flow-col gap-6', {}, ...columns))
    }
  })
})

const AppWindow = ReactComp('appWindow.reveal', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh } }) => ({ slide }) => {
      const theme = ctx.vars.theme.appTheme || ctx.vars.theme
      const fontFaces = jb.themeUtils.themeFontFaces(theme)
      const app = slide.app && hh(ctx.setVars({ theme }), slide.app)
      if (!slide.showWindowChrome) return h('div:flex h-full min-h-0 min-w-0 flex-1 flex-col', {
        style: jb.themeUtils.themeToCssVars(theme)
      }, fontFaces && h('style', {}, fontFaces), app)
      return h('article:flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[18px] border '
        + 'border-[var(--surface-border)] bg-[var(--panel)] shadow-[0_22px_60px_#17171714]', {
        style: jb.themeUtils.themeToCssVars(theme)
      },
      fontFaces && h('style', {}, fontFaces),
      h('header:flex h-[52px] shrink-0 items-center gap-[9px] bg-[var(--inverse)] px-5 text-[var(--inverse-text)] '
        + '[font-family:var(--window-title-font)] [font-size:var(--window-title-size)] [font-weight:var(--window-title-weight)]', {},
      h('i:size-[11px] rounded-full bg-[#3a3d45]'), h('i:size-[11px] rounded-full bg-[#3a3d45]'),
      h('i:size-[11px] rounded-full bg-[#3a3d45]'), ...textToVdom(ctx, slide.windowTitle || slide.title),
      slide.hint && h('span:ml-auto text-[13px] font-medium text-[#8f939e]', {}, ...textToVdom(ctx, slide.hint))),
      app)
    }
  })
})

ReactComp('appSlide.reveal.inPlace', {
  impl: comp({ hFunc: (ctx, { react: { hh } }) => ({ slide }) => hh(ctx, AppWindow, { slide }) })
})

ReactComp('appSlide.reveal', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh } }) => ({ slide }) => h(
      'div:flex h-full bg-[var(--canvas)] pt-[var(--slide-top)] pr-[var(--slide-right)] pb-[var(--slide-bottom)] pl-[var(--slide-left)]', {},
      hh(ctx, AppWindow, { slide }))
  })
})

ReactComp('masterDetailsSlide.reveal', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh, useEffect, useState } }) =>
      ({ slide, theme, tgpPath, visitVdom, viewOf, revealSubId, setRevealSubId }) => {
      const details = coreUtils.asArray(slide.details.profile).map((_, i) => {
        const { slideViewCtx, view } = slide.details(ctx, i)(ctx, { inPlace: true })
        return { slideViewCtx, view, ...slideViewCtx.vars }
      })
      const selectedFromHash = () => {
        const index = details.findIndex(detail => titleToHashId(detail.slideArgs.title) == revealSubId)
        return index < 0 ? 0 : index
      }
      const [selected, setSelected] = useState(selectedFromHash())
      useEffect(() => {
        const index = selectedFromHash()
        setSelected(index)
        setRevealSubId?.(titleToHashId(details[index].slideArgs.title))
      }, [revealSubId])
      const current = details[selected] || details[0]
      const detailVisitVdom = detail => args => visitVdom({
        slidePath: detail.slideTgpPath, slide: detail.slideArgs, ...args
      })
      const select = index => {
        setSelected(index)
        setRevealSubId?.(titleToHashId(details[index].slideArgs.title))
        ctx.vars.revealLogger?.info?.({
          t: 'reveal.masterDetailChanged', detailIndex: index, detailTitle: details[index].slideArgs.title
        }, {}, { ctx })
      }
      const detailButton = (detail, i) => h('button:rounded-2xl border px-6 py-5 text-left', {
        key: detail.slideTgpPath, onClick: () => select(i),
        className: i == selected ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border)] bg-[var(--panel)]'
      },
      detailVisitVdom(detail)({
        vdom: h('b:block text-xl text-[var(--text)]', {}, ...textToVdom(ctx, detail.slideArgs.title)),
        revealType: 'editable-text<reveal>', tgpPath: `${detail.slideTgpPath}~title`
      }),
      detail.slideArgs.subtitle && detailVisitVdom(detail)({
        vdom: h('span:mt-2 block text-base text-[var(--secondary-text)]', {}, ...textToVdom(ctx, detail.slideArgs.subtitle)),
        revealType: 'editable-text<reveal>', tgpPath: `${detail.slideTgpPath}~subtitle`
      }),
      i == selected && detail.slideArgs.highlights?.length && h('div:mt-3 grid gap-2', {},
        ...detail.slideArgs.highlights.map((text, j) => h(
          'span:text-base font-semibold text-[var(--accent-text)]', { key: j }, '◆ ', ...textToVdom(ctx, text))))
      )
      return h('div:flex h-full flex-col bg-[var(--canvas)] pt-[var(--slide-top)] pr-[var(--slide-right)] pb-[var(--slide-bottom)] '
        + 'pl-[var(--slide-left)] text-left', {},
        hh(ctx, SlideHeader, { eyebrow: slide.eyebrow, title: slide.title, theme, tgpPath, visitVdom }),
        slide.subtitle && h('div:-mt-2 mb-6 text-2xl text-[var(--secondary-text)]', {}, ...textToVdom(ctx, slide.subtitle)),
        h('div:grid min-h-0 flex-1 grid-cols-[430px_1fr] gap-8', {},
          h('nav:flex flex-col gap-3', {}, ...details.map(detailButton)),
          current && h('div:min-h-0 overflow-hidden', {},
            hh(current.slideViewCtx, current.view, {
              slide: current.slideArgs, theme, tgpPath: current.slideTgpPath,
              visitVdom: detailVisitVdom(current), viewOf
            }))))
    }
  })
})

const EntityDiagramSlide = ReactComp('entityDiagramSlide.reveal.systemArchitecture', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh, useEffect, useState } }) =>
      ({ slide, theme, tgpPath, visitVdom, viewOf, revealSubId, setRevealSubId }) => {
      const { canvas, panel, inverse, accent } = theme.colors
      const entities = (slide.entities || []).map(entity => {
        const lines = [entity.title, entity.subtitle, ...(entity.summary || [])].filter(Boolean)
        return { ...entity,
          width: entity.width == 'auto' ? entity.group ? 360 : Math.max(180, Math.min(360, 48 + Math.max(...lines.map(x => x.length)) * 10))
            : entity.width,
          height: entity.height == 'auto' ? entity.group ? 240 : 70 + (entity.subtitle ? 24 : 0) + (entity.summary?.length || 0) * 18
            : entity.height }
      })
      const byId = Object.fromEntries(entities.map(entity => [entity.id, entity]))
      const detailEntities = [...entities.filter(entity => !entity.group), ...entities.filter(entity => entity.group)]
        .filter(entity => entity.detail?.profile)
      const selectedFromHash = () => detailEntities.find(entity => titleToHashId(entity.title) == revealSubId)?.id
      const [selected, setSelected] = useState(selectedFromHash())
      useEffect(() => setSelected(selectedFromHash()), [revealSubId])
      const selectedEntity = byId[selected]
      const detailProfile = selectedEntity?.detail?.profile
      const detailView = detailProfile && selectedEntity.detail(ctx)(ctx, { inPlace: true })
      const detail = detailView?.slideViewCtx.vars.slideArgs, detailPath = detailView?.slideViewCtx.vars.slideTgpPath
      const detailVisitVdom = args => visitVdom({ slidePath: detailPath, slide: detail, ...args })
      const editable = (vdom, paramId) => visitVdom({
        vdom, revealType: 'editable-text<reveal>', tgpPath: `${tgpPath}~${paramId}`
      })
      const choose = entityId => {
        const selectedEntityId = selected == entityId ? null : entityId
        setSelected(selectedEntityId)
        setRevealSubId?.(selectedEntityId ? titleToHashId(byId[selectedEntityId].title) : 'overview')
        ctx.vars.revealLogger?.info?.({ t: 'reveal.entityDetailChanged', entityId: selectedEntityId }, {}, { ctx })
      }
      const anchorPoint = ({ entity: id, side, ratio = .5 }) => {
        const entity = byId[id]
        return side == 'top' ? { x: entity.x + entity.width * ratio, y: entity.y }
          : side == 'bottom' ? { x: entity.x + entity.width * ratio, y: entity.y + entity.height }
          : side == 'left' ? { x: entity.x, y: entity.y + entity.height * ratio }
          : { x: entity.x + entity.width, y: entity.y + entity.height * ratio }
      }
      const pathOf = relation => {
        const from = anchorPoint(relation.from), to = anchorPoint(relation.to), route = relation.route
        if (route.kind == 'bezier') {
          const vectors = { top: [0,-1], right: [1,0], bottom: [0,1], left: [-1,0] }
          const distance = Math.max(80, Math.hypot(to.x - from.x, to.y - from.y) * .3)
          const [fx, fy] = vectors[relation.from.side], [tx, ty] = vectors[relation.to.side]
          return `M ${from.x} ${from.y} C ${from.x + fx * distance} ${from.y + fy * distance}, `
            + `${to.x + tx * distance} ${to.y + ty * distance}, ${to.x} ${to.y}`
        }
        const points = [from, ...(route.points || []), to]
        const pathPoints = route.kind == 'orthogonal'
          ? points.flatMap((point, i) => i ? [{ x: point.x, y: points[i - 1].y }, point] : [point]) : points
        return pathPoints
          .filter((point, i) => !i || point.x != pathPoints[i - 1].x || point.y != pathPoints[i - 1].y)
          .filter((point, i, compact) => !i || i == compact.length - 1
            || !((point.x == compact[i - 1].x && point.x == compact[i + 1].x)
              || (point.y == compact[i - 1].y && point.y == compact[i + 1].y)))
          .map((point, i) => `${i ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
      }
      const entityView = (entity, i) => {
        const selectable = entity.detail?.profile
        const active = selected == entity.id
        return visitVdom({ revealType: 'editable-geometry<reveal>', tgpPath: `${tgpPath}~entities~${i}`, geometry: entity,
          vdom: h(`g${selectable ? ':cursor-pointer' : ''}`, {
          key: entity.id,
          style: { opacity: selected && !active ? .22 : 1, transition: 'opacity .3s' },
          onClick: () => selectable && choose(entity.id),
          'data-testid': `diagram-${entity.id}`
        },
        h('rect', {
          x: entity.x, y: entity.y, width: entity.width, height: entity.height, rx: entity.group ? 20 : 14,
          fill: entity.group ? entity.detail?.profile ? canvas.background : 'none'
            : entity.dark ? inverse.background : canvas.background,
          stroke: active ? accent.solid : entity.group
            ? entity.accented ? accent.border : canvas.border : entity.dark ? inverse.background : canvas.border,
          strokeWidth: active ? 4 : entity.group ? 1.6 : 1.5,
          strokeDasharray: entity.group ? '8 7' : undefined,
          filter: entity.group ? undefined : active
            ? 'drop-shadow(0 0 14px rgba(255,72,0,.45))' : 'drop-shadow(0 8px 18px rgba(23,23,23,.08))'
        }),
        h('foreignObject', {
          x: entity.x + (entity.group ? 20 : 12), y: entity.y + 12,
          width: entity.width - (entity.group ? 40 : 24), height: entity.group ? 40 : entity.height - 24
        }, entity.group
          ? editable(h('div:flex h-full items-center text-[15px] font-extrabold tracking-[.12em]', {
            style: { color: entity.accented || entity.detail?.profile ? accent.solid : canvas.mutedText }
          }, ...textToVdom(ctx, entity.title)), `entities~${i}~title`)
          : h('div:flex h-full flex-col items-center justify-center gap-1 text-center', {},
            editable(h('div:w-full font-extrabold leading-tight', {
              className: entity.dark && entity.width > 500 ? 'text-[14.5px] [font-family:var(--font-code)]'
                : entity.width > 500 ? 'text-[26px]' : 'text-xl',
              style: { color: entity.dark ? inverse.text : canvas.text }
            }, ...textToVdom(ctx, entity.title)), `entities~${i}~title`),
            entity.subtitle && editable(h('div:w-full text-sm leading-tight', {
              style: { color: entity.dark ? inverse.secondaryText : canvas.secondaryText }
            }, ...textToVdom(ctx, entity.subtitle)), `entities~${i}~subtitle`),
            ...(entity.summary || []).map((line, j) => editable(h('div:w-full text-xs leading-tight', {
              key: j, style: { color: entity.dark ? inverse.secondaryText : canvas.secondaryText }
            }, ...textToVdom(ctx, line)), `entities~${i}~summary~${j}`)))),
        entity.detail?.profile && h('circle', {
          cx: entity.x + entity.width - 16, cy: entity.y + 16, r: 5, fill: accent.solid
        }))
        })
      }
      const markerId = `reveal-arrow-${tgpPath.replace(/[^a-z0-9]/gi, '-')}`
      const relations = (slide.relations || []).flatMap(relation => {
        const from = anchorPoint(relation.from), to = anchorPoint(relation.to)
        const path = {
          d: pathOf(relation), fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke'
        }
        const halo = h('path', {
          ...path, key: `${relation.id}-halo`, stroke: canvas.background, strokeWidth: 7, 'data-relation-layer': 'halo'
        })
        const flow = h('path', {
          ...path, key: relation.id, stroke: canvas.secondaryText, strokeWidth: 2.2,
          markerStart: ['backward','both'].includes(relation.direction) ? `url(#${markerId})` : undefined,
          markerEnd: ['forward','both'].includes(relation.direction) ? `url(#${markerId})` : undefined,
          'data-relation-id': relation.id, 'data-route': relation.route.kind
        })
        return relation.label ? [halo, flow, h('text', {
          key: `${relation.id}-label`, x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 10,
          textAnchor: 'middle', fill: canvas.secondaryText, fontSize: 15, fontWeight: 700,
          style: { paintOrder: 'stroke', stroke: canvas.background, strokeWidth: 7, strokeLinejoin: 'round' }
        }, ...textToVdom(ctx, relation.label, 'tspan:fill-[var(--accent)]'))] : [halo, flow]
      })
      const diagram = h('svg:h-full min-h-0 w-full', { viewBox: slide.viewBox },
        h('defs', {}, h('marker', {
          id: markerId, markerWidth: 11, markerHeight: 11, refX: 9, refY: 5.5,
          orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse'
        }, h('path', {
          d: 'M 1 1 L 9 5.5 L 1 10', fill: 'none', stroke: canvas.secondaryText,
          strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round'
        }))),
        ...entities.map((entity, i) => entity.group && entityView(entity, i)).filter(Boolean),
        ...relations,
        ...entities.map((entity, i) => !entity.group && entityView(entity, i)).filter(Boolean))
      return h('div:flex h-full flex-col bg-[var(--canvas)] pt-[var(--slide-top)] pr-[var(--slide-right)] pb-[var(--slide-bottom)] '
        + 'pl-[var(--slide-left)] text-left', {},
        hh(ctx, SlideHeader, { eyebrow: slide.eyebrow, title: slide.title, theme, tgpPath, visitVdom }),
        slide.subtitle && editable(h('div:-mt-2 mb-6 text-2xl text-[var(--secondary-text)]', {},
          ...textToVdom(ctx, slide.subtitle)), 'subtitle'),
        h('div:relative flex min-h-0 flex-1', {},
          h('div:flex min-w-0 flex-1', { 'data-testid': 'diagram-master' }, diagram),
          h('div:h-full shrink-0 overflow-hidden transition-all duration-500', {
            className: detailView ? 'ml-[26px] w-[1280px]' : 'w-0'
          }, detailView && h('aside:relative flex h-full w-[1280px] flex-col overflow-hidden rounded-[20px] border border-[var(--panel-border)] '
            + 'bg-[var(--panel)] shadow-2xl', {
            'data-testid': 'diagram-detail', style: {
              '--r-main-color': panel.text, '--r-heading-color': panel.text
            }
          }, h('header:flex h-[92px] shrink-0 items-center border-b border-[var(--panel-border)] px-7', {},
            h('div', {}, h('div:text-[13px] font-extrabold tracking-[.2em] text-[var(--accent)]', {}, 'DRILL DOWN'),
              detailVisitVdom({
                vdom: h('h3:!m-0 !mt-0.5 !text-[27px] !font-extrabold !leading-[1.2] !text-[var(--panel-text)] !normal-case '
                  + '![font-family:var(--font-body)]', {}, ...textToVdom(ctx, detail.title)),
                revealType: 'editable-text<reveal>', tgpPath: `${detailPath}~title`
              })),
            h('button:ml-auto grid size-[42px] place-items-center rounded-full border border-[var(--panel-border)] bg-[var(--panel)] '
              + 'text-[19px] text-[var(--panel-text)]', {
              onClick: () => choose(selected), title: 'Close details', 'data-testid': 'diagram-close',
            }, '✕')),
          h('div:flex min-h-0 flex-1 flex-col px-7 py-6', {}, detailView.view && hh(detailView.slideViewCtx, detailView.view, {
            slide: detail, theme, tgpPath: detailPath, visitVdom: detailVisitVdom, viewOf
          }))))))
    }
  })
})

const deckSlideViewId = Data('deckSlideViewId', {
  params: [
    {id: 'kindId', as: 'string', mandatory: true}
  ],
  impl: (ctx, {}, { kindId }) => Object.entries(dsls.react['react-comp'])
    .filter(([id, cmp]) => cmp?.[coreUtils.asJbComp] && id.split('.')[0] == kindId && id.includes('.'))
    .map(([id]) => ({ id, parts: id.split('.').slice(1) }))
    .filter(({ parts }) => parts.every(category => ctx.vars.revealCategories?.[category]))
    .sort((a, b) => b.parts.length - a.parts.length)[0]?.id
})

function resolveSlideView(resolvedSlideCtx, dynamicCtx, categories = {}) {
  const { args: slideArgs, lexicalParentPath: slideTgpPath, path } = resolvedSlideCtx.jbCtx
  const revealCategories = {
    ...dynamicCtx.vars.revealCategories,
    reveal: true,
    ...categories,
    ...(slideArgs.lookAndFeel && { [slideArgs.lookAndFeel]: true })
  }
  const slideViewCtx = dynamicCtx.setVars({ slideArgs, slideTgpPath, revealCategories })
  const kindId = path.split(/[>~]/)[1]
  const viewId = deckSlideViewId.$runWithCtx(slideViewCtx, kindId)
  return { slideViewCtx, view: dsls.react['react-comp'][viewId] }
}

ReactComp('deckViewer', {
  params: [
    {id: 'deck', type: 'deck<reveal>'}
  ],
  impl: comp({
    hFunc: (ctx, { react: { cloneElement, h, useEffect, useRef, useState }, reveal }, { deck }) => () => {
      const { slides, controls, features, theme } = deck
      const initialHashParts = location.hash.match(/^#\/([^/?#]+)(?:\/([^/?#]+))?/)
      const initialSlideHashId = decodeURIComponent(initialHashParts?.[1] || '')
      const initialSubHashId = decodeURIComponent(initialHashParts?.[2] || 'overview')
      const initialSubId = initialSubHashId == '0' ? 'overview' : initialSubHashId
      const host = useRef(), injectionViews = useRef(new Map()), loggedSlides = useRef(new Set()), loggedVisitors = useRef(new Set())
      const strongRefreshViews = useRef(false)
      const [, setRefresh] = useState(0), [activeSlideIndex, setActiveSlideIndex] = useState(/^\d+$/.test(initialSlideHashId)
        ? +initialSlideHashId : 0)
      const [activeSlideHashId, setActiveSlideHashId] = useState(initialSlideHashId)
      const [revealSubId, setRevealSubIdState] = useState(initialSubId)
      const [editMode, setEditModeState] = useState(false)
      const refresh = strong => (strongRefreshViews.current ||= strong, setRefresh(value => value + 1))
      const setRevealSubId = value => {
        setRevealSubIdState(value)
        controls.hash && history.replaceState(null, '', `#/${activeSlideHashId}/${encodeURIComponent(value)}`)
        ctx.vars.revealLogger?.info?.({ t: 'reveal.subIdChanged', slideId: activeSlideHashId, subId: value }, {}, { ctx })
      }
      const setEditMode = value => {
        setEditModeState(value)
        ctx.vars.revealLogger?.info?.({ t: 'reveal.editModeChanged', editMode: value }, {}, { ctx })
      }
      useEffect(() => {
        const { deck: revealDeck, disconnect } = reveal.mount(host.current)
        const activateSlide = (indexh, subId = 'overview') => {
          const slideId = titleToHashId(revealDeck.getSlides()[indexh]?.dataset.label)
          setActiveSlideIndex(indexh)
          setActiveSlideHashId(slideId)
          setRevealSubIdState(subId)
          controls.hash && history.replaceState(null, '', `#/${slideId}/${encodeURIComponent(subId)}`)
          ctx.vars.revealLogger?.info?.({ t: 'reveal.hashChanged', indexh, slideId, subId, hash: location.hash }, {}, { ctx })
        }
        revealDeck.configure({
          width: 1920, height: 1080, margin: 0, controls: controls.navigation, progress: controls.progress,
          transition: 'fade', center: false, scrollActivationWidth: null
        })
        const onSlideChanged = ({ indexh }) => activateSlide(indexh)
        revealDeck.on('slidechanged', onSlideChanged)
        revealDeck.on('ready', () => {
          const slideIndex = /^\d+$/.test(initialSlideHashId) ? +initialSlideHashId
            : revealDeck.getSlides().findIndex(slide => titleToHashId(slide.dataset.label) == initialSlideHashId)
          const targetIndex = slideIndex < 0 ? 0 : slideIndex
          revealDeck.slide(targetIndex)
          queueMicrotask(() => activateSlide(targetIndex, initialSubId))
        })
        revealDeck.on('ready', () => ctx.vars.revealLogger?.info?.({
          t: 'reveal.ready', slideCount: revealDeck.getTotalSlides(), controls, slidesPath: slides.lexicalCtx.jbCtx.path, initialHash: location.hash
        }, {}, { ctx }))
        return () => (revealDeck.off('slidechanged', onSlideChanged), disconnect())
      }, [])
      const renderView = (view, props, strongRefresh, viewCtx = ctx) => {
        if (strongRefresh && view[coreUtils.asJbComp]) return viewCtx.vars.react.hhStrongRefresh(viewCtx, view, props)
        const native = view[coreUtils.asJbComp] ? view.$runWithCtx(viewCtx) : view
        return cloneElement(native(props), { jbid: native.jbid })
      }
      const visitors = features.flatMap(feature => (feature.visitors || []).map(visitor => ({ feature, visitor })))
      const visitVdom = ({ revealType, ...args }) => visitors
        .filter(({ visitor }) => visitor.revealType == revealType || visitor.revealType == 'reveal-comp<reveal>')
        .reduce((vdom, { visitor }) => {
          const logKey = `${revealType}:${args.tgpPath}`
          if (!loggedVisitors.current.has(logKey)) {
            loggedVisitors.current.add(logKey)
            ctx.vars.revealLogger?.info?.({ t: 'reveal.vdomVisited', revealType, tgpPath: args.tgpPath }, {}, { ctx })
          }
          return visitor.visit(ctx)({ ...args, vdom, editMode, refresh })
        }, args.vdom)
      const injected = injectArea => features.flatMap(feature => (feature.injections || [])
        .filter(injection => injection.injectArea == injectArea)
        .map((injection, i) => {
          if (!injectionViews.current.has(injection)) injectionViews.current.set(injection, injection.hFunc(ctx))
          return h(injectionViews.current.get(injection), { key: i, slides, activeSlideIndex, editMode, setEditMode, refresh })
        }))
      const themedCtx = ctx.setVars({ theme })
      const viewOf = (kind, categories = {}) => {
        const revealCategories = { ...ctx.vars.revealCategories, reveal: true, ...categories }
        return dsls.react['react-comp'][deckSlideViewId.$runWithCtx(themedCtx.setVars({ revealCategories }), kind)]
      }
      const strongRefresh = strongRefreshViews.current
      strongRefreshViews.current = false
      const sections = coreUtils.asArray(slides.profile).map((profile, i) => {
        const slideType = coreUtils.compIdOfProfile(profile)
        const active = activeSlideIndex == i
        const slideCtx = themedCtx
        const { slideViewCtx, view } = slideCtx.runInnerArg(slides, i)(slideCtx)
        const { slideArgs: slide, slideTgpPath: tgpPath } = slideViewCtx.vars
        if (!loggedSlides.current.has(tgpPath)) {
          loggedSlides.current.add(tgpPath)
          ctx.vars.revealLogger?.info?.({
            t: 'reveal.slideViewResolved', tgpPath, slideType, viewId: view?.[coreUtils.asJbComp]?.id, slide
          }, {}, { ctx })
        }
        const visitSlideVdom = args => visitVdom({ slidePath: tgpPath, slide, ...args })
        return view && h('section', {
          key: i, className: ['slide', slideType.split('>').pop(), slide.cssClass].filter(Boolean).join(' '),
          'data-reveal-slide-type': slideType, 'data-label': slide.title
        }, renderView(view, {
          slide, theme, tgpPath, visitVdom: visitSlideVdom, viewOf,
          revealSubId: active ? revealSubId : 'overview', setRevealSubId: active ? setRevealSubId : undefined
        }, strongRefresh, slideViewCtx))
      })
      const revealTree = h('div:reveal', { ref: host }, h('div:slides', {}, ...sections))
      const areaClass = {
        topLeft: 'absolute left-6 top-5 z-40', topRight: 'absolute right-5 top-5 z-[100]',
        bottomLeft: 'absolute bottom-6 left-6 z-40', bottomRight: 'absolute bottom-6 right-6 z-40'
      }
      const overlay = injected('overlay')
      const { canvas, accent } = theme.colors
      const themeVars = {
        ...jb.themeUtils.themeToCssVars(theme), '--r-background-color': canvas.background, '--r-main-font': 'var(--font-body)',
        '--r-main-color': canvas.text, '--r-heading-font': 'var(--font-body)', '--r-heading-color': canvas.text,
        '--r-heading-text-transform': 'none', '--r-link-color': accent.solid
      }
      const featureCss = features.map(feature => feature.tailwindCss).filter(Boolean).join('\n')
      const fontFaces = jb.themeUtils.themeFontFaces(theme)
      const layout = h(
        'div:relative h-full bg-[var(--canvas)] text-[var(--text)] [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin] '
          + '[&_*]:box-border [&_.reveal]:h-screen [&_.reveal]:[font-family:var(--font-body)] [&_.reveal_.slides]:text-left '
          + '[&_.reveal_.slides_section]:h-[1080px] [&_.reveal_.controls]:text-[var(--accent)] '
          + '[&_.reveal_.progress]:h-1 [&_.reveal_.progress]:text-[var(--accent)]', { style: themeVars },
        fontFaces && h('style', {}, fontFaces),
        featureCss && h('style', { type: 'text/tailwindcss' }, featureCss),
        h('div', {}, ...injected('title')), h('div', {}, ...injected('menu')), h('div:h-full', {}, revealTree),
        ...Object.entries(areaClass).map(([area, className]) => h('div', { className }, ...injected(area))),
        overlay.length ? h('div:pointer-events-none absolute inset-0 z-50', {}, ...overlay) : null)
      const shell = viewOf('deckShell'), children = [layout]
      return shell ? renderView(shell, { children }) : h('main:h-full', {}, ...children)
    },
    enrichCtx: loadReveal(),
    metadata: '%$deck/metadata%'
  })
})
