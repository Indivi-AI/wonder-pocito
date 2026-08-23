# ReactComp guide for `solutions/idf`

Use this guide for Wonder ReactComp work here. Before editing, read these focused examples:

- `wfetch2-guide-react-comp.js`: direct GET, missing-value seed, immutable update and PUT.
- `json-file-import-guide-react-comp.js`: browser file input, `file.text()`, JSON normalization and immutable insertion.
- `enrich-ctx-guide-react-comp.js`: when and how to enrich context immediately before a real workflow.

Then use `room-state-react-comp.js`, `stable-chat-react-comp.js` and `llm-flow-react-comp.js` for complete patterns.
Do not use `safeEditTgpComp`; edit normally with read/edit/write tools. Keep lines at or below 180 characters and use ESM only.

## Registered ReactComp anatomy

```js
import { dsls } from '@jb6/core'
import '@jb6/react'
const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('example', {
  params: [{id: 'roomWUrl', as: 'string'}],
  impl: comp({
    hFunc: (ctx, {}, {roomWUrl}) => {
      const { h, useState } = ctx.vars.react
      return function Example() {
        const [value, setValue] = useState('')
        return h('input', { value, onInput: event => setValue(event.target.value) })
      }
    }
  })
})
```

Register every TGP component with `Data`, `Workflow`, `ReactComp`, or a similar constructor; never export or keep a global unregistered profile.
Use the DSL registry to reference components: `dsls.react['react-comp'].example`.

## Hooks and stable identity

Call hooks only inside the React function returned by `hFunc`.
A child `hFunc` may directly return a props function and call hooks inside that returned function.
Never define a component inside a stateful component and render it with `h`; it gets a new identity on every parent render.
That remount destroys the textarea and causes focus loss or chat collapse.
Register stateful children separately and render them with `hh`:

```js
hh(ctx, dsls.react['react-comp'].stableChild, { value, setValue })
```

The composer in `stable-chat-react-comp.js` owns its textarea hook and stable identity; Enter sends while Shift+Enter inserts a newline.

## Real room persistence

The exact GET and PUT calls are:

```js
const response = await jb.wonderUtils.wfetch2(assetUrl, { method: 'GET' }, ctx)
const value = response.ok ? await response.json() : seed
await jb.wonderUtils.wfetch2(assetUrl, { method: 'PUT', body: value }, ctx)
```

If GET is missing, PUT the seed once, then use it as state.
The reusable registered implementation is `data<common>idfRoomJsonStore`; load in `useEffect`, then set state and PUT the same immutable object.
Add with `[...items, item]`, edit with `items.map`, and delete with `items.filter`.
Never mutate room assets, messages, reports, tags, or nested arrays in place.

Bare room ids normalize to public `room://`; public applets use `/room/:roomId/applet/:appletId`.
Signed storage must be explicit with `signedRoom://` and uses `/signed-room/:roomId/applet/:appletId`.
Do not probe storage to guess whether a room is signed.
Local MinIO examples deliberately use `room:minio//` and isolated room ids.

## Real `llm-flow`

Build the grounded payload from the selected plugin and only its connected assets.
Include all room reports so returned ids can be validated and embedded.
Use `ctx.setVars` for ordinary scoped values. Call `extendWithWorkflowVars` only at the boundary immediately before `calcWorkflow`:

```js
const workflowCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx.setVars({
  userMessage, selectedPlugin: JSON.stringify(plugin), accumulatedContext: { chatHistory },
  assetRepoText: JSON.stringify({ plugin, skills, tools, subagents, reports }),
  llmProxyUrl: 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy'
}))
const result = await dsls.ai.workflow.wonderPlatformAgent.$run().calcWorkflow(workflowCtx)
```

Do not guess another enrichment API and do not replace this with `ctx.run(profile)`.
`dynamic: true` parameters are delayed callables bound to their lexical context; call such a parameter as `param(ctx)`.
The workflow returns structured data in `result.runRes` plus `workflowTrace` and `workflowErrors`.
Normalize `runRes` to `{text, reportIds, followUps}` and derive displayed trace steps from `workflowTrace`.
Append one user message, run the workflow, append one agent message, then persist the resulting conversation.
Before rendering an id, find it in `repo.reports`, ignore missing ids, and render the real report rather than copied data.

## Tests and upload

After every meaningful edit run `node --check` on the changed JavaScript file.
Run the focused tests through `.jb6/entry-points-idf.js` and inspect logger arrays, not only `success`.
Use `dbLogger` for room round trips, `workflowLogger` for `llm-flow`, and `uiLogger` for browser behavior.
Validate every changed registered component with the repository TGP formatter/validator.
Use the ReactComp development URL first, then test the isolated local-MinIO room.
Type a complete sentence character by character and assert value plus focus after every input event.
Press Enter, verify the composer still exists, and verify the conversation was PUT to MinIO.
For grounded chat, assert returned `reportIds` exist and the corresponding report cards render.

Before upload, import the candidate from a valid `.jb6/entry-points-*.js` module so its `$location.path` is registered.
Inspect `uploadRoomApplet` with `tools/list` and send only fields present in its current schema.
With the current schema call it with `roomId` and `entryCompFullId`; the registered component supplies the module entry path.
Inspect the complete upload response, including errors and timeline; retry once only if arguments were wrong.
Open the returned public or signed room URL in the browser and verify desktop plus 390px mobile screenshots.

## Verify after every edit

- Syntax passes and no line exceeds 180 characters.
- All TGP ids resolve from the dedicated entry point.
- Relevant tests pass and logger error arrays are empty.
- GET/PUT round trip persists the exact immutable state.
- Typing keeps focus; Enter sends; Shift+Enter does not send.
- Real `llm-flow` returns grounded text, real report ids, follow-ups, and trace data.
- CRUD, import, evaluations, conversations, and report embedding still work.
- Desktop and mobile match the reference; mobile has no horizontal overflow.
- `uploadRoomApplet` succeeds and the uploaded room applet opens.
