#!/usr/bin/env bash
set -a
source "$(dirname "$0")/../../../cloud-services/express-server/.env.dev"
set +a
cd "$(dirname "$0")"
exec .venv/bin/python agno_server.py
