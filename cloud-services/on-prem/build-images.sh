#!/usr/bin/env bash
# Build the on-prem images. --base also (re)builds the dependency bases (network needed - outside only).
# App layers build with --network=none on purpose: proves in-gap rebuilds work from the whitened bases.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
STAMP="$(date +%d-%m-%Y-%H-%M)-$(git rev-parse --short=7 HEAD)"
if [[ "${1:-}" == --base ]]; then
  docker build -f cloud-services/wonder-base.docker -t wonder-server-base:latest .
  docker build -f cloud-services/on-prem/marketplace-server-base.docker -t marketplace-server-base:latest solutions/idf/marketplace-server
fi
docker build --network=none -f cloud-services/on-prem/wonder-server.docker -t "wonder-server:$STAMP" .
docker build --network=none -f cloud-services/on-prem/marketplace-server.docker -t "marketplace-server:$STAMP" solutions/idf/marketplace-server
echo "IMAGE_TAG=$STAMP"
