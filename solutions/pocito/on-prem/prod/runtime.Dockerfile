FROM ghcr.io/astral-sh/uv:0.12.7@sha256:95f2aa1fe59274951cfe9b0cbc7972e879ff1004bc8945d130a32eb0dbd85945 AS uv
FROM swaggerapi/swagger-ui:v5.31.0 AS docs
FROM node:24-trixie-slim@sha256:50c3b2f6988dfc307b86e5301d69611af31f4789bdf232863b07d3b02fe55ae0 AS wonder
WORKDIR /usr/src/app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tini tar && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci --omit=dev --omit=optional
COPY nodejs-importmap.js nodejs-importmap-loader.js ./
COPY jb6 ./jb6
COPY wonder ./wonder
COPY cloud-services/express-server/lib ./cloud-services/express-server/lib
COPY solutions/pocito/on-prem/pocito-gateway.js ./solutions/pocito/on-prem/
COPY solutions/pocito/on-prem/prod/pocito-prod-server.js ./solutions/pocito/on-prem/prod/
ENV NODE_ENV=production WONDER_AUTH_MODE=none STORAGE_PROVIDER=minio
USER 1001:0
EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--import", "./nodejs-importmap.js", "solutions/pocito/on-prem/prod/pocito-prod-server.js"]

FROM python:3.12-slim-bookworm AS python-runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tini && rm -rf /var/lib/apt/lists/*
COPY --from=uv /uv /usr/local/bin/uv
COPY --from=docs /usr/share/nginx/html/swagger-ui-bundle.js /usr/share/nginx/html/swagger-ui.css /opt/api-docs/
COPY solutions/pocito/marketplace-schema /app/marketplace-schema
ENV UV_PROJECT_ENVIRONMENT=/opt/venv UV_PYTHON_DOWNLOADS=never PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    WONDER_AUTH_MODE=none MARKETPLACE_DATA_DIR=/tmp/marketplace API_DOCS_DIR=/opt/api-docs
ENTRYPOINT ["/usr/bin/tini", "-g", "--"]

FROM python-runtime AS marketplace
WORKDIR /app/marketplace-server
COPY solutions/pocito/marketplace-server/pyproject.toml solutions/pocito/marketplace-server/uv.lock ./
RUN --mount=type=secret,id=uvconfig,target=/root/.config/uv/uv.toml uv sync --frozen --no-dev --no-cache
COPY solutions/pocito/marketplace-server/marketplace_server.py solutions/pocito/marketplace-server/marketplace-openapi.json ./
USER 1001:0
EXPOSE 7777
CMD ["/opt/venv/bin/uvicorn", "marketplace_server:create_app", "--factory", "--host", "0.0.0.0", "--port", "7777"]

FROM python-runtime AS agno
WORKDIR /app/agno-server
COPY solutions/pocito/agno-server/pyproject.toml solutions/pocito/agno-server/uv.lock ./
RUN --mount=type=secret,id=uvconfig,target=/root/.config/uv/uv.toml uv sync --frozen --no-dev --no-cache
ENV AGNO_TELEMETRY=false
COPY solutions/pocito/agno-server/agno_server.py ./
USER 1001:0
EXPOSE 7778
CMD ["/opt/venv/bin/uvicorn", "agno_server:create_app", "--factory", "--host", "0.0.0.0", "--port", "7778"]
