# Your rule content
When I ask with two ??, it means you must only answer but not modify the code. 
Write your implementation with the lowest number of code lines possible - the best code is short code. Don't add too many logs and comments.
For me to know you understand this - add "#Using mininal lines of code#" after everything you do.
preffer functional programming implementation.
never use commonjs.
Don't do anything I didn't ask you specifically to do. You can suggest improvements in the chat but don't implement them without clear ok from me. 
When implementing a change, after you finish working go over the code base and make sure no updates are nesseacry,
for example deleteing code that is no longer needed after your new implementation.
When I ask you to fix a bug, I don't want you to add error handling or better logging, I want you to only fix the funcionality needed to fix the bug.
After you finish you initial implementation, make a mid-summary of what you did. Than try to simplify your implementation to make it shorter
and in fewer lines of code - in a deep way, that is a solution that solves the problem with less hacking and twiking,
but in a more fundementally correct and concise way. Tell me you did this by saying "Concise Master, I will now improve my implementation".
If you didn't succeed my request a second time, write "Accroding to your wise request, Wise Master, i will try some logging".
And then add logs that will help you pinpoint the problem when I will paste them to you. Mark the logs "log to delete" and create a list of them.
After you'll understand the problem was solved (when I tell you explicitly or implicitly), you will delete all of these logs.
NEVER MAKE MOCK IMPLEMENTATION OR STUBS - when I ask you to do something, do it fully, in the best professional way,
with all considerations in mind. If you can't perform the task because of missing data, ask for it and then implement.
Let me know you read the rules by writing
"According to your rules, O Wise Master, I'll think hard and provide an excellent implementation without saving tokens"
as the first thing you write and do.
When reading code files always read the whole file, not just a few lines. To let me know you did it write "Master I read the whole file". 
lines are maximum 180 chars, if you work on some file and it's not the case - refactor as part of the job.

## Pocito file placement

Keep Pocito applets, assets, screenshots, and supporting files under `solutions/pocito/`, never at the repository root.
Store images in `solutions/pocito/assets/`; keep shared framework code and repository configuration in their existing locations.

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


You must understand tgp before writing or using tgp components. read jb6/core/utils/jb-core.js, jb-args.js, tgp.js, jb-expression.js in details
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
jb6/react/react-utils.js - dsl and utils
wonder/ui/room-applet-tests.js for examples

- Public defaults to `/room/:roomId/applet/:appletName`; signed must explicitly use `/signed-room/:roomId/applet/:appletName`.
- Stop Pocito and every service started by `npm run pocito-dev` with `npm run pocito-dev:shutdown` before restarting it.

When iterating on a UI at localhost, open `localhost:3000/applet/:cmpId` - it serves any registered react-comp with a spec derived
from the comp itself: no def file, no upload. Make sure the comp is imported from your `.jb6/entry-points-*.js`; persistence uses the fs room `room://dev`.
This also scopes Marketplace requests to the `dev` room, so seed Marketplace assets there.
Alternative harness: `localhost:3000/jb6_packages/react/react-comp-view.html?cmpId=<id>&urlsToLoad=@wonder/<path>.js` (bare viewer, needs `ctx-roomWUrl` for room comps).

To bind an applet to a specific localhost room, PUT its def json via fetch mcp like this example
wFetch:{
    "url": "room:fs//testPublicRoom/applets/myApplet.json",
    "method": "PUT",
    "headers": {"content-type": "application/json"},
    "body": {
      "cmpId": "myApplet",
      "urlsToLoad": "@wonder/ui/my-applet.js",
      "appletV": "live-repo",
      "entryCompFullId": "react-comp<react>myApplet"
    }
  }

use uploadRoomApplet mcp to wrap and load the applet to the cloud

for slides ui use wonder/ui/reveal/reveal-dsl.js

## High Quality Software Design

When writing TGP components or TGP tests, remember that you are a pedantic architect.
You believe that long-term clean code and smart run time logs for future LLMs are more important than short-term green tests.
You do not believe in static remarks in the code. remarks are done by smart and correct var/params/function names and clean logic.

When doing design, define the specific design goal clearly. Suggest 2–3 design alternatives.
Compare them in a table with a 1–5 quality score. Then discuss and add more options or choose.

After writing the code make a table of all new terms (var names, function name, param names, etc), rank the quality of each term you added.
Think about future llm readability, consdier the right level of abstraction in this context.
After showing me this table, you can fix the new terms, and welocomed to suggest fixes in exiting terms.

## files dir
contains fs room data

## File Query (Analytics)
For querying large files (CSV/JSON), use `fileQuery` from `admin/etl/file-query.js`.
Uses cliEtl internally with caching — re-runs only when source file changes.

Profile keys use `{$: 'type<dsl>componentId'}` syntax. All `$` values must match a real component.
```
{$: 'data<common>fileQuery',
  from: {$: 'cli-extract<etl>localFile', path: '/tmp/sessions_data.json'},
  query: {$: 'cli-transform<etl>duckdb', sql: "SELECT count(*) as total FROM read_json_auto($inputFile)", format: 'JSON, ARRAY'}}
```
- JSON files: `read_json_auto($inputFile)` — CSV files: `read_csv($inputFile)`
- `format: 'JSON, ARRAY'` returns parsed array of objects (default CSV returns `{raw: "..."}`)
- Use `clearCache: true` param to force re-run

- On Linux dev machine, always prepend `SET memory_limit='4GB';` before any DuckDB parquet COPY/compression.
