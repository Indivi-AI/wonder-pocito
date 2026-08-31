# Wizard Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert every resource form in the Wonder Platform editor into a wizard — a slim step rail on the right, the active step's form on the left, free-jump steps, Save always visible in the editor top bar.

**Architecture:** New registered component `wonderPlatformWizard` (new file `wonder-platform-wizard.js`) renders a step rail + the active step's content; it owns no domain logic. `wonder-platform-resource-fields.js` defines per-resource declarative step lists `[{id, label, disabled, render}]` using its existing in-scope helpers, and holds the active-step state. Tools get 3 stages (כללי with id + mock load button / פרמטרים / קוביות פלט); stages 2-3 disabled until a package loads. Frontend-only, no new dependencies, no mobile-specific layout (user waived mobile).

**Tech Stack:** jb6 `ReactComp`/`Data` components (`solutions/pocito/marketplace-ui/*.js`), Tailwind utility classes via `h('div:...')` strings.

**Spec:** `docs/superpowers/specs/2026-08-25-wizard-forms-design.md`

## Global Constraints

- Max 180 chars per line (project CLAUDE.md).
- No comments beyond one-liners explaining non-obvious WHY; no docstrings.
- Functional style, ESM only, no CommonJS.
- Don't add error handling, validation, or fields beyond what's specified.
- Every changed `.js` file must pass `node --check` before moving on.
- Register every TGP component via `Data`/`ReactComp`; never export a bare profile.
- Stateful children render via `hh`; hooks only inside a function returned by `hFunc`.
- When running tests, inspect full output including logger arrays — not just pass/fail.
- After deleting code, grep for leftovers (no dead helpers may remain).

---

### Task 1: Wizard shell component

**Files:**
- Create: `solutions/pocito/marketplace-ui/wonder-platform-wizard.js`
- Modify: `solutions/pocito/marketplace-ui/pocito-tests.js` (add test + module contract entry)

**Interfaces:**
- Produces: registered `react-comp<react>wonderPlatformWizard`, props `{steps, activeId, onStep}` where `steps` is `[{id, label, disabled?, render}]` — `render` returns an h-node; the wizard renders `steps.find(step => step.id == activeId) || steps[0]` content plus the rail. Later tasks call it via `hh(ctx, dsls.react['react-comp'].wonderPlatformWizard, {steps, activeId, onStep})`.

- [ ] **Step 1: Create the component**

`wonder-platform-wizard.js`:

```js
import { dsls } from '@jb6/core'
import '@jb6/react'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformWizard', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({steps, activeId, onStep}) => {
      const active = steps.find(step => step.id == activeId) || steps[0]
      return h('div:flex items-start gap-6', {},
        h('nav:w-44 shrink-0 space-y-1 border-l border-[#e8e8ea] pl-4', {}, steps.map(step => h(
          `button:block w-full rounded-lg px-3 py-2 text-right text-sm ${step.id == active.id
            ? 'bg-[#0f0f10] font-semibold text-white' : step.disabled
              ? 'cursor-not-allowed text-[#b9b9be]' : 'text-[#2e2e2e] hover:bg-[#f4f4f5]'}`,
          {key: step.id, disabled: step.disabled, onClick: () => onStep(step.id)}, step.label))),
        h('div:min-w-0 flex-1', {}, active.render()))
    }
  })
})
```

(Editor section has `dir: 'rtl'`, so the nav is the rightmost column.)

- [ ] **Step 2: Register the import chain**

In `solutions/pocito/marketplace-ui/wonder-platform-resource-fields.js`, add after line 5 (`import './wonder-platform-searchable-select.js'`):

```js
import './wonder-platform-wizard.js'
```

- [ ] **Step 3: Add the shell test + contract entry**

In `pocito-tests.js`, add after the `wonderPlatformVerificationHost` ReactComp (line ~492):

```js
ReactComp('wonderPlatformWizardTestHost', {
  impl: comp({hFunc: (ctx, {react: {h, hh, useState}}) => {
    const Wizard = dsls.react['react-comp'].wonderPlatformWizard
    return () => {
      const [activeId, setActiveId] = useState('a')
      return hh(ctx, Wizard, {steps: [{id: 'a', label: 'ראשון', render: () => h('p', {}, 'תוכן ראשון')},
        {id: 'b', label: 'שני', render: () => h('p', {}, 'תוכן שני')},
        {id: 'c', label: 'חסום', disabled: true, render: () => h('p', {}, 'לא רואים')}], activeId, onStep: setActiveId})
    }
  }})
})

Test('wonderPlatform.wizardShell', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformWizardTestHost(), and(contains('תוכן שני'),
    notContains('תוכן ראשון'), notContains('לא רואים'), contains('חסום')), {
    userActions: actions(waitForText('ראשון'), click('שני'), waitForText('תוכן שני'))})
})
```

And in `wonderPlatform.moduleContracts` (test at line ~341), add `'react-comp<react>wonderPlatformWizard'` to the id array (after `'react-comp<react>wonderPlatformResourceEditor'`).

- [ ] **Step 4: Run the tests**

Run: `mcp__wonder__runTest` with `{"testId": "wonderPlatform.wizardShell"}` and with `{"testId": "wonderPlatform.moduleContracts"}`
Expected: both PASS, no logger errors.

- [ ] **Step 5: Syntax check**

Run `node --check` on `wonder-platform-wizard.js`, `wonder-platform-resource-fields.js`, and `pocito-tests.js`.
Expected: no output (exit 0).

- [ ] **Step 6: Commit**

```bash
git add solutions/pocito/marketplace-ui/wonder-platform-wizard.js solutions/pocito/marketplace-ui/wonder-platform-resource-fields.js solutions/pocito/marketplace-ui/pocito-tests.js
git commit -m "feat: wizard shell component with step rail"
```

---

### Task 2: Non-tool resources become wizards

**Files:**
- Modify: `solutions/pocito/marketplace-ui/wonder-platform-resource-fields.js` (shared return → per-resource step lists)
- Modify: `solutions/pocito/marketplace-ui/pocito-tests.js` (skills editor tests gain step clicks)

**Interfaces:**
- Consumes: `react-comp<react>wonderPlatformWizard` (Task 1).
- Produces: per-resource `steps` lists rendered through the wizard; agents gain `relation('pluginIds'/'skillIds'/'toolIds'/'knowledgeIds', ...)` steps (new editor capability); evaluations keep their sticky save-and-run bar OUTSIDE the wizard (always visible). Task 3 replaces the tools branch the same way.

- [ ] **Step 1: Add `activeId` state and the steps builder**

In `wonder-platform-resource-fields.js`, after the `pkg` state line (line 15), add:

```js
      const [activeId, setActiveId] = useState('general')
```

- [ ] **Step 2: Build `generalStep` and the per-resource step lists**

Insert after the `relation` helper definition (after line 24):

```js
      const generalStep = () => h('div:space-y-4', {},
        field('id', input('id', {dir: 'ltr', placeholder: 'uiRenderingSkill', disabled: !!item.originalId})),
        field('description', h(`textarea:${classes.field} min-h-24 resize-y`, {dir: 'ltr', value: item.apiDescription || '',
          onInput: event => update({...item, apiDescription: event.target.value})})),
        field('hebrew_description', h(`textarea:${classes.field} min-h-24 resize-y`, {value: item.desc || '',
          onInput: event => update({...item, desc: event.target.value})})),
        repo.marketplace && item._marketplace && h('section:rounded-2xl border border-[#e8e8ea] p-4', {}, h(
          'div:flex flex-wrap items-center gap-2', {}, h('b:text-sm', {}, 'Marketplace API'), h(`span:${classes.chip}`, {},
            `${item.versions?.length || 0} גרסאות`), h(`span:${classes.chip}`, {}, `${item.audit?.length || 0} אירועי audit`)),
        (item.versions || []).length > 0 && h('div:mt-3 flex flex-wrap gap-2', {}, item.versions.map((version, index) => h(
          `span:${classes.chip}`, {key: index}, `V${version.version ?? version.n ?? index + 1}`)))))
      const stepsFor = resource => resource == 'agents' ? [
        {id: 'general', label: 'כללי', render: generalStep},
        {id: 'instructions', label: 'הנחיות', render: () => field('הנחיות', h(`textarea:${classes.field} min-h-40 resize-y`, {
          value: item.instructions || '', onInput: event => update({...item, instructions: event.target.value})}))},
        {id: 'plugins', label: 'פלאגינים', render: () => relation('pluginIds', 'plugins', 'פלאגינים')},
        {id: 'skills', label: 'מיומנויות', render: () => relation('skillIds', 'skills', 'מיומנויות')},
        {id: 'tools', label: 'כלים', render: () => relation('toolIds', 'tools', 'כלים')},
        {id: 'knowledge', label: 'ידע', render: () => relation('knowledgeIds', 'knowledge', 'ידע')}
      ] : resource == 'skills' ? [
        {id: 'general', label: 'כללי', render: generalStep},
        {id: 'content', label: 'תוכן המיומנות', render: () => field(repo.marketplace ? 'SKILL.md' : 'תוכן המיומנות', h(
          `textarea:${classes.field} min-h-40 resize-y`, {value: item.content || '',
            onInput: event => update({...item, content: event.target.value})}))},
        {id: 'version', label: 'גרסה', render: () => h('div:space-y-4', {},
          !repo.marketplace && h('div:grid grid-cols-1 gap-3 sm:grid-cols-2', {},
            field('גרסה נוכחית', h(`div:${classes.field} text-[#6b6b6f]`, {}, item.originalId ? item.version : 'טרם פורסם')),
            field('גרסה חדשה', input('publishVersion', {dir: 'ltr', placeholder: '1.0.0'})),
            h('p:col-span-full text-xs leading-5 text-[#6b6b6f]', {},
              'השמירה מפרסמת release חדש. גרסאות ותוכן שכבר פורסמו נשארים בלתי משתנים.')),
          repo.marketplace && h('div:grid grid-cols-1 gap-3 sm:grid-cols-2', {},
            field('min_agent_version', input('minAgentVersion', {dir: 'ltr'})), field('license', input('license', {dir: 'ltr'}))))},
        {id: 'assets', label: 'Assets', render: () => repo.marketplace && h('section:rounded-2xl border border-[#e8e8ea] p-4', {},
          h('div:flex items-start justify-between gap-3', {}, h('div', {}, h('b:text-sm', {}, `Assets (${(item.assets || []).length})`),
            h('p:mt-1 text-xs text-[#6b6b6f]', {}, 'Files bundled with this skill. You can adjust their path before saving.'))),
          h('label:mt-3 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-[#d8d8dc] px-4 py-5 text-center hover:bg-[#fafafa]',
            {onDragOver: event => event.preventDefault(), onDrop: event => (event.preventDefault(), addAssets(event.dataTransfer.files,
              event.currentTarget.ownerDocument.defaultView))}, h('L:Upload', {size: 20}), h('b:mt-2 text-sm', {}, 'Drop files here or browse'),
            h('span:mt-1 text-xs text-[#6b6b6f]', {}, 'Multiple files are supported'), h('input:hidden', {type: 'file', multiple: true,
              'data-skill-assets': true, onChange: event => addAssets(event.target.files, event.currentTarget.ownerDocument.defaultView)})),
          (item.assets || []).length ? h('div:mt-3 space-y-2', {}, item.assets.map((asset, index) => h(
            'div:flex min-w-0 items-center gap-3 rounded-xl border border-[#e8e8ea] p-3', {key: `${asset.path}-${index}`},
            h('L:File', {size: 18}), h('div:min-w-0 flex-1', {}, h('input:w-full min-w-0 bg-transparent text-sm font-medium outline-none', {
              dir: 'ltr', value: asset.path || '', 'aria-label': `Asset path ${index + 1}`, onInput: event => update({...item,
                assets: item.assets.map((value, row) => row == index ? {...value, path: event.target.value} : value)})}),
            h('p:mt-1 truncate text-xs text-[#6b6b6f]', {}, asset.mime_type || 'application/octet-stream')),
            h('button:rounded-lg p-2 hover:bg-[#f3f3f4]', {onClick: () => update({...item,
              assets: item.assets.filter((value, row) => row != index)}), 'aria-label': `Remove ${asset.path}`}, h('L:Trash2', {size: 14})))))
            : h('p:mt-3 text-center text-xs text-[#6b6b6f]', {}, 'No assets added yet'))},
        {id: 'tools', label: 'כלים', render: () => relation('toolIds', 'tools', 'כלים')}
      ] : resource == 'knowledge' ? [
        {id: 'general', label: 'כללי', render: generalStep},
        {id: 'files', label: 'קבצים', render: knowledgeSection}
      ] : resource == 'plugins' ? [
        {id: 'general', label: 'כללי', render: generalStep},
        {id: 'instructions', label: 'הנחיות בסיס', render: () => field('הנחיות בסיס', h(
          `textarea:${classes.field} min-h-40 resize-y`, {value: item.instructions || '',
            onInput: event => update({...item, instructions: event.target.value})}))}
      ] : [
        {id: 'general', label: 'כללי', render: generalStep},
        {id: 'instructions', label: 'הנחיות בסיס', render: () => field('הנחיות בסיס', h(
          `textarea:${classes.field} min-h-40 resize-y`, {value: item.instructions || '',
            onInput: event => update({...item, instructions: event.target.value})}))},
        {id: 'skills', label: 'מיומנויות', render: () => relation('skillIds', 'skills', 'מיומנויות')},
        {id: 'tools', label: 'כלים', render: () => relation('toolIds', 'tools', 'כלים')}
      ]
```

(The last branch is the `subagents` fallback. `addAssets` and `knowledgeSection` are defined later in the file — arrow-function closures resolve at render time, so order is fine.)

- [ ] **Step 3: Route non-tool resources through the wizard**

Delete the entire shared `return h('div:space-y-5', {}, ...)` block (current lines 192-233, from `return h('div:space-y-5', {},` through the final `(item.versions || []).length > 0 && ...)))`) and replace with (note: the existing line 191 `if (resource == 'tools') return toolFields()` STAYS as-is above this):

```js
      if (resource == 'evaluations') {
        const target = repo.agents.find(agent => agent.id == item.targetId), running = runningSet == item.id
        const ready = item.name?.trim() && target && item.rows?.some(row => row.input?.trim())
        const evalSteps = [
          {id: 'general', label: 'הגדרה', render: () => h('div:space-y-4', {}, h('section:rounded-2xl border border-[#e8e8ea] p-5', {}, h(
            'h2:text-base font-semibold', {}, 'מה רוצים לבדוק?'), h(`textarea:${classes.field} min-h-20 resize-y`, {value: item.desc || '',
              placeholder: 'תארו בקצרה את מטרת הבדיקה', onInput: event => update({...item, desc: event.target.value})})), h(
            'section:rounded-2xl border border-[#e8e8ea] p-5', {}, h('div:flex items-start gap-3', {}, h(
              'span:grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f4f4f5]', {}, h('L:Bot', {size: 17})), h(
              'div:flex-1', {}, h('h2:text-base font-semibold', {}, 'איזה סוכן בודקים?'), h(
                'p:mt-1 text-xs text-[#6b6b6f]', {}, 'כל התרחישים ירוצו מול אותו סוכן דרך Agno'), h('div:mt-3', {}, hh(
                ctx, dsls.react['react-comp'].wonderPlatformSearchableSelect, {items: repo.agents, value: item.targetId || '',
                  onChange: targetId => update({...item, targetId}), placeholder: 'בחרו סוכן', empty: 'אין סוכנים זמינים'}))))))},
          {id: 'scenarios', label: 'תרחישי בדיקה', render: () => h('div:space-y-4', {}, h(
            'section:rounded-2xl border border-[#e8e8ea] bg-[#fafafa] p-5', {}, h('div:flex items-center justify-between gap-3', {}, h(
              'div', {}, h('h2:text-base font-semibold', {}, 'תרחישי בדיקה'), h('p:mt-1 text-xs text-[#6b6b6f]', {},
                'כל תרחיש הוא שאלה אחת ותיאור של התוצאה הרצויה')), h(`button:${classes.button}`, {onClick: () => update({...item,
                rows: [...(item.rows || []), {input: '', expected: '', notes: ''}]})}, h('L:Plus', {size: 14}), 'תרחיש')), h(
              'div:mt-4 space-y-3', {}, (item.rows || []).map(scenario), !item.rows?.length && h(
                'div:rounded-xl border border-dashed border-[#d8d8dc] p-8 text-center text-sm text-[#6b6b6f]', {},
                'הוסיפו תרחיש ראשון כדי להתחיל'))))},
          {id: 'rubric', label: 'רובריקה', render: () => h('section:rounded-2xl border border-[#e8e8ea] p-5', {}, h(
            'h2:text-base font-semibold', {}, 'רובריקה'), h('p:mt-1 text-xs text-[#6b6b6f]', {},
              'הגדירו כיצד להעריך תשובה טובה בכל התרחישים'), h(`textarea:${classes.field} mt-4 min-h-24 resize-y`, {
                value: item.rubric || '', placeholder: 'לדוגמה: התשובה מדויקת, מבוססת על המקורות ומציינת פערי מידע',
                onInput: event => update({...item, rubric: event.target.value})}))},
          {id: 'history', label: 'היסטוריית הרצות', render: historySection}
        ]
        return h('div:space-y-5', {},
          hh(ctx, dsls.react['react-comp'].wonderPlatformWizard, {steps: evalSteps, activeId, onStep: setActiveId}),
          h('div:sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d8d8dc] bg-white p-4 shadow-lg', {}, h(
            'p:text-xs text-[#6b6b6f]', {}, !item.name?.trim() ? 'הוסיפו שם לבדיקה' : !target ? 'בחרו סוכן כדי להריץ'
              : !item.rows?.some(row => row.input?.trim()) ? 'הוסיפו לפחות תרחיש אחד עם קלט' : 'מוכן להרצה'), h(
            `button:${classes.primary}`, {disabled: !ready || running, onClick: () => saveAndRun(item, target)},
            running ? 'מריץ…' : 'שמירה והרצה')))
      }
      const steps = stepsFor(resource).filter(step => step.id != 'assets' || repo.marketplace)
      const active = steps.find(step => step.id == activeId) || steps[0]
      return hh(ctx, dsls.react['react-comp'].wonderPlatformWizard, {steps, activeId: active.id, onStep: setActiveId})
```

In the old evaluations branch (lines 130-173): delete lines 131-132 (`const target = ...` and `const ready = ...` — the new eval block above re-declares them) and delete the inner `return h('div:space-y-5', ...)` (lines 148-172). Only the `scenario` helper (lines 133-147) stays inside the old `if (resource == 'evaluations')` block.

- [ ] **Step 4: Update the two skills tests for wizard steps**

In `pocito-tests.js`, replace `wonderPlatform.marketplaceSkillEditor` (lines 442-447) with:

```js
Test('wonderPlatform.marketplaceSkillEditor', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformMarketplaceTestApp(),
    and(contains('תוכן המיומנות'), contains('גרסה'), contains('Assets'), contains('Drop files here or browse')), {
      userActions: actions(waitForText('פלאגין ראיות'), click('מיומנויות'), waitForText('מיומנות ראיות'), click('מיומנות ראיות'),
        waitForText('Marketplace API'), click('תוכן המיומנות'), waitForText('SKILL.md'), click('גרסה'),
        waitForText('min_agent_version'), click('Assets'), waitForText('Drop files here or browse'))})
})
```

Replace `wonderPlatform.marketplaceSkillAssetUpload` (lines 610-622) with:

```js
Test('wonderPlatform.marketplaceSkillAssetUpload', {
  impl: reactTest(wonderPlatformMarketplaceTestApp(), and(contains('checklist.md'), contains('text/markdown')), {
    userActions: actions(
      waitForText('פלאגין ראיות'),
      click('מיומנויות'),
      waitForText('מיומנות ראיות'),
      click('מיומנות ראיות'),
      waitForText('כללי'),
      click('Assets'),
      waitForText('Drop files here or browse'),
      wonderPlatformUploadAsset('checklist.md', '# Checklist', { mimeType: 'text/markdown' }),
      waitForText('checklist.md')
    )
  })
})
```

- [ ] **Step 5: Run the tests**

Run: `mcp__wonder__runTest` with `{"testId": "wonderPlatform.marketplaceSkillEditor"}`, `{"testId": "wonderPlatform.marketplaceSkillAssetUpload"}`, `{"testId": "wonderPlatform.marketplaceAgentWorkspace"}`, `{"testId": "wonderPlatform.marketplaceAgentCreate"}`, `{"testId": "wonderPlatform.marketplaceAgentCreateRelations"}`, `{"testId": "wonderPlatform.evaluationCatalog"}`, `{"testId": "wonderPlatform.pluginWorkspace"}`, `{"testId": "wonderPlatform.workspaceSavesOnlyFromButton"}`.
Expected: all PASS, no logger errors. (`marketplaceAgentCreateRelations` and `workspaceSavesOnlyFromButton` exercise the workspace surface, not the resource editor, so they must stay green.)

- [ ] **Step 6: Syntax + leftovers check**

Run: `node --check solutions/pocito/marketplace-ui/wonder-platform-resource-fields.js solutions/pocito/marketplace-ui/pocito-tests.js`
Expected: no output (exit 0).

- [ ] **Step 7: Commit**

```bash
git add solutions/pocito/marketplace-ui/wonder-platform-resource-fields.js solutions/pocito/marketplace-ui/pocito-tests.js
git commit -m "feat: wizard steps for agents, skills, knowledge, plugins, subagents, evaluations"
```

---

### Task 3: Tools wizard with mock load

**Files:**
- Modify: `solutions/pocito/marketplace-ui/wonder-platform-resource-fields.js`
- Modify: `solutions/pocito/marketplace-ui/pocito-tests.js` (new flow tool wizard test)

**Interfaces:**
- Consumes: `repo.flowPackages` (array of `{Id, Name, Description, Quick: {default: [...]}, Queries: [{id, Name, ResultsLimit, ...}]}`); `inputSchemaSection`, `outputCubesSection`, `currentPackage`, `setPkg` (in-scope).
- Produces: `toolFields` becomes a 3-stage wizard for new/flow tools; `legacyTool()` read-only path unchanged. The mock load is one named function (`mockLoadPackage`) — the teammate swapping in the real backend replaces only its body. Dead search code (`packageQuery`, `packageResults`, `searchPackages`, `pickPackage`, `pickPackageResult`, `packageStep`, `flapiBaseUrl`, `flapiCall`) is deleted.

- [ ] **Step 1: Delete the dead package-search code**

In `wonder-platform-resource-fields.js`, delete:
- line 14: `const [packageQuery, setPackageQuery] = useState(''), [packageResults, setPackageResults] = useState([])` — replace the `pkg` line pair with just `const [pkg, setPkg] = useState()`
- lines 25-26: `const flapiBaseUrl = ...` and `const flapiCall = ...`
- lines 28-40: `searchPackages`, `pickPackage`, `pickPackageResult`
- lines 41-46: `packageStep`

- [ ] **Step 2: Add `mockLoadPackage` and rebuild `toolFields`**

Replace the current `toolFields` definition (lines 179-190) with:

```js
      const mockLoadPackage = () => {
        const seed = repo.flowPackages.find(value => String(value.Id) == item.id) || repo.flowPackages[0]
        setPkg(seed)
        update({...item, packageId: item.id, inputSchema: Object.values(seed.Quick || {}).flat().map(value =>
          ({...value, Description: value.Description || ''})), outputCubes: []})
      }
      const loaded = !!(item.packageId && (item.inputSchema || []).length)
      const toolSteps = [
        {id: 'general', label: 'כללי', render: () => h('div:space-y-4', {},
          h('div:flex items-end gap-2', {}, h('div:flex-1', {},
            field('id', input('id', {dir: 'ltr', placeholder: '12345678', inputMode: 'numeric'}))),
            h(`button:${classes.button}`, {onClick: mockLoadPackage}, 'טעינת מארז')),
          field('description', h(`textarea:${classes.field} min-h-24 resize-y`, {dir: 'ltr', value: item.apiDescription || '',
            onInput: event => update({...item, apiDescription: event.target.value})})),
          field('hebrew_description', h(`textarea:${classes.field} min-h-24 resize-y`, {value: item.desc || '',
            onInput: event => update({...item, desc: event.target.value})})),
          item.packageId && h('p:text-xs text-[#6b6b6f]', {dir: 'ltr'}, `נבחר: ${currentPackage?.Name || item.packageId} (#${item.packageId})`))},
        {id: 'params', label: 'פרמטרים', disabled: !loaded, render: () => h('div:space-y-4', {},
          h('div:rounded-lg border border-[#d8d8dc] bg-[#f4f4f5] px-3 py-2 text-xs text-[#0f0f10]', {},
            `נקראו ${item.inputSchema.length} פרמטרים מהירים ו-${currentPackage?.Queries?.length || 0} קוביות.`),
          inputSchemaSection())},
        {id: 'cubes', label: 'קוביות פלט', disabled: !loaded, render: outputCubesSection}
      ]
      const toolFields = () => item.originalId && item.kind != 'flow' ? legacyTool() : hh(ctx,
        dsls.react['react-comp'].wonderPlatformWizard, {steps: toolSteps, activeId, onStep: setActiveId})
```

- [ ] **Step 3: Add the flow tool wizard test**

In `pocito-tests.js`, add after `wonderPlatform.marketplaceToolEditor` (line ~454):

```js
Test('wonderPlatform.flowToolWizard', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformMarketplaceTestApp(),
    and(contains('קוביות פלט'), contains('בחר קוביות פלט'), contains('פרמטרים'), notContains('טעינת מארז')), {
      userActions: actions(waitForText('פלאגין ראיות'), click('כלים'), waitForText('כלי חדש ממארז Flow'),
        click('כלי חדש ממארז Flow'), waitForText('טעינת מארז'), wonderPlatformSetControl('id', {value: '12345678'}),
        click('טעינת מארז'), waitForText('נבחר:'), click('פרמטרים'), waitForText('סכמת קלט — פרמטרים מהירים'),
        click('קוביות פלט'), waitForText('בחר קוביות פלט'))})
})
```

- [ ] **Step 4: Run the tests**

Run: `mcp__wonder__runTest` with `{"testId": "wonderPlatform.flowToolWizard"}`, `{"testId": "wonderPlatform.marketplaceToolEditor"}`, `{"testId": "wonderPlatform.toolRules"}`.
Expected: all PASS, no logger errors. `marketplaceToolEditor` exercises the legacy read-only path, which is unchanged.

- [ ] **Step 5: Syntax + leftovers check**

Run: `node --check solutions/pocito/marketplace-ui/wonder-platform-resource-fields.js solutions/pocito/marketplace-ui/pocito-tests.js`
Then grep `wonder-platform-resource-fields.js` for `packageQuery|packageResults|searchPackages|pickPackage|packageStep|flapiBaseUrl|flapiCall` — expected: no matches (except none at all; `currentPackage`, `setPkg`, `pkg` must remain).
Also: `awk 'length > 180 {print FILENAME":"FNR": "length}' solutions/pocito/marketplace-ui/wonder-platform-resource-fields.js` — expected: no output.

- [ ] **Step 6: Commit**

```bash
git add solutions/pocito/marketplace-ui/wonder-platform-resource-fields.js solutions/pocito/marketplace-ui/pocito-tests.js
git commit -m "feat: tools wizard with mock package load, drop search flow"
```

---

### Task 4: Regression pass and browser check

**Files:** none (verification only).

- [ ] **Step 1: Run every test in this file**

Run `mcp__wonder__runTest` for each: `wonderPlatform.toolRules`, `wonderPlatform.marketplaceToolEditor`, `wonderPlatform.marketplaceAgentCreateRelations`, `wonderPlatform.chatContextPanel`, `wonderPlatform.wizardShell`, `wonderPlatform.marketplaceSkillEditor`, `wonderPlatform.marketplaceSkillAssetUpload`, `wonderPlatform.flowToolWizard`, `wonderPlatform.marketplaceAgentWorkspace`, `wonderPlatform.marketplaceAgentCreate`, `wonderPlatform.evaluationCatalog`, `wonderPlatform.pluginWorkspace`, `wonderPlatform.workspaceSavesOnlyFromButton`.
Expected: all PASS with no logger errors. (`marketplaceUiAgentE2e` is `doNotRunInTests` — excluded by design until the teammate rewrites it against the real backend.)

- [ ] **Step 2: Manual browser check**

Use `roomAppletHarvest` against `http://localhost:3000/room/wonder-platform/applet/wonderAgents`. Verify:
1. Open an existing connector tool (e.g. "חיפוש Jira"): read-only view, "לא ניתן לעריכה", no Save, no Delete.
2. Open "כלים" → "כלי חדש ממארז Flow": wizard with rail (כללי active); id input + טעינת מארז button; type a 6-8 digit id, click load; "נבחר:" line appears; פרמטרים + קוביות פלט steps unlock; each step shows its content.
3. Open an agent editor: 6 steps render; clicking הנחיות/פלאגינים/מיומנויות/כלים/ידע switches content; פלאגינים step shows "צירוף מהקטלוג".
4. Open an evaluation editor: 4 steps + sticky שמירה והרצה bar always visible.
5. No console errors.

- [ ] **Step 3: Final commit if any fixups were needed**

```bash
git add -A
git commit -m "fix: address regressions from wizard forms rollout"
```
