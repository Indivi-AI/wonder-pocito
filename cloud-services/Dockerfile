ARG BASE_IMAGE=me-west1-docker.pkg.dev/indiviai/cloud-run-source-deploy/node24-wonder-base:latest
FROM ${BASE_IMAGE}
ARG BUILD_TARGET=prod

RUN curl -fsSL https://github.com/duckdb/duckdb/releases/download/v1.5.4/duckdb_cli-linux-amd64.zip -o /tmp/d.zip \
 && unzip -d /usr/local/bin /tmp/d.zip && rm /tmp/d.zip \
 && duckdb -c "INSTALL httpfs; INSTALL cache_httpfs FROM community;"

COPY nodejs-importmap.js nodejs-importmap-loader.js ./
COPY jb6 ./jb6
COPY wonder ./wonder
COPY indiviai ./indiviai
COPY cloud-services ./cloud-services
COPY cloud-services/express-server/.env.${BUILD_TARGET} .env

ENV NODE_ENV=production COLS_CACHE_EXT=/usr/src/app/wonder/bi/cols-cache/cols_cache.duckdb_extension
RUN test -f .env || (echo "ERROR: .env file not found for BUILD_TARGET=${BUILD_TARGET}" && exit 1)
RUN grep -q "WHAPI_TOKEN_WONDER_DEMO" .env || (echo "ERROR: WHAPI_TOKEN_WONDER_DEMO not found in .env" && exit 1)
RUN echo "=== ENV FILE WHAPI VARS ===" && grep WHAPI .env && echo "=== END ENV FILE ==="

EXPOSE 8080
CMD ["node", "--experimental-vm-modules", "--expose-gc", "--import", "./nodejs-importmap.js", "cloud-services/express-server/server.js"]
