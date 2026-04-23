# Data Source Example Template And Regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a concrete example data-source plugin template plus author guidance, then close the whole durable-storage and data-source-platform slice with focused regression and QA evidence.

**Architecture:** Land one working example package inside `api/plugins/templates` so future developers have something executable to copy, not just prose. Pair that template with a short author guide that explains boundaries, responsibilities, and forbidden behaviors. Finish by running targeted tests across every touched layer and capture a QA report under `tmp/test-governance/`.

**Tech Stack:** Plugin package fixtures, Markdown docs, targeted `cargo test`, `cargo check`, `qa-evaluation`.

**Source Discussion:** This is the final handoff layer of the approved external data-source platform design.

---

## File Structure

**Create**
- `api/plugins/templates/data_source_http_fixture/manifest.yaml`
- `api/plugins/templates/data_source_http_fixture/datasource/data_source_http_fixture.yaml`
- `api/plugins/templates/data_source_http_fixture/bin/data_source_http_fixture`
- `api/plugins/templates/data_source_http_fixture/i18n/en_US.json`
- `api/plugins/templates/data_source_http_fixture/README.md`
- `api/plugins/README.md`
- `tmp/test-governance/storage-durable-and-data-source-platform-qa.md`

**Modify**
- `api/README.md`
- `api/AGENTS.md`
- `api/apps/plugin-runner/tests/data_source_runtime_routes.rs`

**Notes**
- The example plugin should be realistic enough to load through the actual package loader and host tests.
- The author guide must state explicitly that plugin writers do not own migrations, OAuth callback endpoints, or direct platform writes.

### Task 1: Add A Concrete Example Data-Source Plugin Template

**Files:**
- Create: `api/plugins/templates/data_source_http_fixture/manifest.yaml`
- Create: `api/plugins/templates/data_source_http_fixture/datasource/data_source_http_fixture.yaml`
- Create: `api/plugins/templates/data_source_http_fixture/bin/data_source_http_fixture`
- Create: `api/plugins/templates/data_source_http_fixture/i18n/en_US.json`
- Create: `api/plugins/templates/data_source_http_fixture/README.md`
- Modify: `api/apps/plugin-runner/tests/data_source_runtime_routes.rs`

- [x] **Step 1: Add a failing integration test that loads the checked-in template**

Extend `api/apps/plugin-runner/tests/data_source_runtime_routes.rs` with a test like:

```rust
#[tokio::test]
async fn loads_checked_in_data_source_template_package() {
    let package_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../plugins/templates/data_source_http_fixture");

    let app = plugin_runner::app();
    let response = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/data-sources/load")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({ "package_root": package_root }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}
```

- [x] **Step 2: Run the focused test to verify failure**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p plugin-runner loads_checked_in_data_source_template_package -- --nocapture
```

Expected:

- FAIL because the checked-in template package does not exist yet.

- [x] **Step 3: Create the checked-in template package**

Create `api/plugins/templates/data_source_http_fixture/manifest.yaml`:

```yaml
manifest_version: 1
plugin_id: data_source_http_fixture@0.1.0
version: 0.1.0
vendor: flowbase
display_name: Data Source HTTP Fixture
description: Example data source runtime extension package
source_kind: filesystem_dropin
trust_level: unverified
consumption_kind: runtime_extension
execution_mode: process_per_call
slot_codes:
  - data_source
binding_targets:
  - workspace
selection_mode: assignment_then_select
minimum_host_version: 0.1.0
contract_version: 1flowbase.data_source/v1
schema_version: 1flowbase.plugin.manifest/v1
permissions:
  network: outbound_only
  secrets: provider_instance_only
  storage: none
  mcp: none
  subprocess: deny
runtime:
  protocol: stdio_json
  entry: bin/data_source_http_fixture
node_contributions: []
```

Create `api/plugins/templates/data_source_http_fixture/datasource/data_source_http_fixture.yaml`:

```yaml
source_code: data_source_http_fixture
display_name: Data Source HTTP Fixture
auth_modes:
  - api_key
capabilities:
  - validate_config
  - test_connection
  - discover_catalog
  - describe_resource
  - preview_read
  - import_snapshot
supports_sync: true
supports_webhook: false
resource_kinds:
  - endpoint
config_schema:
  - key: base_url
    label: Base URL
    type: string
    required: true
  - key: api_key
    label: API Key
    type: string
    required: true
```

Create `bin/data_source_http_fixture` as a tiny executable fixture:

```bash
#!/usr/bin/env bash
set -euo pipefail

payload="$(cat)"
case "${payload}" in
  *'"method":"validate_config"'*)
    printf '%s' '{"ok":true,"result":{"ok":true}}'
    ;;
  *'"method":"test_connection"'*)
    printf '%s' '{"ok":true,"result":{"status":"ok"}}'
    ;;
  *'"method":"discover_catalog"'*)
    printf '%s' '{"ok":true,"result":[{"resource_key":"contacts","display_name":"Contacts","resource_kind":"endpoint","metadata":{}}]}'
    ;;
  *'"method":"describe_resource"'*)
    printf '%s' '{"ok":true,"result":{"resource_key":"contacts","primary_key":"id","fields":[],"supports_preview_read":true,"supports_import_snapshot":true,"metadata":{}}}'
    ;;
  *'"method":"preview_read"'*)
    printf '%s' '{"ok":true,"result":{"rows":[{"id":"1","email":"person@example.com"}],"next_cursor":null}}'
    ;;
  *'"method":"import_snapshot"'*)
    printf '%s' '{"ok":true,"result":{"rows":[{"id":"1","email":"person@example.com"}],"schema_version":"v1","metadata":{}}}'
    ;;
  *)
    printf '%s' '{"ok":false,"error":{"kind":"provider_invalid_response","message":"unknown method","provider_summary":null}}'
    exit 1
    ;;
esac
```

- [x] **Step 4: Re-run the checked-in template integration test**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p plugin-runner loads_checked_in_data_source_template_package -- --nocapture
```

Expected:

- PASS with the checked-in example package loadable through the real host path.

- [x] **Step 5: Commit the example template**

```bash
git add api/plugins/templates api/apps/plugin-runner/tests/data_source_runtime_routes.rs
git commit -m "feat: add example data source plugin template"
```

### Task 2: Publish A Short Plugin Author Guide

**Files:**
- Create: `api/plugins/README.md`
- Modify: `api/README.md`
- Modify: `api/AGENTS.md`
- Modify: `api/plugins/templates/data_source_http_fixture/README.md`

- [x] **Step 1: Draft the author-facing rules in the new plugins guide**

Create `api/plugins/README.md` with sections like:

```md
# API Plugin Packages

## Data Source Plugin Rules

1. Data-source plugins must declare `consumption_kind: runtime_extension`.
2. Data-source plugins must use `slot_codes: [data_source]`.
3. Plugins implement `validate_config`, `test_connection`, `discover_catalog`, `describe_resource`, `preview_read`, and `import_snapshot`.
4. Plugins must not run platform migrations or write the platform database directly.
5. OAuth callback endpoints belong to the host, not the plugin.
6. Preview access is temporary; only host-controlled import writes durable platform state.
```

- [x] **Step 2: Run a quick grep to confirm the new guide still needs to be wired into local docs**

Run:

```bash
rg -n "data-source plugin|storage-durable|storage-postgres" api/README.md api/AGENTS.md api/plugins/README.md
```

Expected:

- The new guide exists, but the local API docs and rules are still missing the new plugin path.

- [x] **Step 3: Update the local docs and template README**

Add to `api/README.md`:

```md
- `crates/storage-durable`: Main durable storage boundary
- `crates/storage-postgres`: PostgreSQL durable implementation and migrations
- `crates/plugin-framework`: Plugin contracts, including model-provider, capability, and data-source runtime packages
- `plugins/templates/data_source_http_fixture`: Example external data-source runtime-extension package
```

Add to `api/AGENTS.md`:

```md
- `crates/storage-durable` 是平台主存储边界；只暴露宿主消费的稳定入口。
- 外部数据库、SaaS、API 数据源统一走 `data-source` runtime extension，不塞进 `storage-durable`。
- data-source plugin 禁止注册 HTTP 接口，禁止直接写平台数据库，禁止自管 OAuth callback。
```

And add a usage walkthrough in `api/plugins/templates/data_source_http_fixture/README.md`:

```md
1. Copy this directory.
2. Rename `plugin_id`, `source_code`, and runtime executable.
3. Replace the shell fixture with your real runtime.
4. Keep the method names and output shapes identical to the contract.
```

- [x] **Step 4: Re-run the doc grep**

Run:

```bash
rg -n "data-source plugin|storage-durable|storage-postgres" api/README.md api/AGENTS.md api/plugins/README.md
```

Expected:

- PASS with the local docs and rules aligned to the new architecture.

- [x] **Step 5: Commit the author guide**

```bash
git add api/README.md api/AGENTS.md api/plugins
git commit -m "docs: add data source plugin author guide"
```

### Task 3: Run Focused Regression And Capture QA Evidence

**Files:**
- Create: `tmp/test-governance/storage-durable-and-data-source-platform-qa.md`

- [x] **Step 1: Run the targeted regression suite**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-durable -- --nocapture
cargo test --manifest-path api/Cargo.toml -p storage-postgres data_source_repository_tests -- --nocapture
cargo test --manifest-path api/Cargo.toml -p plugin-framework data_source_package -- --nocapture
cargo test --manifest-path api/Cargo.toml -p plugin-runner --test data_source_runtime_routes -- --nocapture
cargo test --manifest-path api/Cargo.toml -p control-plane data_source_service_tests -- --nocapture
cargo test --manifest-path api/Cargo.toml -p api-server data_sources_routes -- --nocapture
cargo check --manifest-path api/Cargo.toml -p api-server
```

Expected:

- PASS with durable-boundary, plugin-contract, platform service, and API route slices all green.

- [x] **Step 2: Run `qa-evaluation` and write the QA closeout**

Capture the QA summary in:

```text
tmp/test-governance/storage-durable-and-data-source-platform-qa.md
```

The report must include:

1. Scope covered
2. Commands run
3. PASS / FAIL outcomes
4. Residual risks
5. Explicit statement that main repo officially supports PostgreSQL only

- [x] **Step 3: Verify the QA artifact exists**

Run:

```bash
test -f tmp/test-governance/storage-durable-and-data-source-platform-qa.md
```

Expected:

- Exit code `0`.

- [x] **Step 4: Re-run one final old-name grep across active code**

Run:

```bash
rg -n "storage-pg|storage_pg" api -g '!target'
```

Expected:

- No hits in active code or docs.

- [x] **Step 5: Commit the QA closeout**

```bash
git add tmp/test-governance/storage-durable-and-data-source-platform-qa.md
git commit -m "test: close durable storage and data source platform regression"
```
