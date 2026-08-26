#!/usr/bin/env bash
# One-command wonder: build images, start docker compose, init storage, smoke-check, print the URLs.
#   ./wonder-up.sh                   # dev mode: your working tree mounted live, local minio, native cpu arch
#   ./wonder-up.sh --env team.env    # first install the .env file you were sent as cloud-services/on-prem/.env.site
#   ./wonder-up.sh --airgap          # on-prem sim: images-only, egress blocked (llm-lite excepted)
#   ./wonder-up.sh --clean           # stop everything and wipe volumes (fresh state)
set -euo pipefail
cd "$(dirname "$0")/cloud-services/on-prem"
MODE=dev ENVFILE=""
while [[ $# -gt 0 ]]; do case "$1" in
  --airgap) MODE=airgap;; --clean) MODE=clean;; --env) ENVFILE="$2"; shift;; *) echo "unknown flag: $1" >&2; exit 1;;
esac; shift; done
command -v docker > /dev/null || { echo "install docker first: https://docs.docker.com/get-docker/" >&2; exit 1; }
compose() { docker compose --env-file .env.site -f docker-compose.yml "$@"; }
if [[ "$MODE" == clean ]]; then compose -f compose.dev.yml --profile local-minio down -v; exit 0; fi

[[ -n "$ENVFILE" ]] && cp "$ENVFILE" .env.site
[[ -f .env.site ]] || cp .env.site.template .env.site
[[ -f llm-lite-config.yaml ]] || cp llm-lite-config.template.yaml llm-lite-config.yaml   # upstream endpoint + api key live here
while IFS= read -r line; do key="${line%%=*}"; grep -q "^$key=" .env.site || echo "$line" >> .env.site; done \
  < <(grep -E '^[A-Z_]+=' .env.site.template | sed -E 's/[[:space:]]+#.*$//')   # backfill keys added by newer templates,
  # comment-stripped (compose reads "KEY=  # x" as value "# x"); your existing values always win
grep -Eq '^SITE_HOST=[^ ]' .env.site || { sed -i.bak "s/^SITE_HOST=.*/SITE_HOST=$(hostname)/" .env.site && rm -f .env.site.bak; }

[[ "$MODE" == dev ]] && export PLATFORM="${PLATFORM:-$(docker version -f '{{.Server.Os}}/{{.Server.Arch}}')}" \
  WONDER_UID="$(id -u)" WONDER_GID="$(id -g)"
docker image inspect wonder-server-base:latest marketplace-server-base:latest > /dev/null 2>&1 || ./build-images.sh --base
TAG="$(./build-images.sh | tail -1 | cut -d= -f2)"
sed -i.bak "s/^IMAGE_TAG=.*/IMAGE_TAG=$TAG/" .env.site && rm -f .env.site.bak

overlay=(); [[ "$MODE" == dev ]] && overlay=(-f compose.dev.yml); [[ "$MODE" == airgap ]] && overlay=(-f compose.airgap.yml)
compose "${overlay[@]}" --profile local-minio up -d
./sim-check.sh
set -a; source .env.site; set +a
echo
echo "Wonder is up ($MODE mode, images $TAG):"
echo "  applets:          $SITE_SCHEME://$SITE_HOST:$WONDER_PUBLISHED_PORT/room/<roomId>/applet/<name>"
echo "  marketplace API:  $SITE_SCHEME://$SITE_HOST:$MARKETPLACE_PUBLISHED_PORT/docs"
echo "  agno (AgentOS):   $SITE_SCHEME://$SITE_HOST:$AGNO_PUBLISHED_PORT/docs"
echo "  minio console:    $SITE_SCHEME://$SITE_HOST:$MINIO_PUBLISHED_PORT"
echo "  Claude Code MCP:  claude mcp add --transport http wonder $SITE_SCHEME://$SITE_HOST:$WONDER_PUBLISHED_PORT/mcp"
