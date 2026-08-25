# Wonder

Applet workspace platform: rooms and applets served live from this repo, a marketplace + AgentOS for agents, skills and
tools, MinIO storage, and an MCP endpoint your Claude Code talks to.

## Team quickstart (docker, one command)

```sh
git clone <this repo> && cd wonder
./wonder-up.sh --env ~/Downloads/team.env    # the .env.site your team lead sent (LLM keys; everything else auto-fills)
```

That builds the images for your cpu, starts wonder + marketplace + agno (AgentOS) + llm-lite + minio with your working
tree mounted live, creates the buckets, smoke-checks everything, and prints your URLs — including the ready-to-paste
`claude mcp add ...` line for Claude Code.

Your first applet: ask Claude Code (with the wonder MCP added) to call `uploadRoomApplet` with
`{"roomId": "demo", "entryCompFullId": "react-comp<react>wonderPlatform"}`, then open
`http://<your-host>:58045/room/demo/applet/wonderPlatform`. New applets are `.js` files under `solutions/pocito/` —
edits serve live, no rebuilds; after adding new server code run `docker compose restart wonder`.
`./wonder-up.sh --clean` resets everything.

## Integrating with FlowBolt (FLAPI)

For executing dynamic Flow Package tools (e.g., Package 7/25), you must run the **FlowBolt** package service alongside Wonder:
1. Clone and start **FlowBolt** (runs on port `6001` by default):
   ```sh
   git clone https://github.com/88roy88/FlowBolt.git
   cd FlowBolt
   # Refer to FlowBolt README to run the package API server.
   ```
2. Configure the FLAPI environment variables in your `cloud-services/on-prem/.env.site` file:
   ```env
   FLAPI_BASE_URL=http://<SITE_HOST>:6001
   FLAPI_BEARER_TOKEN=mock-test-token
   ```

## Going deeper

- `solutions/pocito/wonder-platform/README.md` — the platform: bare-process dev, on-prem build/sim/deploy, env reference.
- `cloud-services/on-prem/README.md` — the air-gap deployment runbook (whitening kit, `--airgap` sim, OpenShift).
- `CLAUDE.md` — coding rules for working in this repo with Claude.
