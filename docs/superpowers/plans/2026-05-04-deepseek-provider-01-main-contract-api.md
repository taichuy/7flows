# DeepSeek Provider 01 - Main Contract And API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the main 1flowbase provider contract with input cache usage fields and a first-class provider balance route.

**Architecture:** `plugin-framework` defines the stable provider DTOs and stdio method. `plugin-runner` executes the new method against provider binaries. `control-plane` loads the model provider instance and decrypted config, then calls the runtime port. `api-server` exposes the route. Runtime observability persists the new input cache usage fields.

**Tech Stack:** Rust 2021, serde, Axum, sqlx/PostgreSQL, plugin-runner stdio JSON.

---

## Task 1: Extend `ProviderUsage`

**Files:**
- Modify: `api/crates/plugin-framework/src/provider_contract.rs`
- Modify: `api/crates/plugin-framework/src/_tests/provider_contract_tests.rs`
- Modify: `api/crates/orchestration-runtime/src/execution_engine.rs`
- Modify: `api/crates/control-plane/src/ports/runtime.rs`
- Modify: `api/crates/control-plane/src/orchestration_runtime/persistence.rs`
- Modify: `api/crates/control-plane/src/orchestration_runtime/live_debug_run.rs`
- Create: `api/crates/storage-durable/postgres/migrations/20260504213000_add_input_cache_usage_fields.sql`
- Modify: `api/crates/storage-durable/postgres/src/orchestration_runtime_repository.rs`
- Modify: `api/crates/storage-durable/postgres/src/mappers/orchestration_runtime_mapper.rs`
- Modify: `api/crates/storage-durable/postgres/src/_tests/orchestration_runtime_repository_tests.rs`

- [ ] **Step 1: Write the failing provider usage serialization test**

Add to `api/crates/plugin-framework/src/_tests/provider_contract_tests.rs`:

```rust
#[test]
fn provider_usage_serializes_input_cache_hit_and_miss_tokens() {
    let usage = ProviderUsage {
        input_tokens: Some(100),
        input_cache_hit_tokens: Some(40),
        input_cache_miss_tokens: Some(60),
        output_tokens: Some(12),
        total_tokens: Some(112),
        ..ProviderUsage::default()
    };

    let payload = serde_json::to_value(&usage).unwrap();

    assert_eq!(payload["input_tokens"], 100);
    assert_eq!(payload["input_cache_hit_tokens"], 40);
    assert_eq!(payload["input_cache_miss_tokens"], 60);
    assert_eq!(payload["output_tokens"], 12);
    assert_eq!(payload["total_tokens"], 112);
}
```

- [ ] **Step 2: Run the provider usage test to verify it fails**

Run:

```bash
cd /home/taichu/git/1flowbase/api
cargo test -p plugin-framework provider_usage_serializes_input_cache_hit_and_miss_tokens
```

Expected: compile failure mentioning missing `input_cache_hit_tokens` and `input_cache_miss_tokens`.

- [ ] **Step 3: Add the `ProviderUsage` fields**

Update `api/crates/plugin-framework/src/provider_contract.rs`:

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct ProviderUsage {
    pub input_tokens: Option<u64>,
    pub input_cache_hit_tokens: Option<u64>,
    pub input_cache_miss_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub reasoning_tokens: Option<u64>,
    pub cache_read_tokens: Option<u64>,
    pub cache_write_tokens: Option<u64>,
    pub total_tokens: Option<u64>,
}
```

Update `total_tokens()` so cache hit/miss fields are input breakdowns, not extra additive totals:

```rust
pub fn total_tokens(&self) -> Option<u64> {
    if let Some(value) = self.total_tokens {
        return Some(value);
    }

    let mut total = 0_u64;
    let mut has_value = false;
    for segment in [self.input_tokens, self.output_tokens, self.reasoning_tokens]
        .into_iter()
        .flatten()
    {
        has_value = true;
        total += segment;
    }

    has_value.then_some(total)
}
```

- [ ] **Step 4: Propagate usage aggregation**

Update `apply_usage_delta()` in `api/crates/orchestration-runtime/src/execution_engine.rs`:

```rust
add_usage_value(&mut target.input_cache_hit_tokens, delta.input_cache_hit_tokens);
add_usage_value(&mut target.input_cache_miss_tokens, delta.input_cache_miss_tokens);
```

Add an orchestration test that emits a `UsageSnapshot` with:

```rust
ProviderUsage {
    input_tokens: Some(100),
    input_cache_hit_tokens: Some(40),
    input_cache_miss_tokens: Some(60),
    output_tokens: Some(12),
    total_tokens: Some(112),
    ..ProviderUsage::default()
}
```

Assert:

```rust
assert_eq!(result.result.usage.input_cache_hit_tokens, Some(40));
assert_eq!(result.result.usage.input_cache_miss_tokens, Some(60));
```

- [ ] **Step 5: Add durable usage fields**

Create `api/crates/storage-durable/postgres/migrations/20260504213000_add_input_cache_usage_fields.sql`:

```sql
alter table runtime_usage_ledger
    add column input_cache_hit_tokens bigint,
    add column input_cache_miss_tokens bigint;
```

Add both fields to:

- `AppendUsageLedgerInput`
- storage row structs
- SQL insert column list
- SQL bind list
- SQL returning column list
- row mapper
- `persistence.rs`
- `live_debug_run.rs`

Use:

```rust
input_cache_hit_tokens: usage_i64(&raw_usage, "input_cache_hit_tokens"),
input_cache_miss_tokens: usage_i64(&raw_usage, "input_cache_miss_tokens"),
```

Keep `cached_input_tokens`, `cache_read_tokens`, and `cache_write_tokens` for compatibility.

- [ ] **Step 6: Add repository persistence coverage**

Extend `api/crates/storage-durable/postgres/src/_tests/orchestration_runtime_repository_tests.rs` so an appended ledger record includes:

```rust
input_cache_hit_tokens: Some(40),
input_cache_miss_tokens: Some(60),
```

Assert:

```rust
assert_eq!(record.input_cache_hit_tokens, Some(40));
assert_eq!(record.input_cache_miss_tokens, Some(60));
```

- [ ] **Step 7: Run focused usage tests**

Run:

```bash
cd /home/taichu/git/1flowbase/api
cargo test -p plugin-framework provider_usage
cargo test -p orchestration-runtime input_cache
cargo test -p storage-postgres input_cache
```

Expected: PASS.

- [ ] **Step 8: Commit usage contract changes**

Run:

```bash
cd /home/taichu/git/1flowbase
git add api/crates/plugin-framework api/crates/orchestration-runtime api/crates/control-plane api/crates/storage-durable
git commit -m "feat: add provider input cache usage fields"
git push origin main
```

---

## Task 2: Add Provider Balance Runtime Contract

**Files:**
- Modify: `api/crates/plugin-framework/src/provider_contract.rs`
- Modify: `api/crates/plugin-framework/src/_tests/provider_contract_tests.rs`
- Modify: `api/apps/plugin-runner/src/provider_host.rs`
- Modify: `api/apps/plugin-runner/src/lib.rs`
- Modify: `api/apps/plugin-runner/tests/provider_runtime_routes.rs`
- Modify: `api/apps/api-server/src/provider_runtime.rs`

- [ ] **Step 1: Write failing balance contract tests**

Add to `api/crates/plugin-framework/src/_tests/provider_contract_tests.rs`:

```rust
#[test]
fn provider_stdio_method_serializes_balance() {
    let request = ProviderStdioRequest {
        method: ProviderStdioMethod::Balance,
        input: serde_json::json!({ "api_key": "secret" }),
    };

    assert_eq!(
        serde_json::to_value(request).unwrap(),
        serde_json::json!({
            "method": "balance",
            "input": { "api_key": "secret" }
        })
    );
}

#[test]
fn provider_balance_result_serializes_deepseek_shape() {
    let result = ProviderBalanceResult {
        is_available: true,
        balance_infos: vec![ProviderBalanceInfo {
            currency: "CNY".to_string(),
            total_balance: "110.00".to_string(),
            granted_balance: Some("10.00".to_string()),
            topped_up_balance: Some("100.00".to_string()),
        }],
        provider_metadata: serde_json::json!({ "provider": "deepseek" }),
    };

    let payload = serde_json::to_value(result).unwrap();

    assert_eq!(payload["is_available"], true);
    assert_eq!(payload["balance_infos"][0]["currency"], "CNY");
    assert_eq!(payload["balance_infos"][0]["total_balance"], "110.00");
}
```

- [ ] **Step 2: Run the balance contract tests to verify failure**

Run:

```bash
cd /home/taichu/git/1flowbase/api
cargo test -p plugin-framework provider_balance
```

Expected: compile failure because balance types and method do not exist.

- [ ] **Step 3: Add balance DTOs and stdio method**

Update `api/crates/plugin-framework/src/provider_contract.rs`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderStdioMethod {
    Validate,
    ListModels,
    Invoke,
    Balance,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProviderBalanceInfo {
    pub currency: String,
    pub total_balance: String,
    #[serde(default)]
    pub granted_balance: Option<String>,
    #[serde(default)]
    pub topped_up_balance: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct ProviderBalanceResult {
    pub is_available: bool,
    #[serde(default)]
    pub balance_infos: Vec<ProviderBalanceInfo>,
    #[serde(default)]
    pub provider_metadata: Value,
}
```

- [ ] **Step 4: Add plugin-runner host balance method**

In `api/apps/plugin-runner/src/provider_host.rs`, add:

```rust
#[derive(Debug, Clone, Serialize)]
pub struct ProviderBalanceOutput {
    pub balance: ProviderBalanceResult,
}

pub async fn get_balance(
    &self,
    plugin_id: &str,
    provider_config: Value,
) -> FrameworkResult<ProviderBalanceOutput> {
    let loaded = self.loaded_package(plugin_id)?;
    let raw = self
        .call_runtime(loaded, ProviderStdioMethod::Balance, provider_config)
        .await?;
    let balance = serde_json::from_value(raw)
        .map_err(|error| PluginFrameworkError::invalid_provider_contract(error.to_string()))?;
    Ok(ProviderBalanceOutput { balance })
}
```

- [ ] **Step 5: Add plugin-runner HTTP route**

In `api/apps/plugin-runner/src/lib.rs`, add:

```rust
#[derive(Debug, Deserialize)]
struct BalanceProviderRequest {
    plugin_id: String,
    #[serde(default)]
    provider_config: Value,
}

async fn provider_balance(
    State(state): State<AppState>,
    Json(request): Json<BalanceProviderRequest>,
) -> Result<Json<ProviderBalanceOutput>, (StatusCode, Json<ErrorResponse>)> {
    let host = state.provider_host.read().await;
    host.get_balance(&request.plugin_id, request.provider_config)
        .await
        .map(Json)
        .map_err(map_framework_error)
}
```

Register:

```rust
.route("/providers/balance", post(provider_balance))
```

- [ ] **Step 6: Add plugin-runner route test**

Update `api/apps/plugin-runner/tests/provider_runtime_routes.rs` fixture runtime to handle:

```bash
*'"method":"balance"'*)
  printf '%s' '{"ok":true,"result":{"is_available":true,"balance_infos":[{"currency":"CNY","total_balance":"110.00","granted_balance":"10.00","topped_up_balance":"100.00"}],"provider_metadata":{"fixture":true}}}'
  ;;
```

Add test:

```rust
#[tokio::test]
async fn provider_runner_exposes_balance() {
    let package = make_fixture_package();
    let app = app();
    load_fixture_provider(&app, package.path()).await;

    let response = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/providers/balance")
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "plugin_id": "fixture_provider@0.1.0",
                    "provider_config": { "api_key": "secret" }
                }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let payload: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(payload["balance"]["is_available"], true);
    assert_eq!(payload["balance"]["balance_infos"][0]["currency"], "CNY");
}
```

- [ ] **Step 7: Add api-server runtime adapter**

In `api/apps/api-server/src/provider_runtime.rs`, add the `ProviderRuntimePort` method:

```rust
async fn get_balance(
    &self,
    installation: &domain::PluginInstallationRecord,
    provider_config: Value,
) -> anyhow::Result<ProviderBalanceResult> {
    self.ensure_provider_loaded(installation).await?;
    let host = self.services.provider_host.read().await;
    host.get_balance(&installation.plugin_id, provider_config)
        .await
        .map(|output| output.balance)
        .map_err(map_provider_framework_error)
}
```

- [ ] **Step 8: Run balance runtime tests**

Run:

```bash
cd /home/taichu/git/1flowbase/api
cargo test -p plugin-framework provider_balance
cargo test -p plugin-runner provider_runner_exposes_balance
```

Expected: PASS.

- [ ] **Step 9: Commit balance runtime changes**

Run:

```bash
cd /home/taichu/git/1flowbase
git add api/crates/plugin-framework api/apps/plugin-runner api/apps/api-server/src/provider_runtime.rs
git commit -m "feat: add provider balance runtime contract"
git push origin main
```

---

## Task 3: Add Console Balance Route

**Files:**
- Modify: `api/crates/control-plane/src/ports/runtime.rs`
- Modify: `api/crates/control-plane/src/ports/mod.rs`
- Modify: `api/crates/control-plane/src/model_provider.rs`
- Create: `api/crates/control-plane/src/model_provider/balance.rs`
- Modify: `api/apps/api-server/src/routes/plugins_and_models/model_providers.rs`
- Modify: `api/apps/api-server/src/openapi.rs`
- Modify: `api/apps/api-server/src/_tests/model_provider_routes.rs`

- [ ] **Step 1: Write failing api-server route test**

Add to `api/apps/api-server/src/_tests/model_provider_routes.rs` after existing validate coverage:

```rust
let balance = app
    .clone()
    .oneshot(
        Request::builder()
            .method("GET")
            .uri(format!("/api/console/model-providers/{instance_id}/balance"))
            .header("cookie", &cookie)
            .body(Body::empty())
            .unwrap(),
    )
    .await
    .unwrap();
assert_eq!(balance.status(), StatusCode::OK);
let balance_payload: Value =
    serde_json::from_slice(&to_bytes(balance.into_body(), usize::MAX).await.unwrap()).unwrap();
assert_eq!(balance_payload["data"]["is_available"].as_bool(), Some(true));
assert_eq!(
    balance_payload["data"]["balance_infos"][0]["currency"].as_str(),
    Some("CNY")
);
assert!(!balance_payload.to_string().contains("super-secret"));
```

- [ ] **Step 2: Run the route test to verify failure**

Run:

```bash
cd /home/taichu/git/1flowbase/api
cargo test -p api-server model_provider_routes_mask_secret_until_reveal_and_keep_ready_options
```

Expected: FAIL with 404 for `/balance`.

- [ ] **Step 3: Add control-plane service**

In `api/crates/control-plane/src/ports/runtime.rs`, add:

```rust
async fn get_balance(
    &self,
    installation: &domain::PluginInstallationRecord,
    provider_config: serde_json::Value,
) -> anyhow::Result<plugin_framework::provider_contract::ProviderBalanceResult>;
```

Create `api/crates/control-plane/src/model_provider/balance.rs`:

```rust
use anyhow::Result;
use uuid::Uuid;

use crate::{
    errors::ControlPlaneError,
    model_provider::ModelProviderBalanceResult,
    plugin_lifecycle::reconcile_installation_snapshot,
    ports::{AuthRepository, ModelProviderRepository, PluginRepository, ProviderRuntimePort},
};

use super::{
    instances::build_provider_runtime_config,
    shared::{ensure_state_model_permission, load_actor_context_for_user, load_provider_package},
};

pub(super) async fn get_balance<R, H>(
    repository: &R,
    runtime: &H,
    provider_secret_master_key: &str,
    actor_user_id: Uuid,
    instance_id: Uuid,
) -> Result<ModelProviderBalanceResult>
where
    R: AuthRepository + PluginRepository + ModelProviderRepository,
    H: ProviderRuntimePort,
{
    let actor = load_actor_context_for_user(repository, actor_user_id).await?;
    ensure_state_model_permission(&actor, "manage")?;
    let instance = repository
        .get_instance(actor.current_workspace_id, instance_id)
        .await?
        .ok_or(ControlPlaneError::NotFound("model_provider_instance"))?;
    let installation = reconcile_installation_snapshot(repository, instance.installation_id).await?;
    if installation.availability_status != domain::PluginAvailabilityStatus::Available {
        return Err(ControlPlaneError::Conflict("plugin_installation_unavailable").into());
    }
    let package = load_provider_package(&installation.installed_path)?;
    let provider_config =
        build_provider_runtime_config(repository, provider_secret_master_key, &package, &instance)
            .await?;

    runtime.get_balance(&installation, provider_config).await
}
```

In `api/crates/control-plane/src/model_provider.rs`, add `mod balance;`, `ModelProviderBalanceResult`, and `ModelProviderService::get_balance()`.

- [ ] **Step 4: Add route DTOs and handler**

In `api/apps/api-server/src/routes/plugins_and_models/model_providers.rs`, add:

```rust
#[derive(Debug, Serialize, ToSchema)]
pub struct ModelProviderBalanceInfoResponse {
    pub currency: String,
    pub total_balance: String,
    pub granted_balance: Option<String>,
    pub topped_up_balance: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ModelProviderBalanceResponse {
    pub is_available: bool,
    pub balance_infos: Vec<ModelProviderBalanceInfoResponse>,
    pub provider_metadata: serde_json::Value,
}
```

Add route:

```rust
.route("/model-providers/:id/balance", get(get_balance))
```

Add handler:

```rust
#[utoipa::path(
    get,
    path = "/api/console/model-providers/{id}/balance",
    operation_id = "model_provider_get_balance",
    responses((status = 200, body = ModelProviderBalanceResponse), (status = 403, body = crate::error_response::ErrorBody))
)]
pub async fn get_balance(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<ApiSuccess<ModelProviderBalanceResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let result = service(&state)
        .get_balance(context.user.id, parse_uuid(&id, "id")?)
        .await?;
    Ok(Json(ApiSuccess::new(to_balance_response(result))))
}
```

Register route and schemas in `api/apps/api-server/src/openapi.rs`.

- [ ] **Step 5: Run route and OpenAPI tests**

Run:

```bash
cd /home/taichu/git/1flowbase/api
cargo test -p api-server model_provider_routes_mask_secret_until_reveal_and_keep_ready_options
cargo test -p api-server operation_spec_builder_exposes_model_provider_catalog_route
```

Expected: PASS.

- [ ] **Step 6: Commit console route changes**

Run:

```bash
cd /home/taichu/git/1flowbase
git add api/crates/control-plane api/apps/api-server
git commit -m "feat: expose model provider balance route"
git push origin main
```

## Plan Completion

- [ ] All Task 1 checkboxes are complete.
- [ ] All Task 2 checkboxes are complete.
- [ ] All Task 3 checkboxes are complete.
- [ ] Update the index plan checkbox for `01 - Main Provider Contract And API`.
