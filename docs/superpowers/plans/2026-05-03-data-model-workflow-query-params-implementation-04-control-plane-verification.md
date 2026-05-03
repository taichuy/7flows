# Data Model Query Params 04 Control Plane And Verification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Update the index plan after each completed task.

**Goal:** Validate Data Model workflow list queries in control plane and collect delivery evidence.

**Architecture:** `WorkflowDataModelRuntime::list` keeps using the existing runtime engine. It clamps workflow pagination, validates declared fields and supported operators against runtime metadata, and preserves output shape.

**Tech Stack:** Rust 2021, `serde_json`, `anyhow`, Tokio tests, repository frontend test wrappers.

---

## Files

- Modify: `api/crates/control-plane/src/orchestration_runtime/data_model_runtime.rs`
- Create: `api/crates/control-plane/src/_tests/orchestration_runtime/data_model_query.rs`
- Modify: `api/crates/control-plane/src/_tests/orchestration_runtime/mod.rs`
- Reference existing coverage in: `api/crates/control-plane/src/_tests/orchestration_runtime/service.rs`
- Verification only: `tmp/test-governance/`

### Task 1: Add Data Model Runtime Tests

- [x] **Step 1: Add query execution tests**

Append near the existing Data Model orchestration tests in `api/crates/control-plane/src/_tests/orchestration_runtime/service.rs`:

```rust
#[tokio::test]
async fn orchestration_runtime_data_model_list_applies_query_binding() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Data Model Agent").await;

    let detail = run_data_model_flow(
        &service,
        seeded.actor_user_id,
        seeded.application_id,
        seeded.flow_id,
        vec![
            data_model_node(
                "node-create-a",
                "create",
                json!({ "payload": { "title": "Order A", "status": "draft" } }),
                json!({}),
            ),
            data_model_node(
                "node-create-b",
                "create",
                json!({ "payload": { "title": "Order B", "status": "paid" } }),
                json!({}),
            ),
            data_model_node(
                "node-list",
                "list",
                json!({}),
                json!({
                    "query": data_model_query_binding(json!({
                        "filters": [
                            {
                                "field_code": "status",
                                "operator": "eq",
                                "value": { "kind": "constant", "value": "paid" }
                            }
                        ],
                        "sorts": [{ "field_code": "title", "direction": "desc" }],
                        "expand_relations": [],
                        "page": { "kind": "constant", "value": 1 },
                        "page_size": { "kind": "constant", "value": 20 }
                    }))
                }),
            ),
        ],
        vec![("node-create-a", "node-create-b"), ("node-create-b", "node-list")],
    )
    .await;

    assert_eq!(detail.flow_run.status, domain::FlowRunStatus::Succeeded);
    let list_node = node_run(&detail, "node-list");
    assert_eq!(list_node.output_payload["total"], json!(1));
    assert_eq!(list_node.output_payload["records"][0]["title"], json!("Order B"));
}

#[tokio::test]
async fn orchestration_runtime_data_model_create_ignores_residual_query_binding() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Data Model Agent").await;

    let detail = run_data_model_flow(
        &service,
        seeded.actor_user_id,
        seeded.application_id,
        seeded.flow_id,
        vec![data_model_node(
            "node-create",
            "create",
            json!({ "payload": { "title": "Order A", "status": "draft" } }),
            json!({
                "query": data_model_query_binding(json!({
                    "filters": [
                        {
                            "field_code": "status",
                            "operator": "contains",
                            "value": { "kind": "constant", "value": "draft" }
                        }
                    ],
                    "sorts": [],
                    "expand_relations": [],
                    "page": { "kind": "constant", "value": 1 },
                    "page_size": { "kind": "constant", "value": 20 }
                }))
            }),
        )],
        vec![],
    )
    .await;

    assert_eq!(detail.flow_run.status, domain::FlowRunStatus::Succeeded);
    assert_eq!(
        node_run(&detail, "node-create").output_payload["record"]["title"],
        json!("Order A")
    );
}

#[tokio::test]
async fn orchestration_runtime_data_model_list_reports_invalid_query_operator() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Data Model Agent").await;

    let detail = run_data_model_flow(
        &service,
        seeded.actor_user_id,
        seeded.application_id,
        seeded.flow_id,
        vec![data_model_node(
            "node-list",
            "list",
            json!({}),
            json!({
                "query": data_model_query_binding(json!({
                    "filters": [
                        {
                            "field_code": "status",
                            "operator": "contains",
                            "value": { "kind": "constant", "value": "draft" }
                        }
                    ],
                    "sorts": [],
                    "expand_relations": [],
                    "page": { "kind": "constant", "value": 1 },
                    "page_size": { "kind": "constant", "value": 20 }
                }))
            }),
        )],
        vec![],
    )
    .await;

    assert_eq!(detail.flow_run.status, domain::FlowRunStatus::Failed);
    let list_node = node_run(&detail, "node-list");
    assert!(list_node
        .error_payload
        .as_ref()
        .and_then(|payload| payload["message"].as_str())
        .is_some_and(|message| message.contains("filter operator is unsupported")));
}
```

Add helper below `selector_binding`:

```rust
fn data_model_query_binding(value: Value) -> Value {
    json!({
        "kind": "data_model_query",
        "value": value
    })
}
```

- [x] **Step 2: Confirm failure**

Run:

```bash
cargo test -p control-plane orchestration_runtime_data_model -- --test-threads=1
```

Expected: FAIL before child plan 03 is complete; after child plan 03, failures should identify control-plane validation gaps only.

Implementation note: child plan 03 already rejects unsupported `data_model_query`
operators in binding resolution, before a Data Model node run exists. The workflow
binding test therefore asserts the flow-level error, and an additional config-query
operator test covers the control-plane `WorkflowDataModelRuntime::list` validation
path directly. Additional focused coverage for sort, pagination, page size clamp,
undeclared fields, sort validation, and relation expansion validation lives in
`api/crates/control-plane/src/_tests/orchestration_runtime/data_model_query.rs`
to keep `service.rs` under the project file-size budget. Pagination defaults are
only used when fields are missing; present non-integer `page` or `page_size`
values fail validation.

### Task 2: Clamp And Validate Workflow List Queries

- [x] **Step 1: Clamp pagination**

In `api/crates/control-plane/src/orchestration_runtime/data_model_runtime.rs`, add:

```rust
const WORKFLOW_LIST_PAGE_SIZE_MAX: i64 = 100;
```

Update `ListOptions::from_value`:

```rust
        let page = object.get("page").and_then(Value::as_i64).unwrap_or(1).max(1);
        let page_size = object
            .get("page_size")
            .and_then(Value::as_i64)
            .unwrap_or(20)
            .clamp(1, WORKFLOW_LIST_PAGE_SIZE_MAX);

        Ok(Self {
            filters: parse_filters(object.get("filters"))?,
            sorts: parse_sorts(object.get("sorts"))?,
            expand_relations: parse_string_list(object.get("expand_relations"))?,
            page,
            page_size,
        })
```

- [x] **Step 2: Validate fields, operators, sorts, and expand relations**

In `WorkflowDataModelRuntime::list`, after `let options = ListOptions::from_value(query)?;`, add:

```rust
        if let Some(metadata) = self.runtime_model_metadata(&actor, &model_code) {
            validate_list_options(&metadata, &options)?;
        }
```

Add this method inside `impl<R> WorkflowDataModelRuntime<R>`:

```rust
    fn runtime_model_metadata(
        &self,
        actor: &domain::ActorContext,
        model_code: &str,
    ) -> Option<runtime_core::model_metadata::ModelMetadata> {
        self.runtime_engine
            .registry()
            .get(domain::DataModelScopeKind::Workspace, actor.current_workspace_id, model_code)
            .or_else(|| {
                self.runtime_engine
                    .registry()
                    .get(domain::DataModelScopeKind::System, domain::SYSTEM_SCOPE_ID, model_code)
            })
    }
```

Add helpers near the parse helpers:

```rust
fn validate_list_options(
    metadata: &runtime_core::model_metadata::ModelMetadata,
    options: &ListOptions,
) -> Result<()> {
    for filter in &options.filters {
        if metadata.field_by_code(&filter.field_code).is_none() {
            return Err(anyhow!("undeclared field code: {}", filter.field_code));
        }
        ensure_supported_filter_operator(&filter.operator)?;
    }

    for sort in &options.sorts {
        if metadata.field_by_code(&sort.field_code).is_none() {
            return Err(anyhow!("undeclared sort field: {}", sort.field_code));
        }
        ensure_supported_sort_direction(&sort.direction)?;
    }

    for relation_code in &options.expand_relations {
        let field = metadata
            .field_by_code(relation_code)
            .ok_or_else(|| anyhow!("undeclared relation code: {relation_code}"))?;
        if !matches!(
            field.field_kind,
            domain::ModelFieldKind::ManyToOne | domain::ModelFieldKind::OneToMany
        ) {
            return Err(anyhow!("unsupported relation expansion"));
        }
    }

    Ok(())
}

fn ensure_supported_filter_operator(operator: &str) -> Result<()> {
    match operator {
        "eq" | "ne" | "gt" | "gte" | "lt" | "lte" => Ok(()),
        _ => Err(anyhow!("data_model list filter operator is unsupported")),
    }
}

fn ensure_supported_sort_direction(direction: &str) -> Result<()> {
    match direction.to_ascii_lowercase().as_str() {
        "asc" | "desc" => Ok(()),
        _ => Err(anyhow!("data_model list sort direction is unsupported")),
    }
}
```

In `parse_filters`, store `operator` in a local variable, call `ensure_supported_filter_operator(&operator)?`, and use that variable in `RuntimeFilterInput`.

In `parse_sorts`, normalize and validate direction:

```rust
            let direction = object
                .get("direction")
                .and_then(Value::as_str)
                .unwrap_or("asc")
                .to_ascii_lowercase();
            ensure_supported_sort_direction(&direction)?;
            Ok(runtime_core::runtime_engine::RuntimeSortInput {
                field_code: required_string(object, "field_code")?,
                direction,
            })
```

- [x] **Step 3: Verify control-plane tests**

Run:

```bash
cargo test -p control-plane orchestration_runtime_data_model -- --test-threads=1
```

Expected: PASS.

- [x] **Step 4: Commit**

Completed in the main session after spec and code-quality re-review.

Run:

```bash
git add api/crates/control-plane/src/orchestration_runtime/data_model_runtime.rs api/crates/control-plane/src/_tests/orchestration_runtime/service.rs
git commit -m "feat: validate data model workflow list queries"
```

### Task 3: Final Verification

- [ ] **Step 1: Run targeted frontend gate**

Run:

```bash
pnpm --dir web/app test -- node-schema-registry node-inspector node-debug-preview-input validate-document document-transforms
```

Expected: PASS.

- [ ] **Step 2: Run targeted backend gates**

Run:

```bash
cargo test -p orchestration-runtime compile_data_model -- --test-threads=1
cargo test -p orchestration-runtime data_model_query -- --test-threads=1
cargo test -p control-plane orchestration_runtime_data_model -- --test-threads=1
```

Expected: PASS.

- [ ] **Step 3: Run focused frontend workspace gate**

Run:

```bash
pnpm --dir web/app test -- agent-flow
```

Expected: PASS.

- [ ] **Step 4: Check artifacts and diff**

Run:

```bash
git status --short
git diff --stat
find tmp/test-governance -maxdepth 2 -type f 2>/dev/null | sort
```

Expected:
- Source edits are limited to files listed by the child plans plus their tests.
- Existing unrelated frontend edits remain present and unreverted.
- Warning and coverage artifacts, if produced, are under `tmp/test-governance/`.

- [ ] **Step 5: Final delivery message**

Use this verification block:

```text
Verification:
- pnpm --dir web/app test -- node-schema-registry node-inspector node-debug-preview-input validate-document document-transforms
- cargo test -p orchestration-runtime compile_data_model -- --test-threads=1
- cargo test -p orchestration-runtime data_model_query -- --test-threads=1
- cargo test -p control-plane orchestration_runtime_data_model -- --test-threads=1
- pnpm --dir web/app test -- agent-flow
```
