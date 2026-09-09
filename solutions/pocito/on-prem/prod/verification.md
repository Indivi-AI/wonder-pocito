# Production verification · 2026-09-08

2026-09-09 chart update: Helm lint and rendering passed with nine resources: three Deployments, Services and OpenShift Routes.
Verified customer ConfigMap references, optional Secrets/CA mounts, and missing-reference validation; no ConfigMaps or per-key env settings are generated.

Historical results below and the exported 0.1.0-ready images predate the shared runtime revert requested on 2026-09-08.
They do not validate the current lambda runtime. Existing images still contain the reverted changes and need rebuilding after runtime review.
The pocitoProd.runtime test retains expectations for the removed behavior and is pending review; it has not passed against the reverted baseline.

Validation used local MinIO, PostgreSQL, LiteLLM/vLLM and linux/amd64 Docker images.
Container checks used UID 1000650000, group 0, a read-only root filesystem, and a writable /tmp volume.

| Check | Result |
| --- | --- |
| Wonder, Marketplace and Agno startup/readiness | Passed |
| Marketplace CRUD, room scoping, redirects, multipart uploads and binary downloads through direct/gateway paths | Passed |
| Local API documentation assets and relative OpenAPI URLs | Passed |
| Agno MCP through direct/gateway paths, including a Host header without a port | Passed |
| Real model runs through direct Agno and its gateway | Passed |
| Conversation after container replacement | Passed; PostgreSQL contained all three completed runs |
| LLM proxy event streaming | Passed |
| Published applet and mirrored browser runtime in MinIO | Passed; roomAppletHarvest returned no browser/logger errors |
| pocitoProd.sessions | Passed; database persistence and room separation, empty error channels |
| pocitoIntegration.browserGateway | Passed; development gateway regression, empty error channels |
| roomLambdaTest.ensureExtracted.concurrent | Passed |
| Helm lint/render | Passed; 12 resources, three pods, Recreate, TLS Routes, CA mounts, independent image updates |
| pocitoProd.runtime | Passed; published execution, nested callbacks, separate streams, MinIO writes and timeout/disconnect process-group termination |
| Release 0.1.0-ready export and checksums | Passed; three images and Helm package |

Customer OpenShift installation, Route certificates, corporate DNS/firewalls and FLAPI operations were not exercised here.
Application content and the complete runtime asset mirror must be supplied separately when installing the release.
DuckDB was excluded from this release at the user's request.

#Using mininal lines of code#
