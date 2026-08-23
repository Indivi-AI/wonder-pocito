#!/usr/bin/env bash
# builds the airgap offline kit: syncer scripts + one static linux ffmpeg, checksummed, as a single tar for the transfer medium.
# run OUTSIDE the air gap. ffmpeg comes from the pypi imageio-ffmpeg wheel (static, versioned); FFMPEG_BIN=/path vendors your own instead.
# ARCH=aarch64 for arm servers. inside: verify the .sha256, then  tar -xzf syncer-kit.tar.gz -C /path/to/wonder  (drops syncer/ffmpeg in place)
set -euo pipefail
cd "$(dirname "$0")/.."
ARCH=${ARCH:-x86_64} KIT=${1:-syncer/syncer-kit.tar.gz} TMP=$(mktemp -d) && trap 'rm -rf "$TMP"' EXIT
sum() { if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }
if [ -n "${FFMPEG_BIN:-}" ]; then cp "$FFMPEG_BIN" syncer/ffmpeg
else
  pip3 download imageio-ffmpeg --only-binary=:all: --platform "manylinux2014_$ARCH" --no-deps -q -d "$TMP"
  python3 -m zipfile -e "$TMP"/imageio_ffmpeg-*.whl "$TMP/whl" && cp "$TMP"/whl/imageio_ffmpeg/binaries/ffmpeg-linux-* syncer/ffmpeg
fi
chmod +x syncer/ffmpeg
(cd syncer && sum ffmpeg diff-to-media.js video-to-pages.js README.md > SHA256SUMS)
tar -czf "$KIT" syncer/ffmpeg syncer/SHA256SUMS syncer/diff-to-media.js syncer/video-to-pages.js syncer/README.md
(cd "$(dirname "$KIT")" && sum "$(basename "$KIT")" > "$(basename "$KIT").sha256")
echo "kit: $KIT ($(du -h "$KIT" | cut -f1)) + $KIT.sha256 - transfer both, verify with sha256sum -c, extract at the wonder repo root"
