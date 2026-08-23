#!/usr/bin/env bash
set -eux pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
pushd "$REPO_ROOT"

#!npm i --save-dev @jb6/testing @jb6/lang-service @jb6/server-utils @jb6/react @jb6/mcp @jb6/llm-guide @jb6/rx @jb6/llm-api @jb6/jq
mkdir -p jb6
cp -rv ../jb6/packages/core jb6/
cp -rv ../jb6/packages/repo jb6/
cp -rv ../jb6/packages/common jb6/
cp -rv ../jb6/packages/testing jb6/
cp -rv ../jb6/packages/react jb6/
cp -rv ../jb6/packages/llm-guide jb6/
cp -rv ../jb6/packages/llm-api jb6/
cp -rv ../jb6/packages/jq jb6/
cp -rv ../jb6/packages/server-utils jb6/
cp -rv ../jb6/packages/rx jb6/
cp -rv ../jb6/packages/mcp jb6/
cp -rv ../jb6/packages/lang-service jb6/
cp -rv ../jb6/packages/probe-studio jb6/

# check the result

cat jb6/core/package.json | grep version
