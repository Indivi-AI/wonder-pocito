set -a; . solutions/pocito/.env.onprem; set +a; internalAgno=; [ -n "${AGNO_API_URL:-}" ] || { internalAgno=agno; AGNO_API_URL=http://localhost:7778; }; export AGNO_API_URL
p=solutions/pocito; v=/opt/pocito/venvs; mp=http://localhost:${MARKETPLACE_PORT:-7777}; app=http://localhost:${POCITO_PORT:-3007}; llm=http://localhost:${LITELLM_PORT:-4000}
k=${MINIO_ACCESS_KEY:-wonder}; s=${MINIO_SECRET_KEY:-wonder-minio-local}; export LITELLM_LOCAL_MODEL_COST_MAP=True LITELLM_LOCAL_POLICY_TEMPLATES=true LITELLM_LOCAL_BLOG_POSTS=True
export ENV_PATH=$p/.env.onprem WONDER_AUTH_MODE=none STORAGE_PROVIDER=minio WONDER_STORAGE_URL=$MINIO_ENDPOINT WONDER_LOCAL_SERVER=$app WONDER_SERVICE_URL=$app
export WONDER_CDN_URL=$app/jb6_packages/react/lib MARKETPLACE_API_URL=$mp MARKETPLACE_S3_ENDPOINT=$MINIO_ENDPOINT MARKETPLACE_S3_PUBLIC_ENDPOINT=$MINIO_ENDPOINT
export MARKETPLACE_S3_ACCESS_KEY=$k MARKETPLACE_S3_SECRET_KEY=$s LITELLM_HOST=$llm OPENAI_BASE_URL=$llm/v1 OPENAI_API_KEY=unused OPENAI_MODEL=chat
trap 'trap - TERM INT EXIT; kill 0' TERM INT EXIT; $v/litellm/bin/litellm --config $p/on-prem/litellm/config.local.yaml --port ${LITELLM_PORT:-4000} &
for service in marketplace $internalAgno; do $v/$service-server/bin/python $p/$service-server/${service}_server.py & done
for url in $mp/healthz ${AGNO_API_URL%/}/healthz; do until curl -fsS $url >/dev/null; do sleep .5; done; done; node $p/traveling-test/scripts/seed-marketplace-assets.mjs
LLM_PROXY_MODE=onprem LLM_PROXY_URL=$app/llmProxy POCITO_BIND_HOST=0.0.0.0 PORT=${POCITO_PORT-3007} node --import ./nodejs-importmap.js $p/on-prem/dev/pocito-local-server.js & wait
