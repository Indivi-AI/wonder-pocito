# Installation

## On-prem

Get the image and runtime configuration from internal Artifactory, clone the Git bundle, and mount the checkout in Docker.
Run `npm run pocito-dev-airgapped` inside the container. [Setup](solutions/pocito/on-prem/images/README.md).

## Internet

Install Node 24+ and uv, configure `solutions/pocito/.env.onprem`, then run `npm run pocito-dev`. [Setup](solutions/pocito/local-dev-readme.md).

# Repo Structure

`solutions/pocito/` contains Pocito. `wonder/` provides shared code, DSLs and capabilities.

# Exporting image to on-prem

After committing, run `npm run airgapped-export`: image, current branch's bundle and README go to `solutions/pocito/on-prem/images/`. Add `-- --code` for code only.
