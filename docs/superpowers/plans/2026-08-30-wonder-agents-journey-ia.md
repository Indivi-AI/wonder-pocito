# wonderAgents Journey IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the wonderAgents applet from an asset-catalog CRUD tool into a journey product where "I want to create an agent" leads a new user through building the capabilities that agent needs, without ever teaching them the asset architecture first.

**Architecture:** Replace the two competing nested-editing mechanisms (`workspace` single-item state, and the `editors` array rendered as a left drawer) with one `stack` of frames rendered full-page by a shared chrome component, `wonderPlatformJourney`. A frame is `{resource, item, baseline, attachTo}`. Depth is expressed by a persistent breadcrumb rather than by stacked overlays. Navigation splits into a primary tier (Home, Chat) and a collapsed secondary tier of asset catalogs.

**Tech Stack:** jb6 TGP (`ReactComp`, `Data`, `dsls` registry), hyperscript `h`/`hh` React rendering, Tailwind utility strings with `--wp-*` CSS variables, Hebrew RTL copy, ESM only. Tests are `reactTest` profiles in `wonder-platform-tests.js`, run through `.jb6/entry-points-pocito.js` via the wonder MCP `runTest`.

**Spec:** This document. All design decisions were settled in three grilling rounds and are recorded verbatim under "Settled Decisions" below.

## Global Constraints

- Lines are at most 180 characters. Refactor any file you touch that violates this.
- ESM only. No CommonJS. No `export` of TGP profiles — use the `dsls` registry.
- Every new component registered with `ReactComp` / `Data`. No unregistered global profiles.
- Run `formatAndValidateTgpComp` after adding or editing any TGP component.
- Run `node --check` on every changed JavaScript file.
- All user-facing copy is Hebrew, RTL. Technical field labels (`display_name`, `system_prompt`, `SKILL.md`) stay in English as they are today.
- **Viewport range: floor 1280x800, ceiling 2560+. Phone and tablet are out of scope** — do not add sub-1280 breakpoints or touch navigation. Existing `max-sm:` / `sm:` code may stay; it is not maintained. Horizontal overflow is never acceptable in the supported range. Where a three-column arrangement cannot fit at 1280, the side panel collapses, never the main column.
- Long Hebrew names truncate; never wrap into the layout. Full value goes in `title`.
- Do not add error handling, logging, or validation beyond what a task explicitly asks for.

## Settled Decisions

| # | Decision | Consequence |
|---|---|---|
| D1 | **Immediate-write.** A child saved at depth 3 is written to the catalog at once, exactly as `saveEditor` does today. | No draft engine. Abandonment is handled by a sweep prompt, not by deferred commit. |
| D2 | **Plugin recommended, not mandatory.** Direct skill/tool/knowledge attach on an agent stays available but visually secondary. | The `agents` relations `pluginIds`/`skillIds`/`toolIds`/`knowledgeIds` all stay wired. |
| D3 | **One editing surface.** Catalog editing and journey editing are the same component; depth 0 is a stack of one. | `wonderPlatformResourcePage` and `wonderPlatformResourceEditor` are deleted. |
| D4 | **Free tabs, gated finish.** Steps are always clickable with a completion dot. Only the finish action is gated. The Flow-package tool wizard keeps its existing data-dependent `disabled` gate (`resource-fields.js:265,268`). | `wonderPlatformWizard` needs no gating changes. |
| D5 | **Home = launcher + continue.** Two primary actions plus recently-updated agents and recent conversations. No asset counts on Home. | |
| D6 | **Subagents stay hidden.** Present in seed, normalizer and trace; absent from all nav. Do not touch. | |
| D7 | **Abandon sweep fires only** when the journey is left without the root Agent ever having been saved. Not on later delete. | Root frame carries `createdInJourney`. |
| D8 | **Finish is not gated on having capabilities.** A capability-less agent is legal; the readiness bar says so and the button stays enabled. | |
| D9 | **Evaluation is a journey step** — optional, but a prominent part of the flow. | Fifth step, `evaluate`. |
| D10 | **Pending chips are derived from the stack, not stored.** A parent shows "בבנייה" for any descendant frame whose `attachTo` points at it. | Abandoning a child removes its chip with zero cleanup code. |
| D11 | **`נסה` and `בדיקה` drive the side panel**, they do not replace the main column. Selecting them opens the panel on the matching tab while the main column keeps showing capabilities. | |
| D12 | **Chat context board keeps all four multi-selects**, grouped under a small "חיבורים נוספים" label. | |
| D13 | **One Create Agent experience.** Home's "צור סוכן" and the Agents catalog's "סוכן חדש" run the identical journey. | |
| D14 | **Breadcrumb collapse = truncate each crumb, then middle-ellipsis** into a `…` menu once the row still overflows. | |
| D15 | **Catalog nav group is open iff the current view is a catalog view.** | Keeps the 15 existing `click('כלים')`-style test call sites green, and is the correct behavior anyway. |
| D16 | Component named `wonderPlatformJourney`, not `wonderPlatformBuilder`. State field named `createdInJourney`. | |

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `solutions/pocito/marketplace-ui/wonder-platform-domain.js` | Modify | `wonderPlatformUi`: split `primaryNav` / `catalogNav`, add `catalogViews`, add `journey` copy |
| `solutions/pocito/marketplace-ui/wonder-platform-navigation.js` | Modify | Two nav tiers; catalog group collapsed unless in a catalog view; "סוכן חדש" primary button |
| `solutions/pocito/marketplace-ui/wonder-platform-home.js` | **Create** | `wonderPlatformHome` — two primary actions + continue list |
| `solutions/pocito/marketplace-ui/wonder-platform-journey.js` | **Create** | `wonderPlatformJourney` (frame chrome, body dispatch) + `wonderPlatformJourneyBar` (breadcrumb) |
| `solutions/pocito/marketplace-ui/wonder-platform.js` | Modify | `stack` replaces `workspace` + `editors`; `createAgent`, `finishAgent`, abandon sweep, whole-stack dirty guard |
| `solutions/pocito/marketplace-ui/wonder-platform-workspace.js` | Modify | Loses its own header (moves to journey chrome); agent step set becomes the journey; readiness bar |
| `solutions/pocito/marketplace-ui/wonder-platform-resource-editor.js` | Modify | Delete `wonderPlatformResourceEditor`; keep and improve `wonderPlatformAttachPicker` |
| `solutions/pocito/marketplace-ui/wonder-platform-resource-page.js` | **Delete** | Absorbed by `wonderPlatformJourney` |
| `solutions/pocito/marketplace-ui/wonder-platform-chat.js` | Modify | "חיבורים נוספים" grouping label on the context board |
| `solutions/pocito/marketplace-ui/wonder-agents.js` | Modify | `defaultView: 'home'` |
| `solutions/pocito/marketplace-ui/wonder-platform-tests.js` | Modify | New tests per task; existing tests unchanged (see D15) |

`wonder-platform.js` is 317 lines today and gains the stack logic while shedding the workspace/editors duplication; it should end near the same size. `wonder-platform-workspace.js` is 248 lines and sheds its header. If either passes ~330 lines, split the step definitions into the journey file.

---

### Task 1: Split navigation into primary and catalog tiers

**Files:**
- Modify: `solutions/pocito/marketplace-ui/wonder-platform-domain.js:165-170`
- Modify: `solutions/pocito/marketplace-ui/wonder-platform-navigation.js:10-49`
- Test: `solutions/pocito/marketplace-ui/wonder-platform-tests.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `wonderPlatformUi().primaryNav` is `[['home','House','בית'], ['chat','MessageCircle','צ׳אט']]`; `wonderPlatformUi().catalogNav` is `[['agents','Bot','סוכנים'], ['plugins','PlugZap','פלאגינים'], ['skills','BookOpenText','מיומנויות'], ['tools','Wrench','כלים'], ['knowledge','Database','ידע'], ['evaluations','SquareCheckBig','אבלואציה']]`; `wonderPlatformUi().catalogViews` is `['agents','plugins','skills','tools','knowledge','evaluations']`. `wonderPlatformNavigation` gains prop `createAgent` (a zero-arg function).

- [ ] **Step 1: Write the failing test**

Add to `wonder-platform-tests.js`, after `Test('wonderPlatform.chatContextPanel', ...)`:

```js
Test('wonderPlatform.navTiers', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformTestApp(),
    and(contains('ניהול נכסים'), contains('סוכן חדש'), contains('בית')), {
    userActions: actions(waitForText('פלאגין חדש'), waitForText('ניהול נכסים')), logger: 'uiLogger'})
})
```

- [ ] **Step 2: Run test to verify it fails**

Call the wonder MCP: `runTest({testId: 'wonderPlatform.navTiers'})`.
Expected: FAIL — `ניהול נכסים` is not in the DOM (the group label today is `קטלוג`, `navigation.js:35`).

- [ ] **Step 3: Restructure the nav config**

In `wonder-platform-domain.js`, replace the `primaryNav` / `libraryNav` / `mobileNav` block (lines 165-170) with:

```js
    primaryNav: [['home', 'House', 'בית'], ['chat', 'MessageCircle', 'צ׳אט']],
    catalogNav: [['agents', 'Bot', 'סוכנים'], ['plugins', 'PlugZap', 'פלאגינים'],
      ['skills', 'BookOpenText', 'מיומנויות'], ['tools', 'Wrench', 'כלים'], ['knowledge', 'Database', 'ידע'],
      ['evaluations', 'SquareCheckBig', 'אבלואציה']],
    catalogViews: ['agents', 'plugins', 'skills', 'tools', 'knowledge', 'evaluations'],
```

`mobileNav` is deleted — phone layouts are out of scope per the global constraints.

- [ ] **Step 4: Rewrite the navigation component**

Replace the body of `wonderPlatformNavigation` in `wonder-platform-navigation.js`. Keep the existing `item` renderer and brand block verbatim; change only the composition:

```js
      const {primaryNav, catalogNav, catalogViews, classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const [catalogOpen, setCatalogOpen] = useState(catalogViews.includes(view))
      const fullCatalogNav = [...catalogNav, ...(extraLibraryNav || [])]
```

The `<aside>` body becomes, in order: the brand block (unchanged), then

```js
          newConversation && h(`button:${classes.primary} mt-1 w-full`,
            {onClick: () => newConversation()}, h('L:Plus', {size: 15}), 'שיחה חדשה'),
          createAgent && h(`button:${classes.button} mt-1.5 w-full`,
            {onClick: () => createAgent()}, h('L:Plus', {size: 15}), 'סוכן חדש'),
          h('div:mt-4 space-y-px', {}, primaryNav.map(item)),
          recent.length > 0 && h('div', {}, groupLabel('שיחות אחרונות'),
            h('div:space-y-px', {}, recent.map(conversationRow))),
          h('button:flex w-full items-center justify-between px-2.5 pb-1.5 pt-5 text-[11px] font-medium ' +
            'text-[var(--wp-ink-4)] transition-colors hover:text-[var(--wp-ink-2)]',
          {onClick: () => setCatalogOpen(!catalogOpen), 'aria-expanded': catalogOpen}, 'ניהול נכסים',
          h(`L:${catalogOpen ? 'ChevronUp' : 'ChevronDown'}`, {size: 13})),
          catalogOpen && h('div:space-y-px', {}, fullCatalogNav.map(item))
```

Extract the existing recent-conversation button (lines 39-44) into a named `conversationRow` const above the return so the composition above reads cleanly. Delete the `<nav>` mobile bar (lines 45-49) and the `extraPrimaryNav` prop — `wonder-agents.js` will stop passing it in Task 2.

- [ ] **Step 5: Run tests to verify they pass**

`runTest({testId: 'wonderPlatform.navTiers'})` — expected PASS.
Then the regression set, which exercises the 15 catalog-click call sites:
`runTest({testId: 'wonderPlatform.skillCatalog'})`, `runTest({testId: 'wonderPlatform.toolRules'})`, `runTest({testId: 'wonderPlatform.evaluationCatalog'})`, `runTest({testId: 'wonderPlatform.navGuardPrompts'})`, `runTest({testId: 'wonderPlatform.marketplaceAgentCreateRelations'})` — all expected PASS unchanged, because `wonderPlatformTestApp` still lands on `plugins`, which is in `catalogViews`, so the group starts open (D15).

- [ ] **Step 6: Validate and commit**

```bash
node --check solutions/pocito/marketplace-ui/wonder-platform-domain.js
node --check solutions/pocito/marketplace-ui/wonder-platform-navigation.js
git add solutions/pocito/marketplace-ui/wonder-platform-domain.js \
  solutions/pocito/marketplace-ui/wonder-platform-navigation.js \
  solutions/pocito/marketplace-ui/wonder-platform-tests.js
git commit -m "feat(nav): split primary and catalog navigation tiers"
```

---

### Task 2: Home view

**Files:**
- Create: `solutions/pocito/marketplace-ui/wonder-platform-home.js`
- Modify: `solutions/pocito/marketplace-ui/wonder-platform.js:290-299` (content dispatch), `:6-8` (imports)
- Modify: `solutions/pocito/marketplace-ui/wonder-agents.js:9-13`
- Test: `solutions/pocito/marketplace-ui/wonder-platform-tests.js`

**Interfaces:**
- Consumes: `wonderPlatformUi().catalogViews` from Task 1.
- Produces: `ReactComp('wonderPlatformHome')` taking props `{repo, createAgent, startChat, openItem, openConversation}` where `createAgent()` and `startChat()` are zero-arg, `openItem(resource, item)` matches the existing signature in `wonder-platform.js:122`, and `openConversation(id)` matches `wonder-platform.js:305`.

- [ ] **Step 1: Write the failing test**

```js
Test('wonderPlatform.homeLauncher', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformHomeTestApp(),
    and(contains('מה נעשה היום?'), contains('צור סוכן'), contains('התחל שיחה'),
      contains('סוכן תמיכת לקוחות B2B'), notContains('ארגז הכלים שעומד ברשות הסוכנים')), {
    userActions: actions(waitForText('מה נעשה היום?')), logger: 'uiLogger'})
})
```

And the test app it needs, next to `wonderPlatformTestApp` at `wonder-platform-tests.js:198`:

```js
ReactComp('wonderPlatformHomeTestApp', {
  impl: wonderPlatform({loadRepo: wonderPlatformSeed(), saveRepo: dsls.common.data.wonderPlatformTestSave(),
    defaultView: 'home'})
})
```

- [ ] **Step 2: Run test to verify it fails**

`runTest({testId: 'wonderPlatform.homeLauncher'})`
Expected: FAIL — `wonderPlatformHome` is not registered and `view == 'home'` falls through to the catalog branch.

- [ ] **Step 3: Create the Home component**

New file `solutions/pocito/marketplace-ui/wonder-platform-home.js`:

```js
import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-kit.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformHome', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh}}) => ({repo, createAgent, startChat, openItem, openConversation}) => {
      const {classes, resources} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const mine = (repo.agents || []).filter(item => (item.owner || 'me') != 'global').slice(0, 4)
      const talks = (repo.conversations || []).filter(item => item.messages?.length).slice(0, 4)
      const action = (icon, title, body, onClick, primary) => h(
        `button:${classes.panel} flex flex-1 flex-col items-start gap-2 p-6 text-start transition-colors ` +
        `hover:border-[var(--wp-border-strong)] hover:shadow-[var(--wp-sh-1)] ` +
        (primary ? 'border-[var(--wp-border-strong)]' : ''), {key: title, onClick},
        h('span:grid h-11 w-11 place-items-center rounded-[10px] bg-[var(--wp-ink)] text-white', {},
          h(`L:${icon}`, {size: 20})),
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
      const group = (label, rows) => rows.length > 0 && h('div:min-w-0 flex-1', {},
        h('div:pb-2 text-[11px] font-medium text-[var(--wp-ink-4)]', {}, label),
        h('div:grid gap-px overflow-hidden rounded-[8px] border border-[var(--wp-border)] bg-[var(--wp-border)]',
          {}, rows))
      return h(`main:${classes.page} wp-scroll`, {},
        h('div:mx-auto w-full max-w-[880px] px-8 pb-20 pt-20', {},
          h(`h1:${classes.h1}`, {}, 'מה נעשה היום?'),
          h(`p:mt-1.5 ${classes.body}`, {}, 'בנו סוכן חדש, או פתחו שיחה עם סוכן קיים.'),
          h('div:mt-6 flex gap-3', {},
            action('Bot', 'צור סוכן', 'הגדירו מה הסוכן עושה ובנו לו את היכולות שהוא צריך.', createAgent, true),
            action('MessageCircle', 'התחל שיחה', 'דברו עם סוכן קיים, או פשוט שאלו שאלה.', startChat)),
          h('div:mt-10 flex gap-6', {},
            group('הסוכנים שלי', mine.map(item => row(item.icon || resources.agents.icon, item.name,
              item.desc || '', () => openItem('agents', item)))),
            group('שיחות אחרונות', talks.map(item => row('MessageCircle', item.title,
              item.when || '', () => openConversation(item.id)))))))
    }
  })
})
```

- [ ] **Step 4: Wire it into the shell**

In `wonder-platform.js`, add `import './wonder-platform-home.js'` next to the other view imports (after line 7). Add a `home` branch as the first case of the `content` chain at line 290:

```js
      const content = view == 'home' ? hh(ctx, dsls.react['react-comp'].wonderPlatformHome, {repo,
        createAgent: () => createItem('agents'), startChat: () => newConversation(),
        openItem, openConversation: id => (setConversationId(id), openView('chat'))})
        : view == 'workspace' && workspace ? hh(ctx, ...
```

In `wonder-agents.js`, set `defaultView: 'home'` and delete `extraPrimaryNav` (agents now lives in `catalogNav` from Task 1):

```js
  impl: wonderPlatform({
    defaultView: 'home',
    brand: 'Wonder Agents',
    brandTagline: 'ניהול סוכנים ארגוני',
    brandIcon: 'Bot'
  })
```

Pass `createAgent` down to the nav in the `wonderPlatformNavigation` call at `wonder-platform.js:302`, adding `createAgent: () => createItem('agents')` to its props object and dropping `extraPrimaryNav`.

- [ ] **Step 5: Run tests to verify they pass**

`runTest({testId: 'wonderPlatform.homeLauncher'})` — expected PASS.
`runTest({testId: 'wonderPlatform.navTiers'})` — expected PASS.
`runTest({testId: 'wonderPlatform.chatContextPanel'})` — expected PASS.

- [ ] **Step 6: Validate and commit**

```bash
node --check solutions/pocito/marketplace-ui/wonder-platform-home.js
node --check solutions/pocito/marketplace-ui/wonder-platform.js
node --check solutions/pocito/marketplace-ui/wonder-agents.js
git add solutions/pocito/marketplace-ui/wonder-platform-home.js \
  solutions/pocito/marketplace-ui/wonder-platform.js \
  solutions/pocito/marketplace-ui/wonder-agents.js \
  solutions/pocito/marketplace-ui/wonder-platform-tests.js
git commit -m "feat(home): add launcher view as the wonderAgents landing"
```

---

### Task 3: Replace workspace + editors with one frame stack

This task is a **pure refactor**. The drawer still renders, the workspace still renders, nothing looks different. Every existing test must stay green. Do not change any visual output in this task.

**Files:**
- Modify: `solutions/pocito/marketplace-ui/wonder-platform.js:63-216` and `:290-312`
- Test: `solutions/pocito/marketplace-ui/wonder-platform-tests.js`

**Interfaces:**
- Consumes: `openItem`, `createItem`, `openView` from Task 2's wiring.
- Produces, all inside `wonderPlatform`'s `hFunc`:
  - `frame(resource, item, extra = {}) -> {resource, item, baseline, ...extra}` where `baseline` is `JSON.stringify(item)`
  - `stack: frame[]`, `top = stack.at(-1)`
  - `pushFrame(frame) -> void`, `popFrame() -> void`, `updateTop(valueOrFn) -> void`
  - `attachTo` shape on a frame: `{frameIndex: number, field: string}` — the index of the parent frame in `stack` and the parent field to attach the saved child id into.
  - `stackDirty() -> boolean` — true if any frame's item differs from its baseline.

- [ ] **Step 1: Write the failing test**

```js
Test('wonderPlatform.stackDeepDirtyGuard', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformTestApp(),
    contains('שינויים שלא נשמרו'), {
    userActions: actions(
      waitForText('אנליסט הוכחת קיום'),
      click('אנליסט הוכחת קיום'),
      waitForText('חיבורים'),
      click('חיבורים'),
      wonderPlatformClickInSection('מיומנויות', 'הוספה'),
      waitForText('אישור בחירה'),
      click('מיומנות חדשה'),
      waitForText('הנחיות בסיס'),
      wonderPlatformSetControl({selector: '[aria-label="display_name"]', value: 'מיומנות לא שמורה'}),
      click('aria-label="סגירה"'),
      click('פלאגינים'),
      waitForText('שינויים שלא נשמרו')),
    logger: 'uiLogger'})
})
```

This asserts the guard sees a dirty frame that is **not** the top of the stack — the exact hole at `wonder-platform.js:118`.

- [ ] **Step 2: Run test to verify it fails**

`runTest({testId: 'wonderPlatform.stackDeepDirtyGuard'})`
Expected: FAIL — after closing the skill editor the guard inspects only `editorsRef.current.at(-1)`, sees the clean plugin workspace, and navigates away with no prompt.

- [ ] **Step 3: Introduce the stack, replacing `workspace` and `editors`**

In `wonder-platform.js`, delete the `workspace`, `workspaceDirty`, `editors` and `editorsRef`/`dirtyRef` state (lines 65-68) and replace with:

```js
      const [stack, setStack] = useState([]), stackRef = useRef([])
      const [picker, setPicker] = useState(), [pendingLeave, setPendingLeave] = useState(), [saving, setSaving] = useState(false)
      const viewRef = useRef(view)
      stackRef.current = stack; viewRef.current = view
      const top = stack.at(-1)
      const frame = (resource, item, extra = {}) => ({resource, item, baseline: JSON.stringify(item), ...extra})
      const pushFrame = entry => setStack(current => [...current, entry])
      const popFrame = () => setStack(current => current.slice(0, -1))
      const updateTop = value => setStack(current => current.map((entry, index) => index == current.length - 1
        ? {...entry, item: typeof value == 'function' ? value(entry.item) : value} : entry))
      const stackDirty = () => stackRef.current.some(entry => JSON.stringify(entry.item) != entry.baseline)
```

Replace `requestLeave` (lines 118-120) with:

```js
      const requestLeave = action => stackDirty() ? setPendingLeave(() => action) : action()
```

Delete the now-unused `dirty` helper and `editorEntry`.

- [ ] **Step 4: Route every entry point through the stack**

`openView` (line 121) becomes `const openView = id => requestLeave(() => (setStack([]), navigate(id)))`.

`openItem` (lines 122-128) keeps its marketplace-detail and `skillDraft` logic and ends with a single push instead of the two-way branch:

```js
        setStack([frame(resource, {...item, originalId: item.id},
          {createLabel: config.resources[resource]?.create})]); setView('journey')
```

`createItem` (lines 129-131) becomes:

```js
      const createItem = resource => (setStack([frame(resource, blank(resource),
        {createLabel: config.resources[resource]?.create})]), setView('journey'))
```

`openWorkspaceEditor` and `openEditorPicker` collapse into one pair. Replace both picker openers with:

```js
      const openPicker = (field, resource, label) => setPicker({frameIndex: stack.length - 1, field, resource, label,
        single: config.resources[resource].label, selected: top.item[field] || [], query: ''})
```

and `attachSelected` with:

```js
      const attachSelected = async () => {
        setStack(current => current.map((entry, index) => index == picker.frameIndex
          ? {...entry, item: {...entry.item, [picker.field]: picker.selected}} : entry))
        setPicker()
      }
```

`createNested` (lines 161-165) becomes:

```js
      const createNested = resource => {
        const attachTo = {frameIndex: picker.frameIndex, field: picker.field}
        setPicker(); pushFrame(frame(resource, blank(resource), {attachTo,
          createLabel: resource == 'tools' ? 'כלי חדש ממארז Flow' : config.resources[resource].create}))
      }
```

`openEditor` (used by the workspace relation rows to edit an existing child) becomes a push, preserving the marketplace detail fetch and `skillDraft` from lines 143-150:

```js
        pushFrame(frame(resource, {...draft, originalId: item.id},
          {attachTo: {frameIndex: stack.length - 1, field}, createLabel: config.resources[resource]?.create}))
```

- [ ] **Step 5: Unify the four save paths into one**

Delete `saveWorkspace`, `saveEditor`, `updateBase`, `saveBase`, `deleteWorkspace`, `deleteBase` and `deleteEditor` (lines 132-216). Replace with one pair:

```js
      const saveTop = async () => {
        const active = stack.at(-1), rest = stack.slice(0, -1)
        const skillResult = active.resource == 'skills' && !repo.marketplace && await publishEditedSkill(active.item)
        const saved = skillResult ? skillResult.saved : await saveItem(active.resource, active.item)
        if (!active.attachTo) {
          setStack([frame(active.resource, {...saved, originalId: saved.id}, {createLabel: active.createLabel})])
          flash('נשמר'); return saved
        }
        setStack(rest.map((entry, index) => index == active.attachTo.frameIndex
          ? {...entry, item: {...entry.item, [active.attachTo.field]:
            [...new Set([...(entry.item[active.attachTo.field] || []), saved.id])]}} : entry))
        return saved
      }
      const deleteTop = async () => {
        const active = stack.at(-1)
        if (repo.marketplace && marketResources.includes(active.resource)) await marketplaceCall(ctx.setVars({
          operation: 'delete', resource: active.resource, id: active.item.originalId || active.item.id,
          roomWUrl: repositoryRoomWUrl, marketplaceBaseUrl: marketplaceUrl}))
        await persistRepo({...repo, [active.resource]: repo[active.resource].filter(
          item => item.id != (active.item.originalId || active.item.id))})
        stack.length > 1 ? popFrame() : openView(active.resource)
      }
```

Rewrite `saveAndLeave` (lines 200-202) to use `saveTop`.

- [ ] **Step 6: Render the stack through the existing components**

At line 290, the `workspace`/`editors` branches become one `journey` branch that still renders the **old** components, so nothing changes visually yet:

```js
        : view == 'journey' && top ? (['plugins', 'subagents', 'agents'].includes(top.resource)
          ? hh(ctx, dsls.react['react-comp'].wonderPlatformWorkspace, {workspace: top, repo,
            back: () => stack.length > 1 ? popFrame() : openView(top.resource), saveWorkspace: saveTop,
            deleteWorkspace: deleteTop, openPicker, openEditor, runTarget, runEval, setDirty: () => {}})
          : hh(ctx, dsls.react['react-comp'].wonderPlatformResourcePage, {active: top, update: updateTop,
            save: saveTop, deleteItem: deleteTop, back: () => stack.length > 1 ? popFrame() : openView(top.resource),
            repo, openPicker, loadPackage, saveAndRun, runningSet}))
```

Delete the `wonderPlatformResourceEditor` render at lines 306-308 — a nested frame now renders as a full page through the same branch.

- [ ] **Step 7: Run the full regression set**

```
runTest({testId: 'wonderPlatform.stackDeepDirtyGuard'})   -> PASS (was failing)
runTest({testId: 'wonderPlatform.pluginWorkspace'})       -> PASS
runTest({testId: 'wonderPlatform.navGuardPrompts'})       -> PASS
runTest({testId: 'wonderPlatform.workspaceSavesOnlyFromButton'}) -> PASS
runTest({testId: 'wonderPlatform.flowToolWizard'})        -> PASS
runTest({testId: 'wonderPlatform.marketplaceAgentCreateRelations'}) -> PASS
runTest({testId: 'wonderPlatform.marketplaceSkillEditor'}) -> PASS
runTest({testId: 'wonderPlatform.marketplaceUiAgentE2e'})  -> PASS
runTest({testId: 'wonderPlatform.homeLauncher'})           -> PASS
```

Inspect the `uiLogger` array on each, not only `success`. If any test's actions referenced `aria-label="חזרה לפלאגינים"` or `aria-label="שמירת סביבת עבודה"`, those labels are produced by `wonderPlatformWorkspace` and are unchanged by this task — a failure there means the stack wiring is wrong, not the test.

- [ ] **Step 8: Validate and commit**

```bash
node --check solutions/pocito/marketplace-ui/wonder-platform.js
git add solutions/pocito/marketplace-ui/wonder-platform.js solutions/pocito/marketplace-ui/wonder-platform-tests.js
git commit -m "refactor(platform): replace workspace and editors with one frame stack"
```

---

### Task 4: Journey chrome and breadcrumb

**Files:**
- Create: `solutions/pocito/marketplace-ui/wonder-platform-journey.js`
- Modify: `solutions/pocito/marketplace-ui/wonder-platform.js` (content dispatch from Task 3, imports)
- Modify: `solutions/pocito/marketplace-ui/wonder-platform-workspace.js:220-231` (drop own header)
- Modify: `solutions/pocito/marketplace-ui/wonder-platform-resource-editor.js` (delete `wonderPlatformResourceEditor`)
- Delete: `solutions/pocito/marketplace-ui/wonder-platform-resource-page.js`
- Test: `solutions/pocito/marketplace-ui/wonder-platform-tests.js`

**Interfaces:**
- Consumes: `stack`, `top`, `popFrame`, `updateTop`, `saveTop`, `deleteTop`, `openPicker` from Task 3.
- Produces:
  - `ReactComp('wonderPlatformJourneyBar')` props `{stack, goToDepth}` where `goToDepth(index)` pops the stack back to `index`.
  - `ReactComp('wonderPlatformJourney')` props `{stack, repo, popFrame, goToDepth, updateTop, saveTop, deleteTop, openPicker, openEditor, loadPackage, saveAndRun, runningSet, runTarget, runEval, exit}`. `exit()` leaves the journey entirely.

- [ ] **Step 1: Write the failing test**

```js
Test('wonderPlatform.journeyBreadcrumb', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformTestApp(),
    and(contains('אנליסט הוכחת קיום'), contains('מיומנות חדשה'), notContains('סביבת עבודה')), {
    userActions: actions(
      waitForText('אנליסט הוכחת קיום'),
      click('אנליסט הוכחת קיום'),
      waitForText('חיבורים'),
      click('חיבורים'),
      wonderPlatformClickInSection('מיומנויות', 'הוספה'),
      waitForText('אישור בחירה'),
      click('מיומנות חדשה'),
      waitForText('שמירה וחזרה לאנליסט הוכחת קיום')),
    logger: 'uiLogger'})
})
```

- [ ] **Step 2: Run test to verify it fails**

`runTest({testId: 'wonderPlatform.journeyBreadcrumb'})`
Expected: FAIL — the child frame's save button reads `שמירה`, and no breadcrumb naming the parent exists.

- [ ] **Step 3: Create the journey chrome**

New file `solutions/pocito/marketplace-ui/wonder-platform-journey.js`:

```js
import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-kit.js'
import './wonder-platform-workspace.js'
import './wonder-platform-resource-fields.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformJourneyBar', {
  impl: comp({
    hFunc: (ctx, {react: {h, useState}}) => ({stack, goToDepth}) => {
      const {classes, resources, labels} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const [menuOpen, setMenuOpen] = useState(false)
      const name = entry => entry.item.name?.trim() || entry.createLabel || `${labels[entry.resource]} חדש`
      const crumb = (entry, index, last) => h(
        `button:flex min-w-0 shrink items-center gap-1.5 text-[12px] transition-colors ${last
          ? 'font-medium text-[var(--wp-ink)]' : 'text-[var(--wp-ink-3)] hover:text-[var(--wp-ink)]'}`,
        {key: index, disabled: last, onClick: () => goToDepth(index), title: name(entry)},
        h(`L:${entry.item.icon || resources[entry.resource]?.icon || 'Dot'}`, {size: 13, className: 'shrink-0'}),
        h('span:max-w-[14ch] truncate', {}, name(entry)))
      const sep = key => h('L:ChevronLeft', {key, size: 13, className: 'shrink-0 text-[var(--wp-ink-4)]'})
      const hidden = stack.slice(1, -2)
      const shown = stack.length > 3 ? [[stack[0], 0], ...stack.slice(-2).map((entry, offset) =>
        [entry, stack.length - 2 + offset])] : stack.map((entry, index) => [entry, index])
      return h('div:relative flex items-center gap-1.5 overflow-hidden', {},
        ...shown.flatMap(([entry, index], position) => {
          const isGap = stack.length > 3 && position == 1
          return [position > 0 && sep(`s${index}`),
            isGap && h(`button:${classes.chip} shrink-0`, {key: 'gap', 'aria-label': 'שלבים נוספים',
              onClick: () => setMenuOpen(!menuOpen)}, '…'),
            isGap && sep(`sg${index}`),
            crumb(entry, index, index == stack.length - 1)]
        }),
        menuOpen && hidden.length > 0 && h(`div:${classes.dialog} absolute top-7 z-40 min-w-[180px] p-1`, {},
          hidden.map((entry, offset) => h('button:flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 ' +
            'text-start text-[12px] text-[var(--wp-ink-2)] transition-colors hover:bg-[var(--wp-surface-2)]',
          {key: offset, onClick: () => (setMenuOpen(false), goToDepth(offset + 1))},
          h(`L:${entry.item.icon || resources[entry.resource]?.icon || 'Dot'}`, {size: 13}),
          h('span:min-w-0 flex-1 truncate', {}, name(entry))))))
    }
  })
})
```

Append `wonderPlatformJourney` to the same file:

```js
ReactComp('wonderPlatformJourney', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh, useState}}) => props => {
      const {stack, repo, popFrame, goToDepth, updateTop, saveTop, deleteTop, openPicker, openEditor,
        loadPackage, saveAndRun, runningSet, runTarget, runEval, exit} = props
      const {classes, labels, resources} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const [confirmDelete, setConfirmDelete] = useState(false)
      const active = stack.at(-1), {resource, item} = active, parent = stack.at(-2)
      const parentName = parent && (parent.item.name?.trim() || `${labels[parent.resource]} חדש`)
      const isComposite = ['plugins', 'subagents', 'agents'].includes(resource)
      const readOnlyTool = resource == 'tools' && item.originalId && item.kind != 'flow'
      const saveDisabled = !item.name?.trim() || !item.id?.trim()
        || (resource == 'tools' && (!item.packageId?.trim() || !item.apiDescription?.trim()
          || !item.desc?.trim() || !item.outputCubes?.length))
        || (resource == 'skills' && !repo.marketplace && (!item.content?.trim()
          || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(item.publishVersion)))
        || (isComposite && (!item.apiDescription?.trim() || !item.desc?.trim()
          || !(resource == 'plugins' ? item.readme : item.instructions)?.trim()))
      const canDelete = !readOnlyTool && item.originalId && (resource != 'skills' || repo.marketplace)
      const saveLabel = parent ? `שמירה וחזרה ל${parentName}` : 'שמירה'
      return h(`main:${classes.page} wp-scroll overflow-x-hidden`, {},
        h('header:sticky top-0 z-30 border-b border-[var(--wp-border)] bg-[var(--wp-surface)]/92 px-5 backdrop-blur',
          {},
          h('div:flex h-[64px] items-center gap-3', {},
            h(`button:${classes.icon} -mr-1.5`, {onClick: () => parent ? popFrame() : exit(),
              'aria-label': parent ? `חזרה ל${parentName}` : `חזרה ל${resources[resource]?.title || ''}`},
              h('L:ChevronRight', {size: 17})),
            hh(ctx, dsls.react['react-comp'].wonderPlatformMark,
              {icon: item.icon || resources[resource]?.icon, text: item.mark, size: 'sm'}),
            h('div:min-w-0 flex-1', {},
              h('h1:truncate text-[15px] font-semibold text-[var(--wp-ink)]',
                {title: item.name || ''}, item.name || active.createLabel || `${labels[resource]} חדש`),
              h('p:truncate text-[12px] text-[var(--wp-ink-4)]', {dir: 'auto'}, item.id || '')),
            readOnlyTool && h(`span:${classes.chip}`, {}, 'לקריאה בלבד'),
            canDelete && h(`button:${classes.icon} hover:bg-[var(--wp-danger-soft)] hover:text-[var(--wp-danger)]`,
              {onClick: () => setConfirmDelete(true), 'aria-label': `מחיקת ${item.name || ''}`},
              h('L:Trash2', {size: 16})),
            !readOnlyTool && h(`button:${classes.primary}`, {disabled: saveDisabled, onClick: saveTop,
              'aria-label': 'שמירת המסע'}, saveLabel)),
          stack.length > 1 && h('div:flex items-center gap-2 pb-2.5', {},
            h('span:shrink-0 text-[11px] text-[var(--wp-ink-4)]', {}, 'נבנה עבור'),
            hh(ctx, dsls.react['react-comp'].wonderPlatformJourneyBar, {stack, goToDepth}))),
        isComposite
          ? hh(ctx, dsls.react['react-comp'].wonderPlatformWorkspace, {workspace: active, stack, repo,
            saveWorkspace: saveTop, openPicker, openEditor, runTarget, runEval, update: updateTop})
          : h('div:mx-auto max-w-[820px] px-6 pb-24 pt-7', {},
            hh(ctx, dsls.react['react-comp'].wonderPlatformResourceFields,
              {resource, item, update: updateTop, repo, loadPackage, openPicker, saveAndRun, runningSet})),
        confirmDelete && hh(ctx, dsls.react['react-comp'].wonderPlatformDialog, {title: 'מחיקת פריט',
          body: `למחוק לצמיתות את "${item.name || item.id}"? לא ניתן לשחזר פעולה זו.`,
          close: () => setConfirmDelete(false),
          actions: [['מחיקה', () => (setConfirmDelete(false), deleteTop()), 'danger'],
            ['ביטול', () => setConfirmDelete(false)]]}))
    }
  })
})
```

- [ ] **Step 4: Strip the workspace's own chrome**

In `wonder-platform-workspace.js`, delete the `wonderPlatformDetailHeader` call and the `confirmDelete` dialog (lines 221-231 and 242-245), along with the `confirmDelete`, `back`, `deleteWorkspace`, `backLabels`, `saveWorkspaceDisabled` and `setDirty` locals that only served them. The component's return becomes the `h('div:flex min-h-[calc(100vh-64px)] ...')` block directly. Keep `draft` state, the wizard, and the side panel exactly as they are; keep the `useEffect` that resyncs `draft` from `workspace.item`.

Replace the internal `setDraft` calls' persistence path: the component keeps local `draft` state for now and still calls `saveWorkspace(draft)`; Task 5 lifts `draft` into the frame.

- [ ] **Step 5: Delete the two obsolete surfaces**

```bash
git rm solutions/pocito/marketplace-ui/wonder-platform-resource-page.js
```

In `wonder-platform-resource-editor.js`, delete the entire `ReactComp('wonderPlatformResourceEditor', ...)` block (lines 64-91) and the now-unused `labels` destructure. `wonderPlatformAttachPicker` stays.

In `wonder-platform.js`: drop `import './wonder-platform-resource-page.js'`, add `import './wonder-platform-journey.js'`, and replace the Task 3 journey branch with a single call:

```js
        : view == 'journey' && top ? hh(ctx, dsls.react['react-comp'].wonderPlatformJourney, {stack, repo,
          popFrame, goToDepth: index => setStack(stack.slice(0, index + 1)), updateTop, saveTop, deleteTop,
          openPicker, openEditor, loadPackage, saveAndRun, runningSet, runTarget, runEval,
          exit: () => openView(stack[0].resource)})
```

- [ ] **Step 6: Run tests**

```
runTest({testId: 'wonderPlatform.journeyBreadcrumb'})     -> PASS (was failing)
runTest({testId: 'wonderPlatform.stackDeepDirtyGuard'})   -> PASS
runTest({testId: 'wonderPlatform.pluginWorkspace'})       -> PASS
runTest({testId: 'wonderPlatform.flowToolWizard'})        -> PASS
runTest({testId: 'wonderPlatform.marketplaceSkillEditor'}) -> PASS
runTest({testId: 'wonderPlatform.marketplaceToolEditor'})  -> PASS
runTest({testId: 'wonderPlatform.marketplaceUiAgentE2e'})  -> PASS
```

`workspaceSavesOnlyFromButton` and `navGuardPrompts` reference `aria-label="חזרה לפלאגינים"` and `aria-label="שמירת סביבת עבודה"`, both of which this task removed. Update those two tests to the new labels: `aria-label="חזרה לפלאגינים"` becomes `aria-label="חזרה לפלאגינים"` only when at depth 0 — the journey header emits `חזרה ל${resources[resource].title}`, so for plugins it is `חזרה לפלאגינים` and stays valid; `aria-label="שמירת סביבת עבודה"` becomes `aria-label="שמירת המסע"`. Make that one substitution in both tests and rerun them.

- [ ] **Step 7: Validate and commit**

```bash
node --check solutions/pocito/marketplace-ui/wonder-platform-journey.js
node --check solutions/pocito/marketplace-ui/wonder-platform-workspace.js
node --check solutions/pocito/marketplace-ui/wonder-platform-resource-editor.js
node --check solutions/pocito/marketplace-ui/wonder-platform.js
git add -A solutions/pocito/marketplace-ui
git commit -m "feat(journey): full-page frame chrome with breadcrumb, drop nested drawer"
```

---

### Task 5: The Create Agent journey

**Files:**
- Modify: `solutions/pocito/marketplace-ui/wonder-platform-workspace.js:162-213` (step definitions), `:18-21` (panel state)
- Modify: `solutions/pocito/marketplace-ui/wonder-platform.js` (`finishAgent`)
- Test: `solutions/pocito/marketplace-ui/wonder-platform-tests.js`

**Interfaces:**
- Consumes: `saveTop` from Task 3, `wonderPlatformJourney` from Task 4.
- Produces: `wonderPlatformWorkspace` accepts new prop `finishAgent(item)`; `wonderPlatform` exposes `finishAgent(item) -> Promise<void>` which saves the item, creates a conversation bound to `saved.id`, and switches to the chat view.

- [ ] **Step 1: Write the failing test**

```js
Test('wonderPlatform.agentJourneySteps', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformHomeTestApp(),
    and(contains('מי הסוכן'), contains('יכולות'), contains('נסה'), contains('בדיקה'),
      contains('אין עדיין יכולות')), {
    userActions: actions(
      waitForText('מה נעשה היום?'),
      click('צור סוכן'),
      waitForText('מי הסוכן'),
      click('יכולות'),
      waitForText('אין עדיין יכולות')),
    logger: 'uiLogger'})
})
```

- [ ] **Step 2: Run test to verify it fails**

`runTest({testId: 'wonderPlatform.agentJourneySteps'})`
Expected: FAIL — the steps are today `כללי` / `הנחיות` / `חיבורים` and there is no readiness bar.

- [ ] **Step 3: Rename and extend the agent step set**

In `wonder-platform-workspace.js`, the `steps` array (line 162) becomes resource-aware. For `agents`:

```js
      const agentStepLabels = [['identity', 'מי הסוכן'], ['instructions', 'הנחיות'], ['capabilities', 'יכולות'],
        ['try', 'נסה'], ['evaluate', 'בדיקה']]
```

`identity` renders today's `general` body, `instructions` renders today's `instructions` body, `capabilities` renders today's `connections` body. `try` and `evaluate` both render the **capabilities** body (D11) — they exist to drive the panel. Wire that in the step handler passed to the wizard:

```js
      const onStep = id => {
        setStepId(id)
        if (id == 'try') { setPanelOpen(true); setTab('test') }
        if (id == 'evaluate') { setPanelOpen(true); setTab('evaluation') }
      }
```

For `plugins` and `subagents`, keep the existing three labels unchanged so their tests stay green.

- [ ] **Step 4: Add the completion dot and the readiness bar**

Give each agent step a `done` flag and render it in `wonderPlatformWizard`. In `wonder-platform-wizard.js`, add to the nav button, after `step.label`:

```js
          step.done && h('span:ms-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--wp-ink-3)]')
```

`done` for each agent step: `identity` → `draft.name?.trim() && draft.desc?.trim() && draft.apiDescription?.trim()`; `instructions` → `draft.instructions?.trim()`; `capabilities` → any of `pluginIds`/`skillIds`/`toolIds`/`knowledgeIds` non-empty; `try` → `runs.length > 0`; `evaluate` → `!!lastRun`.

Below the wizard in the main column, for `agents` only, add the readiness bar modelled on `resource-fields.js:305-310`:

```js
      const capabilityCount = ['pluginIds', 'skillIds', 'toolIds', 'knowledgeIds']
        .reduce((total, field) => total + (draft[field] || []).length, 0)
      const readyNote = !draft.name?.trim() ? 'הוסיפו שם לסוכן'
        : !draft.apiDescription?.trim() || !draft.desc?.trim() ? 'הוסיפו תיאור לסוכן'
        : !draft.instructions?.trim() ? 'הוסיפו הנחיות מערכת'
        : capabilityCount == 0 ? 'אין עדיין יכולות — הסוכן יענה מהמודל בלבד' : 'הסוכן מוכן'
      const finishDisabled = !draft.name?.trim() || !draft.id?.trim() || !draft.apiDescription?.trim()
        || !draft.desc?.trim() || !draft.instructions?.trim()
      const readinessBar = h('div:sticky bottom-4 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 ' +
        `rounded-[12px] border border-[var(--wp-border-strong)] ${classes.panel.replace('rounded-[12px] border border-[var(--wp-border)] ', '')} p-4 shadow-[var(--wp-sh-2)]`, {},
        h('p:text-[12px] text-[var(--wp-ink-3)]', {}, readyNote),
        h(`button:${classes.primary}`, {disabled: finishDisabled, onClick: () => finishAgent(draft),
          'aria-label': 'סיום ומעבר לשיחה'}, 'סיום · שוחח עם הסוכן'))
```

Per D8 the button is enabled with zero capabilities; only the identity and instructions fields gate it.

- [ ] **Step 5: Implement `finishAgent`**

In `wonder-platform.js`, add next to `newConversation`:

```js
      const finishAgent = async item => {
        const saved = await saveTop.call(null, item) || await saveItem('agents', item)
        setStack([]); await newConversation(saved.id)
      }
```

Simplify: `saveTop` already reads from the stack, so pass the draft up first. Change `saveTop` to accept an optional item override — `const saveTop = async (override) => { const active = {...stack.at(-1), item: override || stack.at(-1).item}, ... }` — and then:

```js
      const finishAgent = async item => { const saved = await saveTop(item); setStack([]); await newConversation(saved.id) }
```

Pass `finishAgent` through `wonderPlatformJourney` into `wonderPlatformWorkspace`.

- [ ] **Step 6: Run tests**

```
runTest({testId: 'wonderPlatform.agentJourneySteps'})     -> PASS (was failing)
runTest({testId: 'wonderPlatform.journeyBreadcrumb'})     -> PASS
runTest({testId: 'wonderPlatform.pluginWorkspace'})       -> PASS
runTest({testId: 'wonderPlatform.marketplaceAgentWorkspace'}) -> PASS
runTest({testId: 'wonderPlatform.marketplaceAgentCreate'})    -> PASS
runTest({testId: 'wonderPlatform.marketplaceAgentCreateRelations'}) -> PASS
```

`marketplaceAgentWorkspace` and `marketplaceAgentCreateRelations` click `חיבורים`; update both to click `יכולות`. `marketplaceAgentCreate` waits for `חיבורים`; update to `יכולות`. Make those substitutions and rerun.

- [ ] **Step 7: Validate and commit**

```bash
node --check solutions/pocito/marketplace-ui/wonder-platform-workspace.js
node --check solutions/pocito/marketplace-ui/wonder-platform-wizard.js
node --check solutions/pocito/marketplace-ui/wonder-platform.js
git add -A solutions/pocito/marketplace-ui
git commit -m "feat(journey): agent creation steps, readiness bar and finish-to-chat"
```

---

### Task 6: Pending capability chips and the abandon sweep

**Files:**
- Modify: `solutions/pocito/marketplace-ui/wonder-platform-workspace.js` (`relationGroup`)
- Modify: `solutions/pocito/marketplace-ui/wonder-platform.js` (`createdInJourney`, sweep dialog)
- Test: `solutions/pocito/marketplace-ui/wonder-platform-tests.js`

**Interfaces:**
- Consumes: `stack` and `frame.attachTo` from Task 3, `wonderPlatformJourney` from Task 4.
- Produces: `wonderPlatformWorkspace` accepts prop `stack` and derives pending rows from it — no new state. Root frame carries `createdInJourney: string[]`.

- [ ] **Step 1: Write the failing test**

```js
Test('wonderPlatform.pendingCapabilityChip', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformTestApp(),
    contains('בבנייה'), {
    userActions: actions(
      waitForText('אנליסט הוכחת קיום'),
      click('אנליסט הוכחת קיום'),
      waitForText('חיבורים'),
      click('חיבורים'),
      wonderPlatformClickInSection('מיומנויות', 'הוספה'),
      waitForText('אישור בחירה'),
      click('מיומנות חדשה'),
      waitForText('שמירה וחזרה לאנליסט הוכחת קיום'),
      click('aria-label="חזרה לאנליסט הוכחת קיום"'),
      waitForText('חיבורים')),
    logger: 'uiLogger'})
})
```

Note this test asserts the chip is **gone** after backing out (D10 + Q4 round 2: silent removal). Invert it: the assertion is `notContains('בבנייה')` at the end. Write it as two tests — one asserting the chip appears while deep, one asserting it vanishes on abandon:

```js
Test('wonderPlatform.pendingCapabilityChip', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformTestApp(), contains('בבנייה'), {
    userActions: actions(
      waitForText('אנליסט הוכחת קיום'), click('אנליסט הוכחת קיום'), waitForText('חיבורים'), click('חיבורים'),
      wonderPlatformClickInSection('מיומנויות', 'הוספה'), waitForText('אישור בחירה'), click('מיומנות חדשה'),
      waitForText('שמירה וחזרה לאנליסט הוכחת קיום'), click('aria-label="שלבים נוספים"')),
    logger: 'uiLogger'})
})

Test('wonderPlatform.pendingChipClearsOnAbandon', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformTestApp(), notContains('בבנייה'), {
    userActions: actions(
      waitForText('אנליסט הוכחת קיום'), click('אנליסט הוכחת קיום'), waitForText('חיבורים'), click('חיבורים'),
      wonderPlatformClickInSection('מיומנויות', 'הוספה'), waitForText('אישור בחירה'), click('מיומנות חדשה'),
      waitForText('שמירה וחזרה לאנליסט הוכחת קיום'),
      click('aria-label="חזרה לאנליסט הוכחת קיום"'), waitForText('חיבורים')),
    logger: 'uiLogger'})
})
```

The first test's final action needs the chip visible on a screen that is *below* the current frame, which it is not. Correct approach: the chip is visible on the parent frame, so assert it by going deeper and then using `goToDepth` via the breadcrumb to return **without** abandoning. Replace the first test's last two actions with `click('אנליסט הוכחת קיום')` (the breadcrumb crumb) — but that pops the frame too. Since the chip is only ever visible while a descendant frame exists and the parent is not rendered, **the chip must instead be rendered on the child's context ribbon**, not the parent's row list. Adjust the design accordingly in Step 3.

- [ ] **Step 2: Run tests to verify they fail**

`runTest({testId: 'wonderPlatform.pendingChipClearsOnAbandon'})` — expected PASS trivially (nothing renders `בבנייה` yet); this is the guard against regression, not the driver.
`runTest({testId: 'wonderPlatform.pendingCapabilityChip'})` — expected FAIL.

- [ ] **Step 3: Render the pending relation inline on the parent's rows**

`relationGroup` in `wonder-platform-workspace.js` gains a pending row derived from `stack`. Add above `relationGroup`:

```js
      const myIndex = (stack || []).indexOf(workspace)
      const pendingFor = field => (stack || []).filter(entry => entry.attachTo?.frameIndex == myIndex
        && entry.attachTo?.field == field)
```

and inside `relationGroup`, before `addRow`:

```js
        const pendingRows = pendingFor(field).map((entry, index) => h(
          'div:flex items-center gap-3 px-4 py-2.5 opacity-70', {key: `pending-${index}`},
          h('span:grid h-9 w-9 shrink-0 place-items-center rounded-[8px] border border-dashed ' +
            'border-[var(--wp-border-strong)]', {}, h('L:Loader2', {size: 14})),
          h('div:min-w-0 flex-1', {}, h('b:block truncate text-[13px] text-[var(--wp-ink)]', {},
            entry.item.name?.trim() || entry.createLabel),
            h(`span:${classes.chip} mt-0.5`, {}, 'בבנייה'))))
```

and include `pendingRows` in the group body between the item rows and `addRow`. Because `pendingFor` reads the live stack, abandoning a child removes its frame and the chip disappears with no cleanup code (D10).

The parent frame is not rendered while a child frame is on top — so the chip is visible when you navigate back up via the breadcrumb `goToDepth` **without** popping, which the journey bar does not currently support. Change `goToDepth` in `wonder-platform.js` to preserve deeper frames only if the target is the last frame; otherwise it truncates. Given that, the chip's real purpose is the moment **after** you return from a save — at which point the child is real, not pending. Therefore render the pending row for the frame that is one level *below* the top, and show it in the journey's context ribbon instead: in `wonderPlatformJourney`, next to the breadcrumb, add

```js
            h('span:shrink-0 text-[11px] text-[var(--wp-ink-4)]', {},
              `${labels[resource]} זה יתחבר ל${parentName} · בבנייה`)
```

when `parent` exists. That is the continuity cue at the depth where it is actually visible.

- [ ] **Step 4: Track and sweep journey-created assets**

In `wonder-platform.js`, in `saveTop`, when `active.attachTo` exists, record the id on the root frame:

```js
        setStack(current => current.map((entry, index) => index == 0
          ? {...entry, createdInJourney: [...(entry.createdInJourney || []),
            ...(active.item.originalId ? [] : [{resource: active.resource, id: saved.id, name: saved.name}])]}
          : entry))
```

merged into the same `setStack` call that performs the attach.

Add the sweep to `exit`. Replace the journey `exit` prop with:

```js
        exit: () => { const root = stack[0], created = root.createdInJourney || []
          if (!root.item.originalId && created.length > 0) return setSweep({created, leave: () => openView(root.resource)})
          openView(root.resource) }
```

with `const [sweep, setSweep] = useState()` and a dialog rendered next to `pendingLeave`:

```js
      sweep && hh(ctx, dsls.react['react-comp'].wonderPlatformDialog, {title: 'נכסים שנוצרו במסע',
        body: `נוצרו ${sweep.created.length} נכסים חדשים במסע הזה, אבל הסוכן לא נשמר. מה לעשות איתם?`,
        close: () => setSweep(),
        actions: [['להשאיר בקטלוג', () => (setSweep(), sweep.leave()), true],
          ['למחוק', async () => { for (const entry of sweep.created)
            await persistRepo({...repo, [entry.resource]: repo[entry.resource].filter(item => item.id != entry.id)})
            setSweep(); sweep.leave() }]]})
```

Per D7 this fires only when the root was never saved.

- [ ] **Step 5: Run tests**

```
runTest({testId: 'wonderPlatform.pendingCapabilityChip'})       -> PASS
runTest({testId: 'wonderPlatform.pendingChipClearsOnAbandon'})  -> PASS
runTest({testId: 'wonderPlatform.journeyBreadcrumb'})           -> PASS
runTest({testId: 'wonderPlatform.agentJourneySteps'})           -> PASS
runTest({testId: 'wonderPlatform.stackDeepDirtyGuard'})         -> PASS
```

Add one test for the sweep:

```js
Test('wonderPlatform.abandonSweepPrompts', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformHomeTestApp(), contains('נכסים שנוצרו במסע'), {
    userActions: actions(
      waitForText('מה נעשה היום?'), click('צור סוכן'), waitForText('מי הסוכן'), click('יכולות'),
      wonderPlatformClickInSection('ידע', 'הוספה'), waitForText('אישור בחירה'), click('ידע חדש'),
      wonderPlatformSetControl({selector: '[aria-label="display_name"]', value: 'ידע מהמסע'}),
      wonderPlatformSetControl({selector: '[dir="ltr"]', value: 'journeyKnowledge'}),
      click('aria-label="שמירת המסע"'), waitForText('יכולות'),
      click('aria-label="חזרה לסוכנים"'), waitForText('נכסים שנוצרו במסע')),
    logger: 'uiLogger'})
})
```

- [ ] **Step 6: Validate and commit**

```bash
node --check solutions/pocito/marketplace-ui/wonder-platform-workspace.js
node --check solutions/pocito/marketplace-ui/wonder-platform.js
git add -A solutions/pocito/marketplace-ui
git commit -m "feat(journey): pending capability cue and abandoned-asset sweep"
```

---

### Task 7: Promote "build new" in the attach picker

**Files:**
- Modify: `solutions/pocito/marketplace-ui/wonder-platform-resource-editor.js:33-59`
- Test: `solutions/pocito/marketplace-ui/wonder-platform-tests.js`

**Interfaces:**
- Consumes: `createNested(resource)` from Task 3.
- Produces: no new interface. The picker's footer gains a secondary button with `aria-label` `בניית ${picker.single} חדש`.

- [ ] **Step 1: Write the failing test**

```js
Test('wonderPlatform.pickerPromotesBuildNew', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformTestApp(),
    and(contains('הנחיות בסיס'), notContains('אישור בחירה')), {
    userActions: actions(
      waitForText('אנליסט הוכחת קיום'), click('אנליסט הוכחת קיום'), waitForText('חיבורים'), click('חיבורים'),
      wonderPlatformClickInSection('מיומנויות', 'הוספה'), waitForText('אישור בחירה'),
      click('aria-label="בניית מיומנות חדש"'), waitForText('הנחיות בסיס')),
    logger: 'uiLogger'})
})
```

- [ ] **Step 2: Run test to verify it fails**

`runTest({testId: 'wonderPlatform.pickerPromotesBuildNew'})`
Expected: FAIL — no element has that `aria-label`; "build new" is only the trailing list row.

- [ ] **Step 3: Move build-new into the footer**

In `wonder-platform-resource-editor.js`, delete the `createRow` const and its use in the list body, and add to the footer's left group, before the cancel button:

```js
              h(`button:${classes.button}`, {onClick: () => createNested(picker.resource),
                'aria-label': `בניית ${picker.single} חדש`},
                h('L:Plus', {size: 14}),
                picker.resource == 'tools' ? 'כלי חדש ממארז Flow' : `${picker.single} חדש`),
```

Keep the empty-state message in the list body; when the list is empty the footer button is the only path forward, which is correct.

- [ ] **Step 4: Run tests**

```
runTest({testId: 'wonderPlatform.pickerPromotesBuildNew'})     -> PASS
runTest({testId: 'wonderPlatform.pendingCapabilityChip'})      -> PASS
runTest({testId: 'wonderPlatform.abandonSweepPrompts'})        -> PASS
runTest({testId: 'wonderPlatform.marketplaceAgentCreateRelations'}) -> PASS
```

`pendingCapabilityChip` and `abandonSweepPrompts` click `מיומנות חדשה` / `ידע חדש` as a list row. Those strings are now on the footer button; the click matcher finds them either way, so no edit is needed — confirm by running them, and only if they fail, switch those actions to the `aria-label` form.

- [ ] **Step 5: Validate and commit**

```bash
node --check solutions/pocito/marketplace-ui/wonder-platform-resource-editor.js
git add -A solutions/pocito/marketplace-ui
git commit -m "feat(picker): promote build-new to a footer action"
```

---

### Task 8: Group the chat context board's extra selects

**Files:**
- Modify: `solutions/pocito/marketplace-ui/wonder-platform-chat.js:72-77`
- Test: `solutions/pocito/marketplace-ui/wonder-platform-tests.js`

**Interfaces:**
- Consumes: nothing.
- Produces: no new interface.

- [ ] **Step 1: Write the failing test**

```js
Test('wonderPlatform.chatBoardGroupsExtras', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformTestApp(),
    and(contains('במה נתחיל?'), contains('חיבורים נוספים'), contains('התחלות מהירות')), {
    userActions: actions(waitForText('פלאגין חדש'), click('שיחה חדשה'), waitForText('במה נתחיל?')),
    logger: 'uiLogger'})
})
```

- [ ] **Step 2: Run test to verify it fails**

`runTest({testId: 'wonderPlatform.chatBoardGroupsExtras'})`
Expected: FAIL — `חיבורים נוספים` is not rendered.

- [ ] **Step 3: Add the grouping label**

In `wonderPlatformChatContextBoard`, replace the tile row (line 77) with a labelled group. All four selects stay visible (D12):

```js
        h('div:mt-5', {},
          h('div:pb-2 text-[11px] font-medium text-[var(--wp-ink-4)]', {}, 'חיבורים נוספים'),
          h('div:flex gap-2', {}, tile(pluginRow), ...restRows.map(tile))),
```

- [ ] **Step 4: Run tests**

```
runTest({testId: 'wonderPlatform.chatBoardGroupsExtras'}) -> PASS
runTest({testId: 'wonderPlatform.chatContextPanel'})      -> PASS
runTest({testId: 'wonderPlatform.chatRunsSelectedAgent'}) -> PASS
```

- [ ] **Step 5: Validate and commit**

```bash
node --check solutions/pocito/marketplace-ui/wonder-platform-chat.js
git add -A solutions/pocito/marketplace-ui
git commit -m "feat(chat): group extra context selects under a label"
```

---

### Task 9: End-to-end verification

**Files:**
- Modify: `solutions/pocito/marketplace-ui/wonder-platform-tests.js`

**Interfaces:**
- Consumes: everything from Tasks 1-8.
- Produces: `Test('wonderPlatform.journeyE2e')`.

- [ ] **Step 1: Write the full-journey node test**

```js
Test('wonderPlatform.journeyE2e', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformHomeTestApp(),
    and(contains('סוכן המסע'), contains('שיחה · סוכן המסע')), {
    userActions: actions(
      waitForText('מה נעשה היום?'),
      click('צור סוכן'),
      waitForText('מי הסוכן'),
      wonderPlatformSetControl({selector: '[aria-label="display_name"]', value: 'סוכן המסע'}),
      wonderPlatformSetControl({selector: '[aria-label="id"]', value: 'journeyAgent'}),
      wonderPlatformSetControl({selector: '[aria-label="description"]', value: 'journey agent'}),
      click('הנחיות'),
      wonderPlatformSetControl({selector: '[aria-label="system_prompt"]', value: 'ענה על בסיס המקורות'}),
      click('יכולות'),
      wonderPlatformClickInSection('פלאגינים', 'הוספה'),
      waitForText('אישור בחירה'),
      click('aria-label="בניית פלאגין חדש"'),
      waitForText('שמירה וחזרה לסוכן המסע'),
      wonderPlatformSetControl({selector: '[aria-label="display_name"]', value: 'פלאגין המסע'}),
      click('aria-label="שמירת המסע"'),
      waitForText('יכולות'),
      click('aria-label="סיום ומעבר לשיחה"'),
      waitForText('שיחה · סוכן המסע')),
    logger: 'uiLogger'})
})
```

Fill the remaining mandatory fields the readiness bar requires (`hebrew_description`) with `wonderPlatformSetControl` before clicking finish — check `readyNote` in the logger output if the finish button is disabled.

- [ ] **Step 2: Run it**

`runTest({testId: 'wonderPlatform.journeyE2e'})` — expected PASS, and the `uiLogger` array must contain no error entries. Inspect the logs, not only `success`.

- [ ] **Step 3: Run the whole suite**

Run every `wonderPlatform.*` test through `.jb6/entry-points-pocito.js`. All must pass with empty logger error arrays.

- [ ] **Step 4: Browser walk**

Start the dev server and use `playwrightHarvest` against `http://localhost:3000/room/demo/applet/wonderAgents` with `uiLogger`, walking: Home → צור סוכן → יכולות → build a Plugin → inside it build a Skill → inside that build a Tool → save back up all three levels → verify the breadcrumb at every depth names the full chain → finish → land in chat bound to the agent. Read the console logs; a green node test does not prove the browser path works.

- [ ] **Step 5: Screenshots at both ends of the supported range**

```bash
node take-screenshot.js http://localhost:3000/room/demo/applet/wonderAgents
```

Capture Home, the capabilities step, and depth-3 (Agent → Plugin → Skill → Tool) at **1280x800** and at **1920x1080**. Save to the scratchpad and view each one. Check: no horizontal overflow at 1280; the breadcrumb collapses to `…` at depth 3 rather than pushing the save button off-screen; the side panel collapses rather than the main column if the three columns do not fit.

- [ ] **Step 6: Commit**

```bash
git add solutions/pocito/marketplace-ui/wonder-platform-tests.js
git commit -m "test(journey): end-to-end agent creation journey"
```

---

## Acceptance Criteria

- A new user lands on Home, never on a grid.
- "צור סוכן" reaches a screen asking what the agent should be able to do within two fields.
- Agent → Plugin → Skill → Tool is reachable without opening any catalog.
- At every depth the breadcrumb shows the full chain, truncated per crumb, collapsing to `…` when it still overflows at 1280; every crumb navigates.
- No overlay or drawer anywhere in the creation path.
- Saving a Tool at depth 3 returns to the Skill at depth 2 with the tool attached and the Skill draft intact, and the same holds at every level up to the Agent.
- The child frame's primary button reads "שמירה וחזרה ל<parent>", and the context ribbon names the parent.
- Unsaved changes anywhere in the stack prompt on leave, not only on the top frame.
- Abandoning a journey whose root Agent was never saved prompts to keep or delete the assets created during it.
- Finishing an agent opens a conversation bound to it.
- Every catalog is reachable in at most two clicks from the "ניהול נכסים" group.
- 1280x800 and 1920x1080 both render with no horizontal overflow.
- Every `wonderPlatform.*` test passes with empty logger error arrays.

## Self-Review Notes

- **Spec coverage:** D1→Task 6; D2→Task 5 step 3; D3→Task 4; D4→Task 5 step 4; D5→Task 2; D6→untouched by design; D7→Task 6 step 4; D8→Task 5 step 4; D9→Task 5 step 3; D10→Task 6 step 3; D11→Task 5 step 3; D12→Task 8; D13→Task 2 (both entries call `createItem('agents')`); D14→Task 4 step 3; D15→Task 1 step 3; D16→Tasks 4 and 6.
- **Known wrinkle, resolved in Task 6 Step 3:** the pending chip cannot render on a parent frame that is not on screen. The design lands on a context ribbon in the journey header instead. The `pendingFor` helper is still written because it is the correct source for the parent's row list once `goToDepth` preserves deeper frames — if that turns out unused after Step 3, delete it rather than leaving it dead.
- **Type consistency:** `frame()`, `pushFrame`, `popFrame`, `updateTop`, `saveTop`, `deleteTop`, `stackDirty`, `goToDepth`, `createdInJourney`, `attachTo: {frameIndex, field}` are used with those exact names in Tasks 3-6.
