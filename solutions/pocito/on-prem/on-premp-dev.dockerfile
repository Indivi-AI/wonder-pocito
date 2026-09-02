# syntax=docker/dockerfile:1.7
FROM node:24-trixie-slim@sha256:50c3b2f6988dfc307b86e5301d69611af31f4789bdf232863b07d3b02fe55ae0 AS node
FROM ghcr.io/astral-sh/uv:0.12.7@sha256:95f2aa1fe59274951cfe9b0cbc7972e879ff1004bc8945d130a32eb0dbd85945 AS uv
FROM minio/mc@sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727 AS minio-client
FROM debian:trixie-slim@sha256:d7e12182ce18b85b93007c1dedf31f2d29e01ccf3182cc4017c709b6259bc132 AS pocito-dev-base
ARG POCITO_BUNDLE=wonder-pocito.bundle
ARG POCITO_BUNDLE_BRANCH=master

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=uv /uv /uvx /usr/local/bin/
ARG UV_PYTHON_VERSION=3.12.12
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    apt-get update && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends curl ca-certificates git python3 python3-pip tini bash rsync jq less \
      vim-tiny zip unzip procps iputils-ping dnsutils netcat-openbsd openssh-client openssh-server \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && npm install --global npm@11.19.1 --no-audit --no-fund \
    && useradd --create-home --uid 1000 --shell /bin/bash pocito

COPY package.json package-lock.json /tmp/pocito-npm/
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    cd /tmp/pocito-npm && npm ci --omit=optional && mkdir -p /workspace \
    && mv node_modules /workspace/node_modules && rm -rf /tmp/pocito-npm
COPY solutions/pocito/flapi-mock/package.json solutions/pocito/flapi-mock/package-lock.json /tmp/flapi-npm/
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    cd /tmp/flapi-npm && npm ci && mkdir -p /opt/pocito/flapi-mock \
    && mv node_modules /opt/pocito/flapi-mock/node_modules && rm -rf /tmp/flapi-npm

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
    && mkdir -p /var/lib/pocito /workspace/repo \
    && chown -R pocito:pocito /opt/pocito /var/lib/pocito /workspace/repo

COPY --from=minio-client /usr/bin/mc /usr/local/bin/mc
ADD --chmod=755 --checksum=sha256:c6a306347a57c872bf38587e81132db50490228867e3e179a363a4cf874da1a0 \
    https://github.com/can1357/oh-my-pi/releases/download/v18.1.2/omp-linux-x64 /opt/pocito/bin/omp
ADD --checksum=sha256:16c45f9d667442781f03fa198914cc39abcaa48ec5ed8f644643e554ca2fbf63 \
    https://github.com/can1357/oh-my-pi/releases/download/v18.1.2/LICENSE /usr/share/licenses/omp/LICENSE
ADD --checksum=sha256:104142244b8781b7828e64aa79a61b03fdf16e8a3464278647c3d84ad22cbce0 \
    https://github.com/can1357/oh-my-pi/releases/download/v18.1.2/THIRD-PARTY-NOTICES.txt /usr/share/licenses/omp/THIRD-PARTY-NOTICES.txt
COPY ${POCITO_BUNDLE} /opt/pocito/wonder-pocito.bundle
COPY solutions/pocito/on-prem/dev/git-attributes /etc/pocito/gitattributes
RUN git config --system core.autocrlf false && git config --system core.filemode false \
    && git config --system core.attributesFile /etc/pocito/gitattributes
COPY --chmod=755 solutions/pocito/on-prem/dev/omp.mjs /usr/local/bin/omp
COPY --chmod=755 solutions/pocito/on-prem/dev/pocito-entrypoint.sh /usr/local/bin/pocito-entrypoint
COPY --chmod=755 solutions/pocito/on-prem/dev/start-sshd.sh /usr/local/bin/start-pocito-sshd
COPY solutions/pocito/on-prem/dev/sshd_config /etc/ssh/sshd_config_pocito

ENV POCITO_DEPS_DIR=/opt/pocito POCITO_DATA_DIR=/var/lib/pocito POCITO_NODE_MODULES=/workspace/node_modules \
    POCITO_BIND_HOST=0.0.0.0 POCITO_BUNDLE_BRANCH=${POCITO_BUNDLE_BRANCH} PI_CODING_AGENT_DIR=/var/lib/pocito/omp \
    OTEL_SDK_DISABLED=true UV_OFFLINE=1
USER pocito
WORKDIR /workspace/repo
VOLUME ["/workspace/repo", "/home/pocito", "/var/lib/pocito"]
EXPOSE 2222 3000 7777 7778 4000 6001
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/pocito-entrypoint"]
CMD ["/usr/local/bin/start-pocito-sshd"]

FROM pocito-dev-base AS pocito-dev-sudo
USER root
RUN apt-get update && apt-get install -y --no-install-recommends sudo && rm -rf /var/lib/apt/lists/* \
    && printf 'pocito:pocito\n' | chpasswd && usermod --append --groups sudo pocito
USER pocito

FROM pocito-dev-base AS pocito-dev
