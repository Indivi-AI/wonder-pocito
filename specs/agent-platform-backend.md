# Agent Platform — backend handoff

The `wonderAgents` applet ships with real UI on top of **fake/local data** for three
things the backend does not support yet. This document scopes what's missing.

Live: `/room/:roomId/applet/wonderAgents` (Studio remains at `/applet/wonderPlatform`).

## 1. Agent as a marketplace resource

The UI treats Agents as a first-class marketplace resource (own catalog, wizard, chat
target, eval target). Backend has **no such resource kind**.

Note `/api/v1/agents/` is **already taken** — it backs what the UI calls "Subagent"
(`marketplace_server.py:236-281`, kind `agent`). The new resource needs its own kind;
UI currently stores it client-side as `repo.agents`. Suggested kind name:
`workspace_agent` (rename freely — it appears only in the client mapping layer).

Shape the UI persists today:

```
{ id, display_name, description, hebrew_description, tags,
  config: { system_prompt, backend_config: {harness, harness_type},
            plugins: [...ids], skills: [...ids], tools: [...ids], knowledge: [...ids] },
  readme }
```

That mirrors the existing Subagent/`agent` manifest plus a `knowledge` array — the
existing `CreateAgent`/`UpdateAgent` models are the closest template.

## 2. Knowledge resource + files/RAG

New resource kind, plus real file storage. UI currently stores metadata only:

```
{ id, display_name, description, hebrew_description, fileCount, syncStatus }
```

`fileCount` and `syncStatus` are hand-edited fields in the UI right now — placeholders
for what real storage would report. Needed:

- CRUD for a Knowledge resource (same envelope/versioning as other kinds).
- File upload/list/delete under a Knowledge item (`presign/upload` + `presign/download`
  already exist at `marketplace_server.py` and are the obvious reuse).
- RAG indexing + retrieval — entirely unscoped. The UI makes no assumptions about
  chunking, embedding model, or retrieval API; it only shows a count and a sync state.

Knowledge attaches to both Plugins (`config.knowledge`) and Agents — the attachment is
just an id array, same as skills/tools.

## 3. Ownership / import (mine · imported · global)

Catalogs show three tabs and a per-card owner badge, driven by a client-side
`owner` field (`'me' | 'imported' | 'global'`). **Nothing backs this.** Confirmed absent:

- No `created_by` / `owner` / `source_room` field on any resource
  (`marketplace_server.py:94-147` — only id, display_name, description, tags, version,
  created_at, updated_at).
- No cross-room references. Every resource is stored at `{room}/kinds/{name}/...` and
  `ROOM_CONTEXT` alone picks the directory (`marketplace_storage.py:115-116`). A resource
  in one room cannot point at one living in another.
- No global-vs-personal room distinction. `DEFAULT_ROOM='marketplace'`
  (`marketplace_server.py:19`) is a plain room; the client's `marketplace: true` flag
  (`wonder-platform-marketplace-api.js:141`) is a JS-only indicator.

To make this real, three decisions are needed:

1. **Provenance** — an owner/creator field on each resource.
2. **A global tier** — is the global catalog a designated room, a flag on resources, or a
   separate service?
3. **Import semantics** — does importing *copy* the resource into the user's room
   (simple, diverges from source over time) or *reference* it cross-room (needs a
   reference model that does not exist today)? The UI currently just flips a local flag,
   which is compatible with either choice.

## Deliberately out of scope

Per product direction, the Agent wizard has **no model picker and no temperature
control** (the Stitch mock had both), and **no "improve with AI"** button. Don't add
backend fields for them.

Subagents are hidden from the UI (nav entry and Plugin attach option removed) but no data
or endpoint was deleted — the `agent` kind still works exactly as before.
