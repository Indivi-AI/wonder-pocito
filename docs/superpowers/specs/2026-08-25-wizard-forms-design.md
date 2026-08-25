# Wizard Forms Design

**Date:** 2026-08-25
**Status:** Approved design (user-approved 2026-08-25), pre-implementation.

## Goal

Convert every resource form in the Wonder Platform editor (`solutions/pocito/marketplace-ui/`) into a wizard: a slim step rail on the right, the active step's form on the left. Steps are freely jumpable; Save stays visible in the editor top bar. Visual direction: refined light.

## Context

- The tool editor was rebuilt in plan `2026-08-25-flow-package-tool-wizard` as one scrolling page; this design supersedes it: tools become a 3-stage wizard.
- The editor top bar already holds an editable name input (no `display_name` rows remain in forms).
- Legacy non-flow ("connector") tools stay read-only in the editor, with no Save and no Delete.

## Architecture (Approach B, chosen per project docs)

- New registered component `wonderPlatformWizard` in new file `solutions/pocito/marketplace-ui/wonder-platform-wizard.js`.
- `wonderPlatformResourceFields` (`wonder-platform-resource-fields.js`) defines per-resource step lists as declarative data: `steps = [{id, label, render}]`, where `render` returns the step's form content using the existing in-scope helpers (`input`, `field`, `relation`, `packageStep`, `inputSchemaSection`, `outputCubesSection`, `knowledgeSection`, history/scenario sections, marketplace fields).
- `wonderPlatformWizard` props: `{steps, activeId, onStep}`. It renders the rail (slim, right side, RTL-first) and the active step content; it owns no domain logic. Hooks live only in its returned function (solutions/pocito/CLAUDE.md rule).
- Active-step state lives in `wonderPlatformResourceFields` via `useState`, reset when the edited resource changes.
- Matches TGP philosophy: declarative profiles, technical handling in components; every stateful component registered via `ReactComp` and rendered via `hh`.

## Step contents per resource

**Agents** — 6 steps:
1. `כללי` — description + hebrew description
2. `הנחיות` — instructions textarea
3. `פלאגינים` — `relation('pluginIds', ...)`
4. `מיומנויות` — `relation('skillIds', ...)`
5. `כלים` — `relation('toolIds', ...)`
6. `ידע` — `relation('knowledgeIds', ...)`

**Tools** — 3 stages:
1. `כללי` — description + hebrew description + **tool id input** (numeric, 6-8 digits, `dir: 'ltr'`) + **טעינת מארז (load) button** next to the id.
2. `פרמטרים` — `inputSchemaSection()`.
3. `קוביות פלט` — `outputCubesSection()`.
- Stages 2 and 3 are disabled (greyed, unclickable) until a package has loaded successfully.
- Load is **mocked**: any id (6-8 digits) succeeds; it sets `packageId`, fills `inputSchema` and available cubes from seed data (`repo.flowPackages`), marks the item loaded, and resets `outputCubes` to `[]`. The real FLAPI/backend call is wired by a teammate later; the mock site must be a single, clearly named function so the swap is one-line. The package search box is removed — picking is by id + load only.
- Existing read-only legacy tools keep `legacyTool()` unchanged (no wizard — read-only view, no Save/Delete).

**Skills** — steps:
1. `כללי` — description + hebrew description
2. `תוכן המיומנות` — SKILL.md content (marketplace: `SKILL.md` field; local: `תוכן המיומנות`)
3. `גרסה` (local only: גרסה נוכחית/גרסה חדשה) — marketplace: `min_agent_version` + `license`
4. `Assets` (marketplace only)
5. `כלים` — `relation('toolIds', ...)`

**Knowledge** — steps:
1. `כללי` — description + hebrew description
2. `קבצים` — `knowledgeSection()`

**Plugins** — steps:
1. `כללי` — description + hebrew description
2. `הנחיות בסיס` — instructions textarea

**Subagents** — steps:
1. `כללי` — description + hebrew description
2. `הנחיות בסיס` — instructions textarea
3. `מיומנויות` — `relation('skillIds', ...)`
4. `כלים` — `relation('toolIds', ...)`

**Evaluations** — steps:
1. `הגדרה` — מה רוצים לבדוק + איזה סוכן בודקים
2. `תרחישי בדיקה` — scenario cards
3. `רובריקה` — rubric field
4. `היסטוריית הרצות` — `historySection()`

Marketplace-API section (non-tool resources, `repo.marketplace && item._marketplace`) stays inside the relevant resource's `כללי` step.

## Visual (refined light)

- Rail: slim (`w-44`), right side, `border-l` separator; step rows text-sm, vertical list, active step highlighted (soft accent background + accent right border), disabled steps greyed with reduced opacity, click any enabled step.
- Content: `rounded-2xl border border-[#e8e8ea]` card, section titles `text-base font-semibold`, generous spacing, existing Tailwind token palette (`#e8e8ea`, `#6b6b6f`, `#0f0f10`), existing `classes` object from `wonderPlatformUi`.
- No dark theme, no new dependencies, no new fonts.

## Non-goals

- No mobile-specific layout (user explicitly waived mobile support).
- No step validation, no Next/Back flow — free jump only, Save always visible.
- No backend changes; load is mocked by explicit user request until a teammate wires the real contract.

## Testing

- Update/extend `wonder-platform-tests.js` where wizard behavior changes existing assertions (`marketplaceToolEditor` tool editor flow; new assertions: 3 tool stages, stages 2-3 disabled before load, mock load enables them; agents wizard renders the 6 steps).
- Manual browser check via `playwrightHarvest` after implementation.

## Constraints (binding)

- Max 180 chars per line; ESM only; functional style; no comments beyond one-line WHY.
- Register every TGP component via `ReactComp`/`Data`; never export a bare profile.
- `node --check` every changed file; line-length awk on changed files.
