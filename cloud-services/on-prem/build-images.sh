#!/usr/bin/env bash
# Build the on-prem images. --base also (re)builds the dependency bases (network needed - outside only).
# App layers build with --network=none on purpose: proves in-gap rebuilds work from the whitened bases.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
PLATFORM="${PLATFORM:-linux/amd64}"   # the SITE's architecture, not the build machine's (mac arm builds still target amd64 sites)
STAMP="$(date +%d-%m-%Y-%H-%M)-$(git rev-parse --short=7 HEAD)"
if [[ "${1:-}" == --base ]]; then
  docker build --platform "$PLATFORM" -f cloud-services/wonder-base.docker -t wonder-server-base:latest .
  docker build --platform "$PLATFORM" -f cloud-services/on-prem/marketplace-server-base.docker -t marketplace-server-base:latest solutions/pocito/marketplace-server
fi
docker build --platform "$PLATFORM" --network=none -f cloud-services/on-prem/wonder-server.docker -t "wonder-server:$STAMP" .
docker build --platform "$PLATFORM" --network=none -f cloud-services/on-prem/marketplace-server.docker -t "marketplace-server:$STAMP" solutions/pocito/marketplace-server
echo "IMAGE_TAG=$STAMP"
