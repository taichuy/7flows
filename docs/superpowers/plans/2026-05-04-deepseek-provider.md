# DeepSeek Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated DeepSeek official model provider plugin and extend the 1flowbase host provider contract with balance and input cache usage support.

**Architecture:** This is a cross-repository implementation. The main repository owns stable contracts, runtime routes, console APIs, and persisted usage fields. The official plugins repository owns the dedicated `deepseek` provider implementation, manifest, model metadata, localized parameter form, balance adapter, and chat/completions adapter.

**Tech Stack:** Rust 2021, Axum, serde/serde_json, sqlx/PostgreSQL migrations, plugin-runner stdio JSON, reqwest, Node.js `node --test`.

---

## Execution Rules

- Plan language: English.
- Commit messages: English.
- Do not use `git worktree`; work in the current repositories.
- Primary repo: `/home/taichu/git/1flowbase`.
- Official plugin repo: `/home/taichu/git/1flowbase-official-plugins`.
- Do not edit `api/plugins/installed/`; it is an installed artifact area.
- Commit and push each repository after its own coherent task set.
- Each task must follow TDD: failing test, verify failure, implementation, verify pass, commit.
- After each completed task, update the checkbox status in the relevant plan file.

## Subplans

- [x] [01 - Main Provider Contract And API](2026-05-04-deepseek-provider-01-main-contract-api.md)
  - Adds `ProviderUsage.input_cache_hit_tokens`.
  - Adds `ProviderUsage.input_cache_miss_tokens`.
  - Adds provider `balance` stdio method and DTOs.
  - Adds plugin-runner balance support.
  - Adds console API route `GET /api/console/model-providers/{id}/balance`.
  - Adds persistence for input cache usage fields.

- [x] [02 - Official DeepSeek Provider](2026-05-04-deepseek-provider-02-official-plugin.md)
  - Adds `runtime-extensions/model-providers/deepseek`.
  - Adds manifest, provider YAML, static model metadata, i18n, icon, readme.
  - Implements config normalization, `/models`, `/user/balance`, and streaming `/chat/completions`.
  - Maps DeepSeek `prompt_cache_hit_tokens` and `prompt_cache_miss_tokens`.
  - Does not hard-code current DeepSeek prices.

- [x] [03 - Verification And Delivery](2026-05-04-deepseek-provider-03-verification-delivery.md)
  - Runs focused main-repo tests.
  - Runs official plugin tests.
  - Runs package dry-run when local tooling is available.
  - Uses `qa-evaluation` before final delivery.
  - Confirms both repositories are clean and pushed.

## Cross-Repo File Map

Main repository files:

- `api/crates/plugin-framework/src/provider_contract.rs`
- `api/crates/plugin-framework/src/_tests/provider_contract_tests.rs`
- `api/apps/plugin-runner/src/provider_host.rs`
- `api/apps/plugin-runner/src/lib.rs`
- `api/apps/plugin-runner/tests/provider_runtime_routes.rs`
- `api/apps/api-server/src/provider_runtime.rs`
- `api/crates/control-plane/src/ports/runtime.rs`
- `api/crates/control-plane/src/ports/mod.rs`
- `api/crates/control-plane/src/model_provider.rs`
- `api/crates/control-plane/src/model_provider/balance.rs`
- `api/apps/api-server/src/routes/plugins_and_models/model_providers.rs`
- `api/apps/api-server/src/openapi.rs`
- `api/apps/api-server/src/_tests/model_provider_routes.rs`
- `api/crates/orchestration-runtime/src/execution_engine.rs`
- `api/crates/control-plane/src/orchestration_runtime/persistence.rs`
- `api/crates/control-plane/src/orchestration_runtime/live_debug_run.rs`
- `api/crates/storage-durable/postgres/migrations/20260504213000_add_input_cache_usage_fields.sql`
- `api/crates/storage-durable/postgres/src/orchestration_runtime_repository.rs`
- `api/crates/storage-durable/postgres/src/mappers/orchestration_runtime_mapper.rs`
- `api/crates/storage-durable/postgres/src/_tests/orchestration_runtime_repository_tests.rs`

Official plugin repository files:

- `runtime-extensions/model-providers/deepseek/manifest.yaml`
- `runtime-extensions/model-providers/deepseek/provider/deepseek.yaml`
- `runtime-extensions/model-providers/deepseek/Cargo.toml`
- `runtime-extensions/model-providers/deepseek/src/main.rs`
- `runtime-extensions/model-providers/deepseek/src/lib.rs`
- `runtime-extensions/model-providers/deepseek/models/llm/_position.yaml`
- `runtime-extensions/model-providers/deepseek/models/llm/deepseek-v4-flash.yaml`
- `runtime-extensions/model-providers/deepseek/models/llm/deepseek-v4-pro.yaml`
- `runtime-extensions/model-providers/deepseek/i18n/en_US.json`
- `runtime-extensions/model-providers/deepseek/i18n/zh_Hans.json`
- `runtime-extensions/model-providers/deepseek/_assets/icon.svg`
- `runtime-extensions/model-providers/deepseek/readme/README_en_US.md`
- `scripts/_tests/deepseek-provider-contract.test.mjs`

## Delivery Criteria

- Main provider contract serializes balance and input cache usage fields.
- Console API returns DeepSeek-compatible balance payloads without leaking provider secrets.
- DeepSeek provider lists `deepseek-v4-flash` and `deepseek-v4-pro`.
- DeepSeek provider calls `/chat/completions` with streaming and usage inclusion.
- DeepSeek provider maps thinking, reasoning effort, JSON output, tools, tool choice, logprobs, and user ID.
- DeepSeek usage maps cache hit/miss tokens into main standard fields.
- No current DeepSeek price snapshot is hard-coded in plugin metadata.
- Focused tests pass in both repositories.

## Stop Conditions

- Main provider contract cannot add balance without a broader persisted schema redesign.
- Runtime usage persistence cannot add input cache hit/miss fields cleanly.
- DeepSeek API docs change model IDs, balance response, or usage fields during implementation.
- Local environment cannot build provider crates or run targeted tests.
