# Wonder and jb6 guide

## jb6 and TGP

TGP: TgpType (abstract type), Component (generic def), Profile (concrete JSON instance)
example:
TgpType('color', 'css')

Component('rgb', { type: 'color<css>', params: [{id: 'r', as: 'number'}, {id: 'g', as: 'number'}, {id: 'b', as: 'number'}] })
Component('hsl', { type: 'color<css>', ... })

TgpType('gradient', 'css')
Component('linearGradient', { type: 'gradient<css>', params: [{id: 'direction', as: 'string'}, {id: 'stops', type: 'color<css>[]'}] })
Component('radialGradient', { type: 'gradient<css>', ... })
...

// Profile: linear-gradient(to right, rgb(255,99,71), hsl(45,100,50))
{$: 'gradient<css>linearGradient', direction: 'to right', stops: [{$: 'color<css>rgb', r: 255, g: 99, b: 71}, {$: 'color<css>hsl', h: 45, s: 100, l: 50}]}


You must understand tgp before writing or using tgp components. read jb6's core/utils/jb-core.js, jb-args.js, tgp.js, jb-expression.js in details (jb6 lives at the jb6Root of package.json)
LLM mem is drifting, when you need tgp, ask yourself "can I explain how 'dynamic: true' actually works" - if not,
read carefully *again* jb-core,jb-args,tgp.js and explain 'dynamic: true' mechanism in details.

The coding style in TGP is as follows:
1. short, concise code
2. usually, everything is in a component, avoid using helper functions.
3. The idea behind TGP is to have a non-tech implementor who can program by creating profiles, without understanding the impl comps.
So the profiles should be declerative and semnatic, and the comps that impl the profiles handle the technical considerations.

## TGP Anti patterns
do not define global profile without registering it in the dsls repo:
  do not: const myProfile = myComp({...})
  instead: const myProfile = MyTgpType('myProfile', { impl: myComp({...}) })

do not use - ctx.run(profile) inside comp impl
  instead define a param as 'dynamic: true', maybe with default value (profile()), and call it impl: (ctx,{},{p1}) => ... p1(ctx).

do not use js export when dealing with tgp. use the dsls registery instead.

do not use js const xx = non tgp exp
  this js consts should be either tgp Const (used with %$%) or clean/registered Data comp used as x() proxy

Before you try to fix anti-pattern. read carefully again jb-core,jb-args,tgp.js
  - explain 'dynamic: true' mechanism in details.
  - explain in details how 'fake' param dynamic: true can replace ctx.run in the impl
  - explain why export is tgp anti-pattern


## TGP MCP Tools
When calling this server from Codex, run `curl` outside the restricted network sandbox (`require_escalated`); sandboxed `localhost` cannot reach the host server.

use mcp directly using our localhost mcp server
curl -s -X POST http://localhost:3000/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1, ...

**Discovery:**
- scanDsl

**Execution**
- runTgpSnippet({profileText: '...', logger}) — execute a JSON profile. All `$` references are auto-resolved — source files discovered
  and imported automatically from `$location` on comp definitions. Returns execution result + logger output.
- runTest({testId: 'tst1'}) — shorthand for `runTgpSnippet({profileText: "{$: 'test<test>tst1'}"})`
- roomAppletHarvest({url,waitForText,waitForSelector, ..., logger}) - use for every `/room/.../applet/...` or `/signed-room/.../applet/...` URL;
  it handles room auth/noAuth and applet readiness. Use generic playwrightHarvest only for non-room pages. Check logs, not only UI.
- runProbe({probePath: 'test<test>myTest~impl~calculate~items~0'}) — run a circuit and capture intermediate `{in,out}` at a probePath.
  Auto-detects the enclosing circuit; returns `{in,out}` + visits + circuitRes + logs/errors.
  `resolution: 'input'|'output'|'all'` narrows/expands the detail.

use formatAndValidateTgpComp after editing or adding tgp comp. *never ask permission to run it*. try to use only tgp comps.

## TGP Tests and Loggers
Domain loggers produce logs as parts of tests results.
In impl code, loggers are accessed via `ctx.vars`. Usage example, `assetLogger?.info?.({t: 'myEvent', ...data}, {}, {ctx})`
When running a test, always set relevant loggers, and check the log results. checking success status is not enough.
When debugging with runTest/runTgpSnippet, set loggers, you can add xxLogger?.info and run in cycles.
Common loggers: dbLogger, uiLogger, roomLogger. most dsls suggest their own logger.
Your test must be imported via .jb6/entry-points-{name}.js
if you crash, add try catch and logException
if you want to have bigLogs in a separate file use `roomBigLogLogger2` just as another logger. you will get the saved bigLog wUrl/path in the result, just make sure

## wonder rooms, wonder DB & wfetch
db/db-drivers.js
read admin/room/room-tests.js

use mcp wFetch(wUrl) to work directly with the data
aTeam crm example:
wFetch({
  url: 'room://r49btbgtzw/contacts.json?jq=..'
})

### room applets - ui of wonder
jb6 react/react-utils.js - dsl and utils
wonder/ui/room-applet-tests.js for examples

- Public rooms use `/room/:roomId/applet/:appletName`; roomless applet urls `/applet/:appletName`, signed rooms must explicitly use `/signed-room/:roomId/applet/:appletName`. 

At localhost, with no room data, you can just use roomless url. no upload in needed. Make sure the comp is imported from your entry point `.jb6/entry-points-*.js`

to share the applet, use uploadRoomApplet mcp

for slides ui use wonder/ui/reveal/reveal-dsl.js
