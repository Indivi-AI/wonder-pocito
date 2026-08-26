#!/usr/bin/env bash
set -euo pipefail
root="$(git rev-parse --show-toplevel)"; cd "$root"
rev="$(git rev-parse --short=12 HEAD)"; branch="$(git branch --show-current)"
out="${1:-$(dirname "$root")/wonder-docker-airgap-$rev-lean}"; [[ "$out" = /* ]] || out="$PWD/$out"
platform="${PLATFORM:-linux/amd64}"; litellm="wonder-llm-lite:1.98.0"; pgvector="pgvector/pgvector:0.8.6-pg16-bookworm"
[[ "$platform" == linux/amd64 ]] || { echo 'The deployment kit must target linux/amd64' >&2; exit 1; }
[[ ! -e "$out" && ! -e "$out.tar" ]] || { echo "Output already exists: $out or $out.tar" >&2; exit 1; }
for tool in docker git gzip sha256sum tar; do command -v "$tool" >/dev/null || { echo "Missing command: $tool" >&2; exit 1; }; done

tag="$(cloud-services/on-prem/build-images.sh --base | tee /dev/stderr | sed -n 's/^IMAGE_TAG=//p')"
docker pull --platform "$platform" "$pgvector"
runtimes=("wonder-server:$tag" "marketplace-server:$tag" "$litellm" "$pgvector")
images=(wonder-server-base:latest marketplace-server-base:latest "${runtimes[@]}")
for image in "${images[@]}"; do
  [[ "$(docker image inspect --platform "$platform" "$image" -f '{{.Os}}/{{.Architecture}}')" == "$platform" ]] \
    || { echo "Wrong platform: $image" >&2; exit 1; }
done

mkdir -p "$out"
cp cloud-services/on-prem/{docker-compose.yml,compose.airgap.yml,sim-check.sh,docker-up.sh} "$out/"
cp cloud-services/on-prem/.env.site.template "$out/.env.example"
cp cloud-services/on-prem/llm-lite-config.template.yaml "$out/llm-lite-config.example.yaml"
cp cloud-services/on-prem/helm/wonder/files/minio-init.py "$out/"
git bundle create "$out/wonder.bundle" HEAD "refs/heads/$branch"
{ git diff HEAD --binary
  for file in cloud-services/on-prem/{AIRGAP-KIT.md,create-docker-airgap-kit.sh,docker-up.sh,llm-lite.docker,wonder-server-base.docker}; do
    git ls-files --error-unmatch "$file" >/dev/null 2>&1 || git diff --no-index --binary /dev/null "$file" || true
  done
} > "$out/source.patch"
git status --short > "$out/source-status.txt"
printf 'IMAGE_TAG=%q\nLLM_LITE_IMAGE=%q\nPGVECTOR_IMAGE=%q\nKIT_PLATFORM=%q\nKIT_COMMIT=%q\n' \
  "$tag" "$litellm" "$pgvector" "$platform" "$rev" > "$out/manifest.env"
docker image inspect --platform "$platform" "${images[@]}" \
  --format '{{join .RepoTags ","}} {{.Id}} {{.Os}}/{{.Architecture}} {{.Size}}' > "$out/images.txt"
docker save --platform "$platform" "${images[@]}" | gzip -6 > "$out/images.tar.gz"
chmod +x "$out/docker-up.sh" "$out/sim-check.sh"
cp cloud-services/on-prem/AIRGAP-KIT.md "$out/README.md"
(cd "$out" && sha256sum .env.example compose.airgap.yml docker-compose.yml docker-up.sh images.tar.gz images.txt \
  llm-lite-config.example.yaml manifest.env minio-init.py README.md sim-check.sh source.patch source-status.txt wonder.bundle > SHA256SUMS)
tar -cf "$out.tar" -C "$(dirname "$out")" "$(basename "$out")"
(cd "$(dirname "$out")" && sha256sum "$(basename "$out").tar" > "$(basename "$out").tar.sha256")
echo "Air-gap kit: $out.tar"
