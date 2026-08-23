#!/usr/bin/env bash
set -a
source "$(dirname "$0")/.env"
set +a
cd "$(dirname "$0")"
PYTHON_PATH="${MARKETPLACE_PYTHON:-../platform-v0/.venv/bin/python}"
exec "$PYTHON_PATH" marketplace_server.py
