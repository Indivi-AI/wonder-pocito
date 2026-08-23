#!/usr/bin/env bash
set -e
OUT_DIR="packages/react/lib"
REACT_VER=19.2.0 LUCIDE_VER=0.5 TAILWIND_VER=4.1.15 JSDOM_VER=26.1.0
mkdir -p "$OUT_DIR"

npx esbuild node_modules/lucide/dist/esm/lucide.js --bundle --format=esm --minify --outfile=$OUT_DIR/lucide-$LUCIDE_VER.mjs
#npx esbuild node_modules/tailwindcss/dist/lib.mjs --bundle --format=esm --minify --outfile=$OUT_DIR/tailwindcss-$TAILWIND_VER.mjs
npx esbuild packages/react/react-all.js --bundle --format=esm --outfile=$OUT_DIR/react-all-$REACT_VER-dev.mjs
npx esbuild packages/react/react-all.js --bundle --format=esm --minify --outfile=$OUT_DIR/react-all-$REACT_VER-prod.mjs
