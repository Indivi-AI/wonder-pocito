import { dsls } from '@jb6/core'
import '@jb6/testing'
import '@jb6/react'
import '@jb6/react/tests/react-testers.js'
import '@wonder/db/db-drivers.js'            // wFetch comp + logs scope (write-only bucket logs-bucket-me-west1)

const {
  tgp: { Component, CtxEnricher, 'ctx-enricher': { enrichCtx, setVars } },
  common: { Data, boolean: { contains }, data: { wFetch } },
  test: { Test, test: { reactTest }, 'ui-action': { actions, click, waitForText } },
  react: { ReactComp, 'react-comp': { comp } }
} = dsls

// ---------------------------------------------------------------------------
// demoRoomSample — a signedRoom applet whose admin/users.json lets ANY authenticated user in as a read-only "visitor":
//   { admins:[owner], users:['authenticated'], accessLevels:{ usersRO:{ user:'r' }, admin:{ admin:'rw' } } }
// A visitor can never read others' actions. ONE sessionId per visit; EACH event is its own object, date-partitioned,
// whose FILE NAME carries the sessionId, in the global write-only logs bucket
// (logs:gcs//demoRoom/<date>/<sessionId>-<seq> → logs-bucket-me-west1, driver GCS.node.gcpIdentity.logs).
// A unique name per event ⇒ a plain PUT, no read-modify-write.
// reads the visit facts (today/sessionId/user) + per-event seq/action from ctx vars, so it runs within the component's
// live ctx (loggers, onLiveRepo, ...) — invoked via a dynamic param below, never a detached new Ctx()/$run.
const logVisitorEvent = Data('logVisitorEvent', {
  impl: wFetch('logs:gcs//demoRoom/{%$today%}/{%$sessionId%}-{%$seq%}', {
    method: 'PUT',
    body: ctx => ({ user: ctx.vars.user, action: ctx.vars.action, ts: Date.now() })
  })
})

// harvestVisitorContext — the ONE place a visit's identity/time is derived. A reusable ctx-enricher that HARVESTS
// per-visit facts into ctx vars (sessionId like conf-template2.php's _sid = <UTC-stamp>-<rand>; today; user from
// %$userEmail%). The seam to extend with url params / a google api call later — add another setVars, nothing else moves.
// sessionId is a get-or-create page-load singleton so it survives re-renders/re-mounts within the same visit.
const harvestVisitorContext = CtxEnricher('harvestVisitorContext', {
  impl: enrichCtx(setVars(ctx => {
    const p2 = (n, w = 2) => String(n).padStart(w, '0')
    const now = new Date()
    const utcStamp = `${now.getUTCFullYear()}-${p2(now.getUTCMonth() + 1)}-${p2(now.getUTCDate())}-${p2(now.getUTCHours())}-${p2(now.getUTCMinutes())}-${p2(now.getUTCSeconds())}-${now.getUTCMilliseconds()}`
    const sessionId = globalThis.sessionId ||= `${utcStamp}-${Math.random().toString(36).slice(2, 11)}`
    return { sessionId, today: now.toISOString().slice(0, 10), user: ctx.vars.userEmail }
  }))
})

const demoRoomSample = ReactComp('demoRoomSample', {
  params: [
    { id: 'logEvent', dynamic: true, defaultValue: logVisitorEvent(), description: 'per-event effect, invoked against the live ctx with seq/action vars' }
  ],
  impl: comp({
    enrichCtx: harvestVisitorContext(),   // harvest sessionId/today/user ONCE on mount
    hFunc: (ctx, { react: { h, useState } }, { logEvent }) => {
      const { sessionId } = ctx.vars
      const log = (seq, action) => logEvent(ctx.setVars({ seq, action }))   // dynamic param runs in the live ctx — no detached $run
      log(0, 'enterPage')                 // page-enter = harvest time = event 0
      return () => {
        const [seq, setSeq] = useState(0)
        const onClick = action => { const n = seq + 1; setSeq(n); log(n, action) }
        return h('div:p-4 font-sans', {},
          h('h1:text-lg font-bold', {}, 'Demo Room'),
          h('p:text-xs text-gray-500', {}, `session ${sessionId}`),
          h('button:cursor-pointer px-3 py-1 border rounded mr-2', { onClick: () => onClick('viewedItems') }, 'View items'),
          h('button:cursor-pointer px-3 py-1 border rounded', { onClick: () => onClick('clickedCta') }, 'Click CTA'),
          seq > 0 && h('p:mt-2 text-green-600', {}, `logged ${seq} clicks`))
      }
    }
  })
})

// demoRoomSample: render as a visitor → 'enterPage' logs on mount; two clicks log two more events in the SAME session.
Test('roomAppletTest.demoRoomSample.visitorSession', {
  HeavyTest: true,
  impl: reactTest({
    testedComp: (c, { react: { hh } }) => () => hh(c.setVars({ userEmail: 'visitor@demo' }), demoRoomSample),
    userActions: actions(waitForText('View items'), click('View items'), waitForText('logged 1 clicks'), click('Click CTA'), waitForText('logged 2 clicks')),
    expectedResult: contains('logged 2 clicks'),
    timeout: 12000,
    logger: 'uiLogger,dbLogger'
  })
})
