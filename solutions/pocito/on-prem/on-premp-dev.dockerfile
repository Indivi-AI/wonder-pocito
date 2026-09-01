# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS node
FROM ghcr.io/astral-sh/uv:0.11.7 AS uv
FROM debian:bookworm-slim

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=uv /uv /uvx /usr/local/bin/

ARG UV_PYTHON_VERSION=3.10
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates git python3 python3-pip tini \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && useradd --create-home --uid 1000 pocito

COPY package.json package-lock.json /tmp/pocito-npm/
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    cd /tmp/pocito-npm && npm ci --omit=optional && mkdir -p /workspace \
    && mv node_modules /workspace/node_modules && rm -rf /tmp/pocito-npm
COPY solutions/pocito/flapi-mock/package.json solutions/pocito/flapi-mock/package-lock.json /tmp/flapi-npm/
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    cd /tmp/flapi-npm && npm ci && mkdir -p /workspace/solutions/pocito/flapi-mock \
    && mv node_modules /workspace/solutions/pocito/flapi-mock/node_modules && rm -rf /tmp/flapi-npm

ENV UV_PYTHON_INSTALL_DIR=/opt/pocito/python TIKTOKEN_CACHE_DIR=/opt/pocito/tiktoken
COPY solutions/pocito/marketplace-server/pyproject.toml solutions/pocito/marketplace-server/uv.lock /opt/pocito/manifests/marketplace-server/
COPY solutions/pocito/agno-server/pyproject.toml solutions/pocito/agno-server/uv.lock /opt/pocito/manifests/agno-server/
COPY solutions/pocito/on-prem/litellm/pyproject.toml solutions/pocito/on-prem/litellm/uv.lock /opt/pocito/manifests/litellm/
RUN --mount=type=secret,id=uvconfig,target=/root/.config/uv/uv.toml \
    for project in marketplace-server agno-server litellm; do \
      uv export --frozen --no-dev --no-emit-project --project /opt/pocito/manifests/$project --output-file /tmp/requirements.txt \
      && uv venv --python ${UV_PYTHON_VERSION} /opt/pocito/venvs/$project \
      && uv pip sync --require-hashes --python /opt/pocito/venvs/$project/bin/python /tmp/requirements.txt \
      && cat /opt/pocito/manifests/$project/pyproject.toml /opt/pocito/manifests/$project/uv.lock \
        | sha256sum | cut -d ' ' -f 1 > /opt/pocito/venvs/$project/.pocito-lock || exit 1; \
    done
RUN /opt/pocito/venvs/litellm/bin/python -c "import tiktoken; [tiktoken.get_encoding(n) for n in ['cl100k_base', 'o200k_base']]" \
    && mkdir -p /var/lib/pocito \
    && chown -R pocito:pocito /opt/pocito /workspace /var/lib/pocito

ENV POCITO_DEPS_DIR=/opt/pocito POCITO_DATA_DIR=/var/lib/pocito POCITO_BIND_HOST=0.0.0.0 UV_OFFLINE=1
USER pocito
WORKDIR /workspace
VOLUME ["/workspace/node_modules", "/workspace/solutions/pocito/flapi-mock/node_modules", "/var/lib/pocito"]
EXPOSE 3000 7777 7778 4000 6001
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "run", "pocito-dev"]
