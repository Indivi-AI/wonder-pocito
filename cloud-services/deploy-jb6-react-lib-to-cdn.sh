#!/usr/bin/env bash
set -eo pipefail

ROOT="$(git rev-parse --show-toplevel)"
BUCKET="${1:-gs://wonder-frontend-me-west1}"
gsutil -m cp -n -r "$ROOT/jb6/react/lib" "$BUCKET/jb6_packages/react/"
