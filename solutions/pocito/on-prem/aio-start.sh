#!/usr/bin/env bash
# PID1 of the wonder-aio container: run all four app servers, die when any dies (compose restarts the container).
# Code runs from /usr/src/app - the baked repo copy, or the wonder-source clone mounted over it (live-repo serving).
set -euo pipefail
trap 'kill 0' TERM INT
cd /usr/src/app
PORT=8045 node --import ./nodejs-importmap.js cloud-services/express-server/local-server.js &
(cd solutions/pocito/marketplace-server && MARKETPLACE_HOST=0.0.0.0 MARKETPLACE_PORT=8046 python marketplace_server.py) &
(cd solutions/pocito/marketplace-server && AGENT_OS_HOST=0.0.0.0 AGENT_OS_PORT=8047 MARKETPLACE_DATA_DIR=/data python agno_server.py) &
if [[ -s /etc/litellm/config.yaml ]]; then /opt/litellm/bin/litellm --config /etc/litellm/config.yaml --port 4000 &
else echo 'aio-start: no /etc/litellm/config.yaml mounted - litellm not started'; fi
wait -n
exit 1
