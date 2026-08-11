#!/usr/bin/env bash
set -eo pipefail

ROOT="$(git rev-parse --show-toplevel)"
DEPLOY_DIR="$(mktemp -d)"
trap 'rm -rf "$DEPLOY_DIR"' EXIT
echo "Deploying jb6/react/lib/* to https://jb6-cdn.pages.dev/*"
echo "Deploying wonder/images/* to https://jb6-cdn.pages.dev/images/*"
cp -r "$ROOT/jb6/react/lib/." "$DEPLOY_DIR/"
mkdir -p "$DEPLOY_DIR/images"
cp -r "$ROOT/wonder/images/." "$DEPLOY_DIR/images/"
npx wrangler pages deploy "$DEPLOY_DIR" --project-name jb6-cdn
echo "Deployed React libraries and Wonder images to https://jb6-cdn.pages.dev"
