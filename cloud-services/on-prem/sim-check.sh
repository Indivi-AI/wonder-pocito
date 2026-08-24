#!/usr/bin/env bash
# Smoke the deployed stack from outside, as a browser would - same script for the sim, the site box, and OpenShift routes.
# Reads .env.site next to this script; needs only curl. Exits non-zero on any failure.
set -uo pipefail
cd "$(dirname "$0")"
set -a; source .env.site; set +a
wonder="$SITE_SCHEME://$SITE_HOST:$WONDER_PUBLISHED_PORT"
market="$SITE_SCHEME://$SITE_HOST:$MARKETPLACE_PUBLISHED_PORT"
room="smoke-$$"
fail=0
pass() { echo "PASS $1"; }
flunk() { echo "FAIL $1"; fail=1; }
mcurl() { curl -fsS --max-time 20 -H "x-wonder-room: $room" "$@"; }

curl -fsS --max-time 10 "$wonder/health" > /dev/null && pass "wonder /health via $wonder" || flunk "wonder /health via $wonder"
curl -fsS --max-time 10 "$market/healthz" | grep -q '"object_store":"ok"' \
  && pass "marketplace healthz + object store" || flunk "marketplace healthz + object store"

mcurl -X POST "$market/api/v1/skills/" -H 'content-type: application/json' \
  -d '{"id":"smokeSkill","display_name":"Smoke skill","description":"fact: SIM_SMOKE_OK","skill_md":"# smoke\nThe phrase is SIM_SMOKE_OK."}' \
  > /dev/null && pass "skill create (S3 put incl MARKETPLACE_S3_STORAGE_CLASS='${MARKETPLACE_S3_STORAGE_CLASS:-}')" || flunk "skill create"
mcurl "$market/api/v1/skills/smokeSkill" | grep -q SIM_SMOKE_OK && pass "skill read" || flunk "skill read"

minio_url="${MINIO_ENDPOINT:-$SITE_SCHEME://$SITE_HOST:$MINIO_PUBLISHED_PORT}"
mcurl -X POST "$market/api/v1/presign/download" -H 'content-type: application/json' -d '{"key":"smoke/presign.txt"}' \
  | grep -q "\"url\":\"$minio_url/" && pass "presigned url is browser-reachable ($minio_url)" || flunk "presigned url not browser-reachable"

mcurl -X POST "$market/api/v1/agents/" -H 'content-type: application/json' \
  -d '{"id":"smokeAgent","display_name":"Smoke agent","description":"smoke","config":{"system_prompt":"Answer briefly.",
       "backend_config":{"harness_type":"deepagents"},"skills":["smokeSkill"]},"readme":""}' \
  > /dev/null && pass "agent create" || flunk "agent create"
run=$(mcurl -X POST "$market/agents/smokeAgent/runs" -F message='What is the phrase?' -F session_id="$room" -F user_id=smoke -F stream=false)
echo "$run" | grep -q '"content"' && pass "AgentOS run (skills materialized, model factory answered)" || flunk "AgentOS run: $run"

for resource in agents/smokeAgent skills/smokeSkill; do mcurl -X DELETE "$market/api/v1/$resource" > /dev/null || flunk "cleanup $resource"; done
[ "$fail" = 0 ] && pass "cleanup + ALL CHECKS"
exit $fail
