# compat:dify Stub Service

## Background

The API side already had:

- `compat:dify` adapter registration
- adapter health probing
- plugin registry routes

But there was still no real standalone service behind `SEVENFLOWS_PLUGIN_COMPAT_DIFY_ENDPOINT`.
That meant the current compat layer could be configured, but not exercised against an actual service boundary.

## Goal

Provide a minimal `services/compat-dify/` service that makes the compat architecture concrete without pretending the full Dify plugin runtime is already finished.

## What Was Added

New service directory:

- `services/compat-dify/app/main.py`
- `services/compat-dify/app/config.py`
- `services/compat-dify/app/schemas.py`
- `services/compat-dify/tests/test_adapter_app.py`
- `services/compat-dify/Dockerfile`
- `services/compat-dify/pyproject.toml`
- `services/compat-dify/README.md`

Service contract:

- `GET /healthz`
- `POST /invoke`

Current behavior:

- only accepts ecosystem `compat:dify`
- validates adapter id from payload/header
- returns stubbed success output shaped like the API-side `PluginCallProxy` expects
- intentionally echoes request inputs instead of pretending to execute real Dify plugins

## Docker Integration

`docker/docker-compose.yaml` now includes:

- `compat-dify` service
- API env wiring to enable `SEVENFLOWS_PLUGIN_COMPAT_DIFY_ENABLED=true`
- API endpoint wiring to `http://compat-dify:8091`

This gives the docker stack a real compat adapter target for health checks and invoke flows.

## Boundaries

This is still a stub service, not a finished Dify adapter implementation.

Not implemented in this round:

- manifest install / discovery
- tool catalog sync
- credential translation or secret management
- real Dify plugin execution
- persistent adapter state

## Verification

Verified with:

- `.\api\.venv\Scripts\python.exe -m pytest`
- `.\api\.venv\Scripts\python.exe -m pytest tests/test_adapter_app.py` in `services/compat-dify`
- `.\api\.venv\Scripts\python.exe -m compileall app` in `services/compat-dify`

## Next Step

The next useful step is to formalize manifest translation and tool discovery so the stub can evolve from "echo invoke endpoint" into a real `compat:dify` adapter runtime.
