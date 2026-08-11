#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
docker build --platform linux/amd64 --build-arg "BASE_IMAGE=${BASE_IMAGE:-node24-wonder-base}" -t wonder \
  -f "$ROOT/cloud-services/Dockerfile" "$ROOT"
