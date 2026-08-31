# Apollo / HeyReach / CRM MCP reference

Tool names are long and prefixed by the MCP server id; load schemas via ToolSearch
(`select:<full_tool_name>,...`) before calling. The Apollo server id looks like
`bcd554cb-…` — discover the current one from the deferred-tools list.

## Apollo tools used here

| Purpose | Tool |
|---|---|
| Preview/search people in Apollo DB | `apollo_mixed_people_api_search` |
| Enrich (reveal LinkedIn etc.), ≤10/call | `apollo_people_bulk_match` |
| Create contacts (dedupes) | `apollo_contacts_bulk_create` |
| **Apply list label** / read one contact | `apollo_contacts_update` |
| Search existing contacts | `apollo_contacts_search` |
| Campaigns / sequences | `apollo_emailer_campaigns_search` |

### Credit confirmation (mandatory)
`apollo_people_bulk_match` (and org enrich) cost **1 credit per match, 0 if unmatched**.
Before calling, state the exact count and cost to the user and get approval, e.g.:
"This will enrich N people and consume up to N credits (1 per match, no charge for
unmatched). Proceed?" If the user already pre-approved a known scope, proceed.

### The label bug (most important)
`apollo_contacts_bulk_create` **silently ignores `label_names`** — created contacts come
back with `label_ids: []` and the list is not even created. Do **not** rely on it.

To put contacts in a list: create them, then call **`apollo_contacts_update`** per
contact with `label_names: ["<Exact List Name>"]`. That creates the list if missing and
attaches it. Verify the response's `label_ids` is non-empty (it holds the list id).
`label_names` on update **replaces** the contact's lists — fine when they have none.
There is **no bulk-label endpoint**, so one call per contact. For big lists, delegate the
updates to background subagents (split IDs across a few). The label object's `cached_count`
lags reality — trust per-record `label_ids`, not the counter.

### Oversized responses
`bulk_match`, `bulk_create`, and `contacts_search` responses routinely exceed the inline
token limit and get saved to a file; the tool result gives the **path**. Do **not** Read
them raw (lines too long / context overflow). Parse with python: read the file, slice from
the first `{`, `json.loads`, pull what you need. `scripts/parse_matches.py` does this for
bulk_match. The same pattern (`t[t.find('{'):]` or `t[t.find('['):]`) works for the others.

### Reuse `_conversation_ref`
Generate one short token per run and pass it on every Apollo call (groups them for
analytics). Also pass a generic `_rationale` describing intent (no PII).

## HeyReach (LinkedIn) tools

| Purpose | Tool |
|---|---|
| List connected LinkedIn sender accounts | `get_all_linked_in_accounts` |
| Page a sender's 1st-degree network | `get_my_network_for_sender` |
| Lead lists / campaigns | `get_all_lists`, `get_all_campaigns` |
| Push leads to a list (≤100/call, by profileUrl) | `add_leads_to_list_v2` |

**Network gotcha:** `get_my_network_for_sender` returns `profileUrl` as an obfuscated
`https://www.linkedin.com/in/ACoAA…` URN — **not** the public vanity slug Apollo gives —
and `headline`/`companyName`/`position` come back null. So matching the network against an
Apollo list is **name-only**. Page with `pageSize: 100`; `totalCount` tells you how many
pages. Save each page to a file and parse (responses are large). Networks can be thousands
of connections — delegate the paging+match to a subagent.

## CRM (`indivi-crm`) tools

| Purpose | Tool |
|---|---|
| Pipeline overview | `crm_stats` |
| List contacts (cards) | `crm_list` (optional `funnel`, `owner`) |
| Free-text search | `crm_search` |

CRM cards have `name, company, position, funnel, owner` but **no LinkedIn URL** → CRM
overlap matching is name-based. `crm_list` for a few hundred contacts exceeds the inline
limit and is saved to a file; parse from the saved path.
