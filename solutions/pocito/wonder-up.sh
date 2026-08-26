#!/usr/bin/env bash
# One-command wonder: build images, start docker compose, init storage, smoke-check, print the URLs.
#   ./wonder-up.sh                   # dev mode: your working tree mounted live, local minio, native cpu arch
#   ./wonder-up.sh --env team.env    # first install the .env file you were sent as solutions/pocito/on-prem/.env.site
#   ./wonder-up.sh --airgap          # on-prem sim: images-only, egress blocked (llm-lite excepted)
#   ./wonder-up.sh --clean           # stop everything and wipe volumes (fresh state)
set -euo pipefail
cd "$(dirname "$0")/on-prem"
MODE=dev ENVFILE=""
while [[ $# -gt 0 ]]; do case "$1" in
  --airgap) MODE=airgap;; --clean) MODE=clean;; --env) ENVFILE="$2"; shift;; *) echo "unknown flag: $1" >&2; exit 1;;
esac; shift; done
command -v docker > /dev/null || { echo "install docker first: https://docs.docker.com/get-docker/" >&2; exit 1; }
compose() { docker compose --env-file .env.site -f docker-compose.yml "$@"; }
if [[ "$MODE" == clean ]]; then compose -f compose.dev.yml --profile local-minio down -v; exit 0; fi

[[ -n "$ENVFILE" ]] && cp "$ENVFILE" .env.site
[[ -f .env.site ]] || cp .env.site.template .env.site
grep -q '^LLM_LITE_CONFIG=' .env.site 2> /dev/null || [[ -f llm-lite-config.yaml ]] \
  || cp llm-lite-config.template.yaml llm-lite-config.yaml   # upstream endpoint + api key live here (unless LLM_LITE_CONFIG points elsewhere)
while IFS= read -r line; do key="${line%%=*}"; grep -q "^$key=" .env.site || echo "$line" >> .env.site; done \
  < <(grep -E '^[A-Z_]+=' .env.site.template | sed -E 's/[[:space:]]+#.*$//')   # backfill keys added by newer templates,
  # comment-stripped (compose reads "KEY=  # x" as value "# x"); your existing values always win
grep -Eq '^SITE_HOST=[^ ]' .env.site || { sed -i.bak "s/^SITE_HOST=.*/SITE_HOST=$(hostname)/" .env.site && rm -f .env.site.bak; }
if ! grep -qE '^[A-Z_]*_PUBLISHED_PORT=' .env.site; then   # published ports: shift the 58045-58050 block +100 while another container holds one
  taken="$(docker ps --format '{{.Label "com.docker.compose.project"}}|{{.Ports}}' | grep -v '^wonder-onprem|' || true)"
  offset=0
  while grep -qE ":($((58045+offset))|$((58046+offset))|$((58047+offset))|$((58048+offset))|$((58049+offset))|$((58050+offset)))->" <<< "$taken"; do offset=$((offset+100)); done
  [[ "$offset" == 0 ]] || for entry in WONDER:58045 MARKETPLACE:58046 LLM_LITE:58047 MINIO:58048 AGNO:58049 PGVECTOR:58050; do
    echo "${entry%:*}_PUBLISHED_PORT=$(( ${entry#*:} + offset ))" >> .env.site; done
fi

[[ "$MODE" == dev ]] && export PLATFORM="${PLATFORM:-$(docker version -f '{{.Server.Os}}/{{.Server.Arch}}')}" \
  WONDER_UID="$(id -u)" WONDER_GID="$(id -g)"
docker image inspect wonder-server-base:latest marketplace-server-base:latest > /dev/null 2>&1 || ./build-images.sh --base
TAG="$(./build-images.sh | tail -1 | cut -d= -f2)"
sed -i.bak "s/^IMAGE_TAG=.*/IMAGE_TAG=$TAG/" .env.site && rm -f .env.site.bak

overlay=(); [[ "$MODE" == dev ]] && overlay=(-f compose.dev.yml); [[ "$MODE" == airgap ]] && overlay=(-f compose.airgap.yml)
compose "${overlay[@]}" --profile local-minio up -d
./sim-check.sh
set -a; source .env.site; set +a
: "${SITE_SCHEME:=http}" "${WONDER_PUBLISHED_PORT:=58045}" "${MARKETPLACE_PUBLISHED_PORT:=58046}" \
  "${MINIO_PUBLISHED_PORT:=58048}" "${AGNO_PUBLISHED_PORT:=58049}"   # same defaults as docker-compose.yml
echo
echo "Wonder is up ($MODE mode, images $TAG):"
echo "  applets:          $SITE_SCHEME://$SITE_HOST:$WONDER_PUBLISHED_PORT/room/<roomId>/applet/<name>"
echo "  marketplace API:  $SITE_SCHEME://$SITE_HOST:$MARKETPLACE_PUBLISHED_PORT/docs"
echo "  agno (AgentOS):   $SITE_SCHEME://$SITE_HOST:$AGNO_PUBLISHED_PORT/docs"
echo "  minio console:    $SITE_SCHEME://$SITE_HOST:$MINIO_PUBLISHED_PORT"
echo "  Claude Code MCP:  claude mcp add --transport http wonder $SITE_SCHEME://$SITE_HOST:$WONDER_PUBLISHED_PORT/mcp"
