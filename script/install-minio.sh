#!/usr/bin/env bash
set -euo pipefail

case $(uname -m) in
  x86_64) arch=amd64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

mkdir -p "$HOME/.local/bin" "$HOME/.minio-data"
for artifact in server/minio/minio client/mc/mc; do
  bin=${artifact##*/}
  curl -fsSL "https://dl.min.io/${artifact%/*}/release/linux-$arch/$bin" -o "$HOME/.local/bin/$bin"
  chmod +x "$HOME/.local/bin/$bin"
done
echo "Installed MinIO and mc in $HOME/.local/bin"
