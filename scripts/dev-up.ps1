Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Push-Location "$PSScriptRoot\\..\\docker"
try {
  if (-not (Test-Path .\\middleware.env)) {
    Copy-Item .\\middleware.env.example .\\middleware.env
  }

  docker compose -f .\\docker-compose.middleware.yaml up -d
}
finally {
  Pop-Location
}
