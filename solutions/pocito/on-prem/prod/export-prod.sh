#!/usr/bin/env bash
set -euo pipefail
repoRoot=$(cd "$(dirname "$0")/../../../.." && pwd)
version=${1:?Usage: export-prod.sh VERSION [OUTPUT_DIRECTORY]}
releaseDir=${2:-$repoRoot/solutions/pocito/on-prem/prod/releases/$version}
prodDir=$repoRoot/solutions/pocito/on-prem/prod
chartDir=$repoRoot/solutions/pocito/on-prem/helm/pocito
[[ ! -e "$releaseDir" ]] || { echo "Output already exists: $releaseDir" >&2; exit 1; }
mkdir -p "$releaseDir"
buildArgs=(--progress=plain)
[[ ! -f "$HOME/.npmrc" ]] || buildArgs+=(--secret "id=npmrc,src=$HOME/.npmrc")
[[ -z "${UV_CONFIG_FILE:-}" ]] || buildArgs+=(--secret "id=uvconfig,src=$UV_CONFIG_FILE")
images=()
for service in wonder marketplace agno; do
  image=pocito-$service:$version
  docker build --platform "${PLATFORM:-linux/amd64}" --target "$service" "${buildArgs[@]}" -t "$image" -f "$prodDir/runtime.Dockerfile" "$repoRoot"
  images+=("$image")
  docker image inspect --format '{{index .RepoTags 0}} {{.Id}}' "$image" >> "$releaseDir/images.txt"
done
docker save -o "$releaseDir/images.tar" "${images[@]}"
helm lint "$chartDir" -f "$prodDir/customer-values.example.yaml"
helm package "$chartDir" --destination "$releaseDir"
cp "$prodDir/customer-values.example.yaml" "$prodDir/README.md" "$prodDir/deployment-reference.md" "$releaseDir/"
(cd "$releaseDir" && shasum -a 256 images.tar images.txt pocito-*.tgz customer-values.example.yaml README.md deployment-reference.md > SHA256SUMS)
echo "Release saved to $releaseDir"
