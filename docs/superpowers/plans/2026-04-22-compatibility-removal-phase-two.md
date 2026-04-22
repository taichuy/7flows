# Compatibility Removal Phase Two Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the remaining provider compatibility shims that keep outdated runtime contracts alive after Phase 1 restored the baseline test gates.

**Architecture:** Keep Phase 2 narrow and explicit. One change removes dead manifest-only types from `plugin-framework`; the other turns the plugin runner invoke path into a single-protocol consumer that accepts only the current `events + result` envelope. The proof point is not broad refactoring, but evidence that legacy payloads are now rejected and current route tests still pass.

**Tech Stack:** Rust, Axum integration tests, serde/serde_json, cargo test.

---

## File Structure

**Modify**
- `api/crates/plugin-framework/src/provider_package.rs`
- `api/apps/plugin-runner/src/provider_host.rs`
- `api/apps/plugin-runner/tests/provider_runtime_routes.rs`
- `docs/superpowers/plans/2026-04-22-compatibility-removal-phase-two.md`

**Run**
- `cargo test --manifest-path api/Cargo.toml -p plugin-runner provider_runtime_routes_rejects_legacy_invoke_payload -- --nocapture`
- `cargo test --manifest-path api/Cargo.toml -p plugin-runner provider_runtime_routes_cover_load_reload_validate_list_models_and_invoke_stream -- --nocapture`
- `cargo test --manifest-path api/Cargo.toml -p plugin-framework -- --nocapture`

## Task 1: Reject Legacy Provider Invoke Payloads

**Files:**
- Modify: `api/apps/plugin-runner/tests/provider_runtime_routes.rs`
- Modify: `api/apps/plugin-runner/src/provider_host.rs`

- [x] **Step 1: Write the failing route test for legacy invoke output**

Add a second fixture runtime writer that responds to `invoke` with the removed legacy payload:

```rust
let legacy_invoke_output = json!({
    "ok": true,
    "result": {
        "output_text": "legacy text"
    }
})
.to_string();
```

Then add a route test that loads the package, calls `/providers/invoke-stream`, and expects:

```rust
assert_eq!(status, StatusCode::BAD_REQUEST);
assert!(payload["message"]
    .as_str()
    .unwrap()
    .contains("missing field"));
```

- [x] **Step 2: Run the new test and confirm RED**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p plugin-runner provider_runtime_routes_rejects_legacy_invoke_payload -- --nocapture
```

Expected:

- Before the code change, FAIL because the host still converts `output_text` into synthetic stream events.

- [x] **Step 3: Remove the legacy invoke fallback from the host**

Delete `LegacyInvokeOutput` and make `normalize_invoke_output` accept only `RuntimeInvocationEnvelope`:

```rust
fn normalize_invoke_output(raw: Value) -> FrameworkResult<ProviderInvokeStreamOutput> {
    let envelope: RuntimeInvocationEnvelope = serde_json::from_value(raw)
        .map_err(|error| PluginFrameworkError::invalid_provider_contract(error.to_string()))?;
    Ok(ProviderInvokeStreamOutput {
        events: envelope.events,
        result: envelope.result,
    })
}
```

- [x] **Step 4: Re-run the new test and the existing happy-path route test**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p plugin-runner provider_runtime_routes_rejects_legacy_invoke_payload -- --nocapture
cargo test --manifest-path api/Cargo.toml -p plugin-runner provider_runtime_routes_cover_load_reload_validate_list_models_and_invoke_stream -- --nocapture
```

Expected:

- The new legacy-payload test passes with `BAD_REQUEST`.
- The existing load/reload/validate/list-models/invoke-stream route test still passes for the current envelope protocol.

## Task 2: Remove Dead Provider Manifest Compatibility Types

**Files:**
- Modify: `api/crates/plugin-framework/src/provider_package.rs`

- [x] **Step 1: Delete the unused legacy provider manifest structs**

Remove:

```rust
pub struct ProviderCompat { ... }
pub struct ProviderManifest { ... }
```

These types are no longer consumed by `ProviderPackage::load_from_dir`, which already parses `PluginManifestV1`.

- [x] **Step 2: Run plugin-framework tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p plugin-framework -- --nocapture
```

Expected:

- PASS, proving the removed types were dead compatibility residue rather than active contract.

## Task 3: Record Phase 2 Evidence

**Files:**
- Modify: `docs/superpowers/plans/2026-04-22-compatibility-removal-phase-two.md`

- [x] **Step 1: Append execution notes**

Add:

```md
## Execution Notes

- `2026-04-22`: legacy invoke payload route test ...
- `2026-04-22`: happy-path provider runtime route ...
- `2026-04-22`: plugin-framework test ...
```

- [ ] **Step 2: Commit the Phase 2 compatibility removal**

```bash
git add api/crates/plugin-framework/src/provider_package.rs api/apps/plugin-runner/src/provider_host.rs api/apps/plugin-runner/tests/provider_runtime_routes.rs docs/superpowers/plans/2026-04-22-compatibility-removal-phase-two.md
git commit -m "refactor: remove legacy provider compatibility shims"
```

## Execution Notes

- `2026-04-22`: 新增 `provider_runtime_routes_rejects_legacy_invoke_payload`，在旧实现上先拿到 RED，确认 legacy `output_text` payload 仍被 host 端转换成 `200 OK`。
- `2026-04-22`: `api/apps/plugin-runner/src/provider_host.rs` 删除 `LegacyInvokeOutput` fallback，并去掉 `RuntimeInvocationEnvelope` 上会吞掉旧协议的默认值，invoke 只接受当前 `events + result` 包结构。
- `2026-04-22`: `cargo test --manifest-path api/Cargo.toml -p plugin-runner provider_runtime_routes_rejects_legacy_invoke_payload -- --nocapture` 通过，legacy payload 现在被 route 以 `400 BAD_REQUEST` 拒绝。
- `2026-04-22`: `cargo test --manifest-path api/Cargo.toml -p plugin-runner provider_runtime_routes_cover_load_reload_validate_list_models_and_invoke_stream -- --nocapture` 通过，当前协议 happy path 不受影响。
- `2026-04-22`: `cargo test --manifest-path api/Cargo.toml -p plugin-runner -- --nocapture` 全量通过，`plugin-runner` 当前 crate 为 `8` 个测试全部通过。
- `2026-04-22`: `api/crates/plugin-framework/src/provider_package.rs` 已删除无外部消费的 `ProviderCompat` / `ProviderManifest` 旧类型；`cargo test --manifest-path api/Cargo.toml -p plugin-framework -- --nocapture` 通过，`plugin-framework` 当前 crate 为 `41` 个测试全部通过。
