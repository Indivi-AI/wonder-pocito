#!/usr/bin/env bash
set -euo pipefail
root="$(git rev-parse --show-toplevel)"; cd "$root"
rev="$(git rev-parse --short=12 HEAD)"; branch="$(git branch --show-current)"
parts=1 pinned=1 separate=""
while [[ "${1:-}" == --* ]]; do case "$1" in
  --parts) parts="${2:?--parts needs a number}"; shift 2;;   # split the final tar for size-capped whitening
  --no-pinned) pinned=""; shift;;   # update kit: skip litellm+pgvector - the site already has them from the first full kit
  --separate) separate=1; shift;;   # one file per image + the bundle + kit files, no outer tar - to see which file whitening rejects
  *) echo "unknown flag: $1" >&2; exit 1;;
esac; done
[[ -z "$separate" || "$parts" == 1 ]] || { echo '--separate and --parts are mutually exclusive' >&2; exit 1; }
kind=lean; [[ -n "$pinned" ]] || kind=apps; [[ -z "$separate" ]] || kind="$kind-split"
out="${1:-$(dirname "$root")/wonder-docker-airgap-$rev-$kind}"; [[ "$out" = /* ]] || out="$PWD/$out"
platform="${PLATFORM:-linux/amd64}"; litellm="wonder-llm-lite:1.98.0"; pgvector="pgvector/pgvector:0.8.6-pg16-bookworm"
[[ "$platform" == linux/amd64 ]] || { echo 'The deployment kit must target linux/amd64' >&2; exit 1; }
[[ ! -e "$out" && ! -e "$out.tar" ]] || { echo "Output already exists: $out or $out.tar" >&2; exit 1; }
for tool in docker git gzip sha256sum tar; do command -v "$tool" >/dev/null || { echo "Missing command: $tool" >&2; exit 1; }; done

tag="$(solutions/pocito/on-prem/build-images.sh --base | tee /dev/stderr | sed -n 's/^IMAGE_TAG=//p')"
runtimes=("wonder-server:$tag" "marketplace-server:$tag")
[[ -z "$pinned" ]] || { docker pull --platform "$platform" "$pgvector"; runtimes+=("$litellm" "$pgvector"); }
images=(wonder-server-base:latest marketplace-server-base:latest "${runtimes[@]}")
for image in "${images[@]}"; do
  [[ "$(docker image inspect --platform "$platform" "$image" -f '{{.Os}}/{{.Architecture}}')" == "$platform" ]] \
    || { echo "Wrong platform: $image" >&2; exit 1; }
done

mkdir -p "$out"
cp solutions/pocito/on-prem/{docker-compose.yml,compose.airgap.yml,sim-check.sh,docker-up.sh} "$out/"
sed "/^IMAGE_TAG=/d;/build-images.sh output/d" solutions/pocito/on-prem/.env.site.template > "$out/.env.example"   # manifest.env supplies IMAGE_TAG
cp solutions/pocito/on-prem/llm-lite-config.template.yaml "$out/llm-lite-config.example.yaml"
cp solutions/pocito/on-prem/helm/wonder/files/minio-init.py "$out/"
git bundle create "$out/wonder.bundle" HEAD "refs/heads/$branch"
{ git diff HEAD --binary
  for file in solutions/pocito/on-prem/{AIRGAP-KIT.md,create-docker-airgap-kit.sh,docker-up.sh,llm-lite.docker,wonder-server-base.docker}; do
    git ls-files --error-unmatch "$file" >/dev/null 2>&1 || git diff --no-index --binary /dev/null "$file" || true
  done
} > "$out/source.patch"
git status --short > "$out/source-status.txt"
printf 'IMAGE_TAG=%q\nLLM_LITE_IMAGE=%q\nPGVECTOR_IMAGE=%q\nKIT_PLATFORM=%q\nKIT_COMMIT=%q\n' \
  "$tag" "$litellm" "$pgvector" "$platform" "$rev" > "$out/manifest.env"
docker image inspect --platform "$platform" "${images[@]}" \
  --format '{{join .RepoTags ","}} {{.Id}} {{.Os}}/{{.Architecture}} {{.Size}}' > "$out/images.txt"
if [[ -n "$separate" ]]; then
  for image in "${images[@]}"; do   # docker-up.sh loads every *.image.tar.gz it finds
    docker save --platform "$platform" "$image" | gzip -6 > "$out/$(echo "$image" | tr '/:' '--').image.tar.gz"
  done
else
  docker save --platform "$platform" "${images[@]}" | gzip -6 > "$out/images.tar.gz"
fi
chmod +x "$out/docker-up.sh" "$out/sim-check.sh"
cp solutions/pocito/on-prem/AIRGAP-KIT.md "$out/README.md"
(cd "$out" && ls | grep -vx SHA256SUMS | xargs sha256sum > SHA256SUMS)
if [[ -n "$separate" ]]; then
  echo "Split kit - carry EVERY file in: $out"; ls -lh "$out"
  exit 0
fi
tar -cf "$out.tar" -C "$(dirname "$out")" "$(basename "$out")"
(cd "$(dirname "$out")" && sha256sum "$(basename "$out").tar" > "$(basename "$out").tar.sha256")
if (( parts > 1 )); then
  split -b $(( $(wc -c < "$out.tar") / parts + 1 )) "$out.tar" "$out.tar.part-"
  rm "$out.tar"
  (cd "$(dirname "$out")" && sha256sum "$(basename "$out")".tar.part-* >> "$(basename "$out").tar.sha256")
  echo "Air-gap kit in $parts parts: $out.tar.part-*"
  echo "Reassemble inside: cat $(basename "$out").tar.part-* > $(basename "$out").tar && sha256sum -c --ignore-missing $(basename "$out").tar.sha256"
else
  echo "Air-gap kit: $out.tar"
fi
