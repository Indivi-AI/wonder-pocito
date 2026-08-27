# Wonder aio kit on Windows: Docker Desktop (Linux containers, WSL2 backend) is the only requirement - no git, no bash.
# From the kit directory:  powershell -ExecutionPolicy Bypass -File .\docker-up.ps1
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot
docker compose version | Out-Null
if ($LASTEXITCODE) { throw 'Docker Desktop with Compose v2 is required (and must be running)' }
if (!(Test-Path .env)) { Copy-Item .env.example .env; Write-Host 'Created .env - fill the values (MINIO empty = built-in local minio), then rerun'; exit 1 }
if (!(Test-Path llm-lite-config.yaml)) {
  Copy-Item llm-lite-config.example.yaml llm-lite-config.yaml; Write-Host 'Created llm-lite-config.yaml - fill the LLM endpoint, then rerun'; exit 1 }
foreach ($line in Get-Content manifest.env) { if ($line -match '=') { $k, $v = $line -split '=', 2; Set-Item "env:$k" $v.Trim("'") } }
if (!$env:KIT_COMPOSE) { $env:KIT_COMPOSE = 'compose.aio.yml' }
if (!(Select-String -Path .env -Pattern '^SITE_HOST=.+' -Quiet)) { Add-Content .env "SITE_HOST=$($env:COMPUTERNAME.ToLower())" }

$images = $env:KIT_IMAGES -split ' '
docker image inspect $images *> $null
if ($LASTEXITCODE) { Get-ChildItem images.tar.gz, *.image.tar.gz -ErrorAction SilentlyContinue | ForEach-Object { docker load -i $_.FullName } }
docker image inspect $images | Out-Null
if ($LASTEXITCODE) { throw "Missing images after load: $env:KIT_IMAGES" }

if (!(Test-Path wonder-source)) {   # live-repo applet serving needs the source as a real git clone; git runs inside the aio image
  docker run --rm -v "${PWD}:/kit" -w /kit --user 0 $env:AIO_IMAGE bash -c `
    'git clone wonder.bundle wonder-source; if [ -s source.patch ]; then git -C wonder-source apply --whitespace=nowarn ../source.patch; fi; chmod -R a+rwX wonder-source'
  if ($LASTEXITCODE) { throw 'cloning wonder.bundle failed' }
}

$compose = @('compose', '--env-file', '.env', '-f', $env:KIT_COMPOSE)
if (!(Select-String -Path .env -Pattern '^MINIO_ENDPOINT=.+' -Quiet)) { $compose += @('--profile', 'local-minio') }
docker @compose config | Out-Null
if ($LASTEXITCODE) { throw 'compose config failed - check .env' }
docker @compose up -d --pull never --remove-orphans
docker @compose ps
$siteHost = @(Select-String -Path .env -Pattern '^SITE_HOST=(.+)')[-1].Matches[0].Groups[1].Value
Write-Host "Wonder:      http://${siteHost}:58045/room/<roomId>/applet/<name>   (ports shift with your .env overrides)"
Write-Host "Marketplace: http://${siteHost}:58046/docs"
Write-Host "AgentOS:     http://${siteHost}:58049/docs"
