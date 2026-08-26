#!/usr/bin/env bash
# Smoke the deployed stack from outside, as a browser would - same script for the sim, the site box, and OpenShift routes.
# Reads .env.site next to this script; needs only curl. Waits for readiness, exits non-zero on any failure.
# The /llmProxy check sends one tiny completion through llm-lite and prints the upstream verdict (costs one upstream call).
set -uo pipefail
cd "$(dirname "$0")"
set -a; [ "${SITE_ENV_FILE:-.env.site}" = /dev/null ] || source "${SITE_ENV_FILE:-.env.site}"; set +a
: "${SITE_SCHEME:=http}" "${WONDER_PUBLISHED_PORT:=58045}" "${MARKETPLACE_PUBLISHED_PORT:=58046}" \
  "${MINIO_PUBLISHED_PORT:=58048}" "${AGNO_PUBLISHED_PORT:=58049}"   # same defaults as docker-compose.yml
wonder="${WONDER_URL:-$SITE_SCHEME://$SITE_HOST:$WONDER_PUBLISHED_PORT}"
market="${MARKETPLACE_URL:-$SITE_SCHEME://$SITE_HOST:$MARKETPLACE_PUBLISHED_PORT}"
agno="${AGNO_URL:-$SITE_SCHEME://$SITE_HOST:$AGNO_PUBLISHED_PORT}"
minio_url="${MINIO_ENDPOINT:-$SITE_SCHEME://$SITE_HOST:$MINIO_PUBLISHED_PORT}"
smoke_model="${LLM_MODEL:-}"
[ -n "$smoke_model" ] || { echo 'LLM_MODEL is required'; exit 1; }
room="smoke-$$"
fail=0
pass() { echo "PASS $1"; }
flunk() { echo "FAIL $1"; fail=1; }
mcurl() { curl -fsS --max-time 20 -H "x-wonder-room: $room" "$@"; }
wait_ready() { for _ in $(seq 60); do curl -fsS --max-time 3 "$1" > /dev/null 2>&1 && { pass "ready: $1"; return 0; }; sleep 2; done
  flunk "never became ready: $1"; return 1; }

wait_ready "$wonder/health" || exit 1
wait_ready "$market/healthz" || exit 1
wait_ready "$agno/healthz" || exit 1
curl -fsS --max-time 10 "$market/healthz" | grep -q '"object_store":"ok"' \
  && pass "marketplace object store" || flunk "marketplace object store"

for bucket in indiviai-wonder wonder-code-packages; do
  curl -fsS --max-time 10 -X PUT "$minio_url/$bucket/$room/probe.json" -d '{"probe":true}' > /dev/null \
    && curl -fsS --max-time 10 "$minio_url/$bucket/$room/probe.json" | grep -q probe \
    && curl -fsS --max-time 10 -X DELETE "$minio_url/$bucket/$room/probe.json" > /dev/null \
    && pass "anonymous rw on $bucket (rooms/applets storage)" || flunk "anonymous rw on $bucket - wonder cannot serve rooms/applets"
done
curl -sS --max-time 10 "$wonder/room/$room/applet/none" | grep -q "no applet" \
  && pass "applet route answers through $wonder" || flunk "applet route broken"

llm_response=$(curl -sS --max-time 20 -X POST "$wonder/llmProxy" -H 'content-type: application/json' \
  -d "{\"targetUrl\":\"https://api.openai.com/v1/chat/completions\",\"originalBody\":{\"model\":\"${smoke_model#*/}\",\"messages\":[{\"role\":\"user\",\"content\":\"Say OK\"}]}}")
if echo "$llm_response" | grep -q "Cannot POST /llmProxy"; then flunk "/llmProxy not registered on the wonder server"
elif echo "$llm_response" | grep -q '"content"'; then pass "/llmProxy -> llm-lite -> upstream answered a completion"
else flunk "/llmProxy upstream replied: $(echo "$llm_response" | tr -d '\n' | head -c 140)"; fi
curl -fsS --max-time 10 "$wonder/llmProxy/models" | grep -q '"data"' \
  && pass "/llmProxy/models lists the llm-lite catalog (model-selection UI source)" || flunk "/llmProxy/models"
mcurl -X POST "$market/api/v1/skills/" -H 'content-type: application/json' \
  -d '{"id":"smokeSkill","display_name":"Smoke skill","description":"fact: SIM_SMOKE_OK","skill_md":"# smoke\nThe phrase is SIM_SMOKE_OK."}' \
  > /dev/null && pass "skill create (S3 put incl MARKETPLACE_S3_STORAGE_CLASS='${MARKETPLACE_S3_STORAGE_CLASS:-}')" || flunk "skill create"
mcurl "$market/api/v1/skills/smokeSkill" | grep -q SIM_SMOKE_OK && pass "skill read" || flunk "skill read"

mcurl -X POST "$market/api/v1/presign/download" -H 'content-type: application/json' -d '{"key":"smoke/presign.txt"}' \
  | grep -q "\"url\":\"$minio_url/" && pass "presigned url is browser-reachable ($minio_url)" || flunk "presigned url not browser-reachable"

mcurl -X POST "$market/api/v1/agents/" -H 'content-type: application/json' \
  -d "{\"id\":\"smokeAgent\",\"display_name\":\"Smoke agent\",\"description\":\"smoke\",\"config\":{\"system_prompt\":\"Answer briefly.\",
       \"backend_config\":{\"harness_type\":\"deepagents\",\"model\":\"${smoke_model#*/}\"},\"skills\":[\"smokeSkill\"]},\"readme\":\"\"}" \
  > /dev/null && pass "agent create" || flunk "agent create"
run=$(mcurl -X POST "$agno/agents/smokeAgent/runs" -F message='What is the phrase?' -F session_id="$room" -F user_id=smoke -F stream=false)
echo "$run" | grep -q '"content"' && pass "agno run (agent created on marketplace, run by agno via shared S3)" || flunk "agno run: $run"

for resource in agents/smokeAgent skills/smokeSkill; do mcurl -X DELETE "$market/api/v1/$resource" > /dev/null || flunk "cleanup $resource"; done
[ "$fail" = 0 ] && pass "cleanup + ALL CHECKS"
exit $fail
