#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
docker build --platform linux/amd64 -t node24-wonder-base -f "$ROOT/cloud-services/Dockerfile.base" "$ROOT"
