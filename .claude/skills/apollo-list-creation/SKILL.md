---
name: apollo-list-creation
description: >-
  Build a targeted Apollo.io prospect list end-to-end: clarify the list's
  purpose against the CRM and prior lists, define the people-search params,
  enrich + create the list in Apollo, run quality checks (CRM overlap,
  internal duplication, existing LinkedIn 1st-degree connections via HeyReach,
  military/8200 background), generate a local HTML UI to explore it by
  company, and optionally import the finished list into the Wonder CRM as
  leads. Use this whenever the user wants to create, build, or assemble an
  Apollo list / prospect list / lead list / outreach segment / "market
  evidence" list, enrich people in Apollo, label or tag contacts into an
  Apollo list, cross-check a prospect set against the CRM or LinkedIn, or
  upload/import such a list into the CRM as new leads — even if they only
  hand you a brief or a half-finished list from another chat. Also use it
  when asked to "view" or "explore" such a list.
---

# Apollo list creation

This skill builds a clean, decision-ready Apollo prospect list and the tooling to inspect it. It exists because the naive path has sharp edges: Apollo's MCP silently drops list labels on create, its enrichment responses are too large to read inline, and a raw list is useless until it's been checked against who you already know and already talk to. The workflow below is the one that actually works.

Work through the five phases in order. Each builds the artifact the next one needs. Keep all working state in one folder (e.g. `/tmp/<list-slug>/`) so the run is resumable and the checks/UI have a stable place to read from.

Before touching Apollo, read `references/apollo-mcp.md` — it documents the tool names, the credit-confirmation rule, the 10-per-batch cap, the **label bug**, and how to handle oversized responses. Most of the failure modes live there.

## Phase 1 — Understand the list's purpose

A list is only as good as the intent behind it. Don't start searching until you can state, in one sentence, *who* this list is for and *why* (cold outreach? market evidence? a specific campaign? warm intros?). The answer changes the search params, the checks that matter, and what counts as a duplicate.

Ground that intent in what already exists:
- **CRM** (`indivi-crm` MCP): `crm_stats` for the shape of the pipeline, `crm_list` / `crm_search` to see who's already in play and who owns them. This tells you what to *exclude* and what "we already know this company" looks like.
- **Prior Apollo lists / campaigns**: existing labels and `apollo_emailer_campaigns_search` show what's been targeted before, so the new list doesn't re-plough the same ground.
- **HeyReach** (`heyreach` MCP): existing lists/campaigns (`get_all_lists`, `get_all_campaigns`) show the outreach already running.

Confirm the purpose and the rough targeting with the user before spending credits. Write the agreed purpose, target persona, and any exclusions into `HANDOFF.md` (or a `purpose` field in the state JSON) so the rest of the run — and any subagents — share one source of truth.

## Phase 2 — Define the search params

Translate the persona into concrete Apollo filters and confirm them. The usual axes:
- **Titles** (and seniority): the actual job titles, not a vibe — e.g. `["BI Team Lead", "Head of Analytics", "Data Analyst"]`.
- **Location** (country / region).
- **Company size** (employee bands, e.g. 201–10,000) and optionally industry.
- **Headcount per company** if you want breadth vs depth.

Use `apollo_mixed_people_api_search` to preview matches and tune filters *before* committing. Aim for a target count (e.g. ~180) and a composition you can state plainly ("~40 Heads of BI, ~40 Data Analysts, …"). Capture the resulting person IDs — those drive Phase 3. Save the candidate set (id, first_name, title, org) to the state folder.

## Phase 3 — Enrich and create the list

Two distinct steps; don't conflate them.

**3a. Enrich** to reveal contact data (LinkedIn URLs, etc.) with `apollo_people_bulk_match` — **max 10 people per call**, **1 credit per match**. State the exact credit cost and get approval (see the confirmation rule in `references/apollo-mcp.md`). Use `scripts/chunk.py` to split the IDs into batches of 10. Responses are huge → they get saved to a file; parse with `scripts/parse_matches.py`, never read them raw. Keep `id, name, linkedin_url, title, org`.

**3b. Create + label.** Create the contacts with `apollo_contacts_bulk_create` (dedupes by email/details). **Then apply the list label with `apollo_contacts_update` per contact** — because `bulk_create`'s `label_names` is silently ignored (proven: contacts come back with empty `label_ids`). The update both creates the list if missing and attaches it; verify each response's `label_ids` is non-empty. There is no bulk-label endpoint, so for large lists **delegate the per-contact updates to background subagents** (split the IDs across a few agents). Use `scripts/chunk.py` to split contacts for creation. Trust the per-record `label_ids`, not the label's `cached_count` (it lags).

End state: every person enriched and labeled into the named list, plus a `master.json` in the state folder holding the full set (`name, org, title, linkedin_url`).

## Phase 4 — Quality checks

A list you can't reason about isn't done. Run these against `master.json` and report each clearly. `scripts/checks.py` does the deterministic matching; the data it consumes comes from MCP calls you make and save to the state folder.

1. **CRM overlap** — is anyone already in the CRM? Pull `crm_list` (save the JSON), then `checks.py crm`. Matching is **name-based** (CRM cards carry no LinkedIn URL), normalized for case/accents; report exact vs loose matches and the owner.
2. **Internal duplication** — `checks.py dedup` flags repeated people and same-(first,last,org) collisions that Apollo would merge.
3. **Existing LinkedIn connections** — who is already a 1st-degree connection of the user / teammates? Find sender accounts with `get_all_linked_in_accounts`, page through `get_my_network_for_sender` (save each page), then `checks.py linkedin`. Note: the network API returns **obfuscated `ACoAA…` URLs and null headlines**, so this is **name-based** too — report exact full-name matches as HIGH confidence and flag common-name collisions.
4. **Military / 8200 background** (Israel-relevant) — `checks.py military` scans the saved `apollo_people_bulk_match` responses' `employment_history` for Unit 8200 / Military Intelligence, elite tech units (Mamram/Talpiot/Lotem), and general IDF/defense service. This only works for people you enriched *this run* (history isn't in the handoff for previously-enriched people) — say so explicitly rather than implying "none".

## Phase 5 — Build the explorer UI

Give the user a way to actually look at the list. Build the enriched dataset (merge `master.json` with the Phase-4 signals: `connectionOf`, `military`, `militaryKnown`, `history`) into the shape `assets/explorer_template.html` expects, then:

```
python scripts/build_explorer.py <enriched.json> <out.html>
```

It injects the data into the template (a self-contained, no-server HTML file) and writes the result. The explorer groups people **by company** (multi-person companies first), expands to show titles + LinkedIn links, badges connections and 8200/military, has search + filters, and a "★ companies I know" toggle saved in the browser. Verify it renders (open it / screenshot), then save a durable copy outside `/tmp` and give the user the path. Offer to publish it as a Wonder applet if they want it hosted/shareable.

## Phase 5b — Score leads against a product ICP (optional)

When the goal is to sell a specific product to the list (not just "any prospect"), score each lead's fit against that product's ICP before importing. This is what separates a big list from a *good* one.

Read the product definition from the CRM product map: `indiviai-wonder/<CRM_ROOM>/products.json` → `content[<ProductName>]` has `icp`, `targetBuyer`, `businessValue`, `pain`, `competitors`. The `targetBuyer` field is the crucial one — it says *who actually buys*, which is often NOT the obvious title.

Score each lead **strong / medium / weak** against ICP + target buyer. Two nuances that flip naive scoring (encode them in the rubric you give the scorers):
- **Anti-buyers:** if the product *replaces* a role, people in that role are weak fits — they resist, and don't buy. (E.g. ETLS collapses the data-engineer/analyst stack, so those ICs are anti-buyers even though they're "data people".)
- **Competitors:** a founder/exec of a company in the *same category* as the product is a non-fit, not a lead. Score weak with reason "competitor".

For more than ~30 leads, fan out subagents (each given the verbatim ICP/targetBuyer + the rubric) to score their slice and write `{name, company, position, url, fit, reason, sizeGuess}`; then aggregate. Build the fit view:

```
python scripts/build_icp_explorer.py <scored.json> <out.html> --icp "<one-line ICP>"
```

It ranks strong→medium→weak, colour-codes fit, shows each reason, and hides weak by default so the real targets surface first. Import only the fits worth pursuing (Phase 6), and put the fit tier + reason in each lead's `summary` as metadata.

## Phase 6 — Import into the Wonder CRM (optional)

When the user wants the finished list *in the CRM as leads*, use `scripts/crm_import.mjs`. This writes to **live production data**, so treat it carefully.

**Know the target first** (it's documented in `solutions/crm/CLAUDE.md`): the CRM is a single GCS file `indiviai-wonder/<CRM_ROOM>/contacts.json`, shaped `{ content: [ …leads… ] }`. `CRM_ROOM` lives in `solutions/crm/crm.config.mjs`. A lead's columns are `Main Contact, Company, Position, Funnel, Chance 1-10, next action, date next action, summary, Product, Alive/Dead, sender` + `id, linkedin, msgs`. LinkedIn-sourced leads (see `solutions/crm/heyreach-sync.mjs`) use `id = "name|company"`, set `linkedin`, and dedup by linkedin-url then name — so reusing that `id`/`linkedin` convention means a future HeyReach sync *updates* these rather than duplicating them.

`crm_import.mjs` mirrors that contract: reads the live file (aborts if the read fails — never overwrites blind), builds leads from the enriched list, **dedups** by id/name/linkedin against what's already there, appends, **backs up `contacts.json`** to `contacts.backup-<date>.json`, then writes. It is **dry-run by default**; `--write` commits. It's config-driven (env): `SRC, FUNNEL, PRODUCT, NEXT_ACTION, STAGGER, OWNERS, SUMMARY`. See the script header for each.

Always: **run the dry-run first**, show the user the counts + sample + (if staggering) the per-company date table, and get explicit confirmation before `--write` — this is the A-Team room with real pipeline data; never write to an existing room without asking first.

Two conventions worth defaulting to:
- **Cold leads → `FUNNEL='0-Lead'`**, which is *hidden by default* in the CRM view, so a big import doesn't bury the active pipeline.
- **Staggered follow-up dates** (`STAGGER='per-company-workingdays'`): the first contact at a company gets today, the next gets the next **Israeli working day** (skips Fri/Sat), etc. — so you don't try to reach a whole company on the same day. Singles get today.

Needs GCS auth (ADC); if it fails, run `gcloud auth application-default login` yourself rather than asking the user.

### Tracking connection acceptance (HeyReach webhook)
To auto-update the CRM when a prospect accepts a LinkedIn connection, register a HeyReach webhook with `create_webhook` (`eventType: CONNECTION_REQUEST_ACCEPTED`) pointing at a receiver that finds the contact by `linkedin` url and advances its `Funnel` / `next action`. **Dependency:** HeyReach only emits this if the connect request was sent through a HeyReach campaign — so the list must be pushed into a HeyReach campaign (Phase 3 / `add_leads_to_list_v2`) for the event to fire. If connecting manually, HeyReach can't see the accept; fall back to the existing message-reply sync once they reply.

## Notes

- Reuse one `_conversation_ref` token across all Apollo calls in a run (analytics grouping).
- Never spend credits or write to the CRM / existing rooms without explicit confirmation.
- If the user hands you a mid-run handoff (IDs already enriched, etc.), skip to the relevant phase — the phases are independent given their input artifacts.
