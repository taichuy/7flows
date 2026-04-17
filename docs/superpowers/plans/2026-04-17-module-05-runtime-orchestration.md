# Module 05 Runtime Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不混入现有 `runtime-core` CRUD 引擎的前提下，为 `agentFlow` 建立 `draft -> compiled plan -> single-node debug preview -> application logs / node last run` 的最小运行闭环。

**Architecture:** 这次实现明确新增独立的 `orchestration-runtime` crate，负责 `Compiled Plan` 与只读调试执行骨架；`domain / control-plane / storage-pg / api-server` 负责运行对象、状态流转、持久化与查询协议。首批入口固定选择 `单节点 debug preview`，因为它能直接接上当前已存在的 `NodeRunButton`、`NodeLastRunTab` 和应用级 logs 壳层，同时把真正的运行对象与查询链路先落稳。

**Tech Stack:** Rust workspace (`domain`, `control-plane`, `storage-pg`, new `orchestration-runtime`, `axum`, `sqlx`, `serde_json`, `tracing`), PostgreSQL, React 19, TypeScript, TanStack Query, Ant Design 5, Vitest, existing `@1flowse/api-client`

**Source Spec:** `docs/superpowers/specs/1flowse/modules/05-runtime-orchestration/README.md`, `docs/superpowers/specs/1flowse/2026-04-10-orchestration-design-draft.md`

**Execution Note:** 本仓库执行实现计划时不使用 `git worktree`；直接在当前工作区按任务提交推进。后端统一验证时先串行拿定向 `cargo test` 行为证据，再执行 `cd api && cargo fmt --all` 与 `node scripts/node/verify-backend.js`，避免被 `rustfmt --check` 提前拦截后误判成运行时逻辑失败。

**Out Of Scope:** 本计划第一批不做 `callback task` 执行语义、`waiting_human / resume`、整流 debug run、监控指标聚合页、tracing 配置、真实 LLM / Tool / HTTP 外部副作用执行；这些内容只保留数据模型扩展位，不在本轮最小闭环中落地。

---

## File Structure

### Runtime boundary and compiler

- Create: `api/crates/orchestration-runtime/Cargo.toml`
  - 新的编排运行时 crate，隔离 `05` 与当前 `runtime-core`。
- Create: `api/crates/orchestration-runtime/src/lib.rs`
  - 导出 `CompiledPlan`、编译器和 preview executor。
- Create: `api/crates/orchestration-runtime/src/compiled_plan.rs`
  - 定义运行时消费的 `CompiledPlan`、`CompiledNode`、依赖与输出契约。
- Create: `api/crates/orchestration-runtime/src/compiler.rs`
  - 把 `Flow Draft document` 编译成 `CompiledPlan`。
- Create: `api/crates/orchestration-runtime/src/preview_executor.rs`
  - 只读单节点 debug preview，负责输入解析、模板渲染和 preview 事件。
- Create: `api/crates/orchestration-runtime/src/_tests/mod.rs`
- Create: `api/crates/orchestration-runtime/src/_tests/compiler_tests.rs`
- Create: `api/crates/orchestration-runtime/src/_tests/preview_executor_tests.rs`
- Modify: `api/Cargo.toml`
  - 把 `crates/orchestration-runtime` 加入 workspace。

### Domain, service and persistence

- Create: `api/crates/domain/src/orchestration.rs`
  - 定义 `CompiledPlanRecord`、`FlowRunRecord`、`NodeRunRecord`、`CheckpointRecord`、`RunEventRecord` 与查询 DTO。
- Modify: `api/crates/domain/src/lib.rs`
  - 导出新的 orchestration domain 对象。
- Modify: `api/crates/control-plane/Cargo.toml`
  - 引入 `orchestration-runtime` 依赖。
- Create: `api/crates/control-plane/src/orchestration_runtime.rs`
  - `OrchestrationRuntimeService`，承接 compile、start debug preview、list runs、get run detail、get node last run。
- Modify: `api/crates/control-plane/src/lib.rs`
- Modify: `api/crates/control-plane/src/ports.rs`
  - 新增 `OrchestrationRuntimeRepository` 与相关输入 DTO。
- Create: `api/crates/control-plane/src/_tests/orchestration_runtime_service_tests.rs`
- Modify: `api/crates/control-plane/src/_tests/mod.rs`
- Create: `api/crates/storage-pg/migrations/20260417173000_create_orchestration_runtime_tables.sql`
  - 新建 `flow_compiled_plans / flow_runs / node_runs / flow_run_checkpoints / flow_run_events`。
- Create: `api/crates/storage-pg/src/orchestration_runtime_repository.rs`
  - PostgreSQL 仓储实现。
- Create: `api/crates/storage-pg/src/mappers/orchestration_runtime_mapper.rs`
  - 存储行到 domain record/query DTO 的转换。
- Modify: `api/crates/storage-pg/src/lib.rs`
- Modify: `api/crates/storage-pg/src/mappers/mod.rs`
- Create: `api/crates/storage-pg/src/_tests/orchestration_runtime_repository_tests.rs`
- Modify: `api/crates/storage-pg/src/_tests/mod.rs`
- Modify: `api/crates/storage-pg/src/mappers/flow_mapper.rs`
  - 让 `logs` 分区从纯 `planned` 进入可查询状态，`monitoring` 继续保持 planned。
- Modify: `api/crates/storage-pg/src/mappers/application_mapper.rs`
- Modify: `api/crates/storage-pg/src/_tests/flow_repository_tests.rs`
- Modify: `api/crates/storage-pg/src/_tests/application_repository_tests.rs`

### Console API and client contract

- Create: `api/apps/api-server/src/routes/application_runtime.rs`
  - 暴露 node debug preview、应用级 run list/detail、node last run。
- Modify: `api/apps/api-server/src/routes/mod.rs`
- Modify: `api/apps/api-server/src/lib.rs`
- Modify: `api/apps/api-server/src/openapi.rs`
- Create: `api/apps/api-server/src/_tests/application_runtime_routes.rs`
- Modify: `api/apps/api-server/src/_tests/mod.rs`
- Create: `web/packages/api-client/src/console-application-runtime.ts`
  - 新增 console runtime contract。
- Modify: `web/packages/api-client/src/index.ts`

### Frontend surfaces

- Create: `web/app/src/features/applications/api/runtime.ts`
  - 应用 logs 页查询层。
- Create: `web/app/src/features/applications/pages/ApplicationLogsPage.tsx`
  - 真实的应用日志页，替代当前 placeholder。
- Create: `web/app/src/features/applications/components/logs/ApplicationRunsTable.tsx`
  - 用 `Table` 呈现运行列表。
- Create: `web/app/src/features/applications/components/logs/ApplicationRunDetailDrawer.tsx`
  - 展示 run timeline、节点摘要和 checkpoint 列表。
- Create: `web/app/src/features/applications/_tests/application-logs-page.test.tsx`
- Create: `web/app/src/features/agent-flow/api/runtime.ts`
  - node debug preview mutation 与 node last run query。
- Modify: `web/app/src/features/applications/pages/ApplicationDetailPage.tsx`
  - `logs` 分区切到真实页面。
- Modify: `web/app/src/features/applications/components/ApplicationSectionState.tsx`
  - 只保留 `api / monitoring` 的 planned 说明，移除 `logs` placeholder。
- Modify: `web/app/src/features/agent-flow/components/detail/NodeRunButton.tsx`
  - 连接真正的 node debug preview mutation。
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx`
  - 向 detail panel 注入 `onRunNode`。
- Modify: `web/app/src/features/agent-flow/components/detail/tabs/NodeLastRunTab.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/last-run/NodeRunSummaryCard.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/last-run/NodeRunIOCard.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/last-run/NodeRunMetadataCard.tsx`
- Create: `web/app/src/features/agent-flow/_tests/node-last-run-runtime.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/node-last-run-tab.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`

## Task 1: Create The Orchestration Runtime Boundary And Compiler

**Files:**
- Create: `api/crates/orchestration-runtime/Cargo.toml`
- Create: `api/crates/orchestration-runtime/src/lib.rs`
- Create: `api/crates/orchestration-runtime/src/compiled_plan.rs`
- Create: `api/crates/orchestration-runtime/src/compiler.rs`
- Create: `api/crates/orchestration-runtime/src/_tests/mod.rs`
- Create: `api/crates/orchestration-runtime/src/_tests/compiler_tests.rs`
- Modify: `api/Cargo.toml`

- [x] **Step 1: Write the failing compiler tests**

```rust
// api/crates/orchestration-runtime/src/_tests/compiler_tests.rs
use orchestration_runtime::compiler::FlowCompiler;
use serde_json::json;
use uuid::Uuid;

fn sample_document(flow_id: Uuid) -> serde_json::Value {
    json!({
        "schemaVersion": "1flowse.flow/v1",
        "meta": { "flowId": flow_id.to_string(), "name": "Support Agent", "description": "", "tags": [] },
        "graph": {
            "nodes": [
                {
                    "id": "node-start",
                    "type": "start",
                    "alias": "Start",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 0, "y": 0 },
                    "configVersion": 1,
                    "config": {},
                    "bindings": {},
                    "outputs": [{ "key": "query", "title": "用户输入", "valueType": "string" }]
                },
                {
                    "id": "node-llm",
                    "type": "llm",
                    "alias": "LLM",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 240, "y": 0 },
                    "configVersion": 1,
                    "config": { "model": "gpt-5.4-mini", "temperature": 0.2 },
                    "bindings": {
                        "user_prompt": { "kind": "selector", "value": ["node-start", "query"] },
                        "system_prompt": { "kind": "templated_text", "value": "You are helpful." }
                    },
                    "outputs": [{ "key": "text", "title": "模型输出", "valueType": "string" }]
                }
            ],
            "edges": [
                {
                    "id": "edge-start-llm",
                    "source": "node-start",
                    "target": "node-llm",
                    "sourceHandle": null,
                    "targetHandle": null,
                    "containerId": null,
                    "points": []
                }
            ]
        },
        "editor": { "viewport": { "x": 0, "y": 0, "zoom": 1 }, "annotations": [], "activeContainerPath": [] }
    })
}

#[test]
fn compile_flow_document_emits_topology_and_selector_dependencies() {
    let flow_id = Uuid::now_v7();
    let plan = FlowCompiler::compile(flow_id, "draft-1", &sample_document(flow_id)).unwrap();

    assert_eq!(plan.flow_id, flow_id);
    assert_eq!(plan.topological_order, vec!["node-start", "node-llm"]);
    assert_eq!(plan.nodes["node-llm"].dependency_node_ids, vec!["node-start"]);
    assert_eq!(
        plan.nodes["node-llm"].bindings["user_prompt"].selector_paths,
        vec![vec!["node-start".to_string(), "query".to_string()]]
    );
}

#[test]
fn compile_rejects_edge_that_targets_unknown_node() {
    let flow_id = Uuid::now_v7();
    let mut document = sample_document(flow_id);
    document["graph"]["edges"][0]["target"] = json!("missing-node");

    let error = FlowCompiler::compile(flow_id, "draft-1", &document).unwrap_err();

    assert!(error.to_string().contains("missing-node"));
}
```

- [x] **Step 2: Run the targeted tests and confirm they fail**

Run:

```bash
cd api && cargo test -p orchestration-runtime compiler_tests
```

Expected: FAIL because `orchestration-runtime` package and compiler module do not exist yet.

- [x] **Step 3: Implement the new crate and compiler**

```rust
// api/crates/orchestration-runtime/src/compiled_plan.rs
use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompiledPlan {
    pub flow_id: Uuid,
    pub source_draft_id: String,
    pub schema_version: String,
    pub topological_order: Vec<String>,
    pub nodes: BTreeMap<String, CompiledNode>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompiledNode {
    pub node_id: String,
    pub node_type: String,
    pub alias: String,
    pub container_id: Option<String>,
    pub dependency_node_ids: Vec<String>,
    pub downstream_node_ids: Vec<String>,
    pub bindings: BTreeMap<String, CompiledBinding>,
    pub outputs: Vec<CompiledOutput>,
    pub config: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompiledBinding {
    pub kind: String,
    pub raw_value: serde_json::Value,
    pub selector_paths: Vec<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompiledOutput {
    pub key: String,
    pub title: String,
    pub value_type: String,
}
```

```rust
// api/crates/orchestration-runtime/src/compiler.rs
use anyhow::{anyhow, Result};

use crate::compiled_plan::{CompiledBinding, CompiledNode, CompiledPlan, CompiledOutput};

pub struct FlowCompiler;

impl FlowCompiler {
    pub fn compile(
        flow_id: uuid::Uuid,
        draft_id: &str,
        document: &serde_json::Value,
    ) -> Result<CompiledPlan> {
        let schema_version = document["schemaVersion"]
            .as_str()
            .ok_or_else(|| anyhow!("schemaVersion missing"))?
            .to_string();
        let (nodes, topological_order) = build_nodes_and_topology(document)?;

        Ok(CompiledPlan {
            flow_id,
            source_draft_id: draft_id.to_string(),
            schema_version,
            topological_order,
            nodes,
        })
    }
}
```

- [x] **Step 4: Run the compiler tests and ensure they pass**

Run:

```bash
cd api && cargo test -p orchestration-runtime compiler_tests
```

Expected: PASS with both compiler tests green.

- [x] **Step 5: Commit**

```bash
git add api/Cargo.toml \
  api/crates/orchestration-runtime
git commit -m "feat: add orchestration runtime compiler boundary"
```

## Task 2: Persist Runtime Objects And Read Models

**Files:**
- Create: `api/crates/domain/src/orchestration.rs`
- Modify: `api/crates/domain/src/lib.rs`
- Modify: `api/crates/control-plane/src/ports.rs`
- Create: `api/crates/storage-pg/migrations/20260417173000_create_orchestration_runtime_tables.sql`
- Create: `api/crates/storage-pg/src/orchestration_runtime_repository.rs`
- Create: `api/crates/storage-pg/src/mappers/orchestration_runtime_mapper.rs`
- Modify: `api/crates/storage-pg/src/lib.rs`
- Modify: `api/crates/storage-pg/src/mappers/mod.rs`
- Create: `api/crates/storage-pg/src/_tests/orchestration_runtime_repository_tests.rs`
- Modify: `api/crates/storage-pg/src/_tests/mod.rs`
- Modify: `api/crates/storage-pg/src/mappers/flow_mapper.rs`
- Modify: `api/crates/storage-pg/src/mappers/application_mapper.rs`
- Modify: `api/crates/storage-pg/src/_tests/flow_repository_tests.rs`
- Modify: `api/crates/storage-pg/src/_tests/application_repository_tests.rs`

- [x] **Step 1: Write the failing repository tests**

```rust
// api/crates/storage-pg/src/_tests/orchestration_runtime_repository_tests.rs
#[tokio::test]
async fn orchestration_runtime_repository_persists_compiled_plan_runs_and_events() {
    let pool = connect(&test_database_url()).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);

    let compiled = seed_compiled_plan(&store).await;
    let run = seed_flow_run(&store, &compiled).await;
    let node_run = seed_node_run(&store, &run).await;
    append_event(&store, &run, Some(&node_run), "node_run_completed").await;

    let detail = store
        .get_application_run_detail(run.application_id, run.id)
        .await
        .unwrap()
        .unwrap();

    assert_eq!(detail.flow_run.id, run.id);
    assert_eq!(detail.node_runs.len(), 1);
    assert_eq!(detail.events[0].event_type, "node_run_completed");
}

#[tokio::test]
async fn latest_node_run_returns_most_recent_run_for_node() {
    let pool = connect(&test_database_url()).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);

    let latest = seed_two_runs_for_same_node(&store).await;

    let node_last_run = store
        .get_latest_node_run(latest.application_id, "node-llm")
        .await
        .unwrap()
        .unwrap();

    assert_eq!(node_last_run.node_run.id, latest.node_run_id);
}
```

- [x] **Step 2: Run the targeted repository tests and confirm they fail**

Run:

```bash
cd api && cargo test -p storage-pg orchestration_runtime_repository_tests
```

Expected: FAIL with missing migration tables, missing domain structs and missing repository methods.

- [x] **Step 3: Add runtime domain records, repository trait and PostgreSQL schema**

```rust
// api/crates/domain/src/orchestration.rs
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FlowRunMode {
    DebugNodePreview,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FlowRunStatus {
    Queued,
    Running,
    WaitingCallback,
    WaitingHuman,
    Paused,
    Succeeded,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FlowRunRecord {
    pub id: Uuid,
    pub application_id: Uuid,
    pub flow_id: Uuid,
    pub draft_id: Uuid,
    pub compiled_plan_id: Uuid,
    pub run_mode: FlowRunMode,
    pub target_node_id: Option<String>,
    pub status: FlowRunStatus,
    pub input_payload: serde_json::Value,
    pub output_payload: serde_json::Value,
    pub error_payload: Option<serde_json::Value>,
    pub started_at: OffsetDateTime,
    pub finished_at: Option<OffsetDateTime>,
}
```

```rust
// api/crates/control-plane/src/ports.rs
#[async_trait]
pub trait OrchestrationRuntimeRepository: Send + Sync {
    async fn upsert_compiled_plan(
        &self,
        input: &UpsertCompiledPlanInput,
    ) -> anyhow::Result<domain::CompiledPlanRecord>;
    async fn create_flow_run(
        &self,
        input: &CreateFlowRunInput,
    ) -> anyhow::Result<domain::FlowRunRecord>;
    async fn create_node_run(
        &self,
        input: &CreateNodeRunInput,
    ) -> anyhow::Result<domain::NodeRunRecord>;
    async fn complete_node_run(
        &self,
        input: &CompleteNodeRunInput,
    ) -> anyhow::Result<domain::NodeRunRecord>;
    async fn complete_flow_run(
        &self,
        input: &CompleteFlowRunInput,
    ) -> anyhow::Result<domain::FlowRunRecord>;
    async fn append_run_event(
        &self,
        input: &AppendRunEventInput,
    ) -> anyhow::Result<domain::RunEventRecord>;
    async fn list_application_runs(
        &self,
        application_id: Uuid,
    ) -> anyhow::Result<Vec<domain::ApplicationRunSummary>>;
    async fn get_application_run_detail(
        &self,
        application_id: Uuid,
        flow_run_id: Uuid,
    ) -> anyhow::Result<Option<domain::ApplicationRunDetail>>;
    async fn get_latest_node_run(
        &self,
        application_id: Uuid,
        node_id: &str,
    ) -> anyhow::Result<Option<domain::NodeLastRun>>;
}
```

```sql
-- api/crates/storage-pg/migrations/20260417173000_create_orchestration_runtime_tables.sql
create table flow_compiled_plans (
    id uuid primary key,
    flow_id uuid not null references flows(id) on delete cascade,
    flow_draft_id uuid not null unique references flow_drafts(id) on delete cascade,
    schema_version text not null,
    document_updated_at timestamptz not null,
    plan jsonb not null,
    created_by uuid not null references users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table flow_runs (
    id uuid primary key,
    application_id uuid not null references applications(id) on delete cascade,
    flow_id uuid not null references flows(id) on delete cascade,
    flow_draft_id uuid not null references flow_drafts(id) on delete cascade,
    compiled_plan_id uuid not null references flow_compiled_plans(id) on delete restrict,
    run_mode text not null check (run_mode in ('debug_node_preview')),
    target_node_id text,
    status text not null check (status in ('queued','running','waiting_callback','waiting_human','paused','succeeded','failed','cancelled')),
    input_payload jsonb not null default '{}'::jsonb,
    output_payload jsonb not null default '{}'::jsonb,
    error_payload jsonb,
    created_by uuid not null references users(id),
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    created_at timestamptz not null default now()
);

create table node_runs (
    id uuid primary key,
    flow_run_id uuid not null references flow_runs(id) on delete cascade,
    node_id text not null,
    node_type text not null,
    node_alias text not null,
    status text not null check (status in ('pending','ready','running','streaming','waiting_tool','waiting_callback','waiting_human','retrying','succeeded','failed','skipped')),
    input_payload jsonb not null default '{}'::jsonb,
    output_payload jsonb not null default '{}'::jsonb,
    error_payload jsonb,
    metrics_payload jsonb not null default '{}'::jsonb,
    started_at timestamptz not null default now(),
    finished_at timestamptz
);

create table flow_run_checkpoints (
    id uuid primary key,
    flow_run_id uuid not null references flow_runs(id) on delete cascade,
    node_run_id uuid references node_runs(id) on delete cascade,
    status text not null,
    reason text not null,
    locator_payload jsonb not null,
    variable_snapshot jsonb not null,
    external_ref_payload jsonb,
    created_at timestamptz not null default now()
);

create table flow_run_events (
    id uuid primary key,
    flow_run_id uuid not null references flow_runs(id) on delete cascade,
    node_run_id uuid references node_runs(id) on delete cascade,
    sequence bigint not null,
    event_type text not null,
    payload jsonb not null,
    created_at timestamptz not null default now(),
    unique(flow_run_id, sequence)
);
```

- [x] **Step 4: Run repository tests and mapper regression tests**

Run:

```bash
cd api && cargo test -p storage-pg orchestration_runtime_repository_tests
cd api && cargo test -p storage-pg flow_repository_tests
cd api && cargo test -p storage-pg application_repository_tests
```

Expected: PASS with new runtime tables/query paths green and section status assertions updated.

- [x] **Step 5: Commit**

```bash
git add api/crates/domain/src/lib.rs \
  api/crates/domain/src/orchestration.rs \
  api/crates/control-plane/src/ports.rs \
  api/crates/storage-pg
git commit -m "feat: add orchestration runtime persistence model"
```

## Task 3: Add The Single-Node Debug Preview Service

**Files:**
- Create: `api/crates/orchestration-runtime/src/preview_executor.rs`
- Create: `api/crates/orchestration-runtime/src/_tests/preview_executor_tests.rs`
- Modify: `api/crates/orchestration-runtime/src/lib.rs`
- Modify: `api/crates/control-plane/Cargo.toml`
- Create: `api/crates/control-plane/src/orchestration_runtime.rs`
- Modify: `api/crates/control-plane/src/lib.rs`
- Create: `api/crates/control-plane/src/_tests/orchestration_runtime_service_tests.rs`
- Modify: `api/crates/control-plane/src/_tests/mod.rs`

- [x] **Step 1: Write the failing preview executor and service tests**

```rust
// api/crates/orchestration-runtime/src/_tests/preview_executor_tests.rs
#[test]
fn preview_executor_resolves_bindings_and_renders_prompt_for_target_node() {
    let plan = sample_compiled_plan();
    let outcome = preview_executor::run_node_preview(
        &plan,
        "node-llm",
        &serde_json::json!({ "node-start": { "query": "退款流程是什么？" } }),
    )
    .unwrap();

    assert_eq!(outcome.target_node_id, "node-llm");
    assert_eq!(outcome.resolved_inputs["user_prompt"], "退款流程是什么？");
    assert_eq!(outcome.rendered_templates["system_prompt"], "You are helpful.");
}
```

```rust
// api/crates/control-plane/src/_tests/orchestration_runtime_service_tests.rs
#[tokio::test]
async fn start_node_debug_preview_creates_run_node_run_and_events() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Support Agent").await;

    let outcome = service
        .start_node_debug_preview(StartNodeDebugPreviewCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            node_id: "node-llm".to_string(),
            input_payload: serde_json::json!({
                "node-start": { "query": "请总结退款政策" }
            }),
        })
        .await
        .unwrap();

    assert_eq!(outcome.flow_run.status, domain::FlowRunStatus::Succeeded);
    assert_eq!(outcome.node_run.status, domain::NodeRunStatus::Succeeded);
    assert!(outcome.events.iter().any(|event| event.event_type == "node_preview_completed"));
}
```

- [x] **Step 2: Run the targeted service tests and confirm they fail**

Run:

```bash
cd api && cargo test -p orchestration-runtime preview_executor_tests
cd api && cargo test -p control-plane orchestration_runtime_service_tests
```

Expected: FAIL with missing preview executor, missing service and missing repository integration.

- [x] **Step 3: Implement preview executor and control-plane orchestration service**

```rust
// api/crates/orchestration-runtime/src/preview_executor.rs
use anyhow::{anyhow, Result};
use serde_json::{json, Value};

use crate::compiled_plan::CompiledPlan;

pub struct NodePreviewOutcome {
    pub target_node_id: String,
    pub resolved_inputs: serde_json::Map<String, Value>,
    pub rendered_templates: serde_json::Map<String, Value>,
    pub output_contract: Vec<Value>,
}

pub fn run_node_preview(
    plan: &CompiledPlan,
    target_node_id: &str,
    input_payload: &Value,
) -> Result<NodePreviewOutcome> {
    let node = plan
        .nodes
        .get(target_node_id)
        .ok_or_else(|| anyhow!("target node not found: {target_node_id}"))?;
    let resolved_inputs = resolve_inputs(node, input_payload)?;
    let rendered_templates = render_templates(node, &resolved_inputs)?;
    let output_contract = node
        .outputs
        .iter()
        .map(|output| json!({
            "key": output.key,
            "title": output.title,
            "value_type": output.value_type,
        }))
        .collect();

    Ok(NodePreviewOutcome {
        target_node_id: node.node_id.clone(),
        resolved_inputs,
        rendered_templates,
        output_contract,
    })
}
```

```rust
// api/crates/control-plane/src/orchestration_runtime.rs
pub struct StartNodeDebugPreviewCommand {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub node_id: String,
    pub input_payload: serde_json::Value,
}

pub struct OrchestrationRuntimeService<R> {
    repository: R,
}

impl<R> OrchestrationRuntimeService<R>
where
    R: ApplicationRepository + FlowRepository + OrchestrationRuntimeRepository + Clone,
{
    pub async fn start_node_debug_preview(
        &self,
        command: StartNodeDebugPreviewCommand,
    ) -> Result<domain::NodeDebugPreviewResult> {
        let editor_state = FlowService::new(self.repository.clone())
            .get_or_create_editor_state(command.actor_user_id, command.application_id)
            .await?;

        let compiled_plan = orchestration_runtime::compiler::FlowCompiler::compile(
            editor_state.flow.id,
            &editor_state.draft.id.to_string(),
            &editor_state.draft.document,
        )?;

        let compiled_record = self
            .repository
            .upsert_compiled_plan(&build_compiled_plan_input(
                command.actor_user_id,
                &editor_state,
                &compiled_plan,
            ))
            .await?;
        let flow_run = self
            .repository
            .create_flow_run(&build_flow_run_input(
                command.actor_user_id,
                command.application_id,
                &editor_state,
                &compiled_record,
                &command,
            ))
            .await?;
        let node_run = self
            .repository
            .create_node_run(&build_node_run_input(flow_run.id, &compiled_plan, &command.node_id))
            .await?;

        let preview = orchestration_runtime::preview_executor::run_node_preview(
            &compiled_plan,
            &command.node_id,
            &command.input_payload,
        )?;
        let events = persist_preview_events(&self.repository, &flow_run, &node_run, &preview).await?;
        let node_run = self
            .repository
            .complete_node_run(&build_complete_node_run_input(&node_run, &preview))
            .await?;
        let flow_run = self
            .repository
            .complete_flow_run(&build_complete_flow_run_input(&flow_run, &preview))
            .await?;

        Ok(domain::NodeDebugPreviewResult {
            flow_run,
            node_run,
            events,
            preview_payload: preview.as_payload(),
        })
    }
}
```

- [x] **Step 4: Run runtime and control-plane tests**

Run:

```bash
cd api && cargo test -p orchestration-runtime
cd api && cargo test -p control-plane orchestration_runtime_service_tests
```

Expected: PASS with compiler + preview executor + service tests all green.

- [x] **Step 5: Commit**

```bash
git add api/crates/orchestration-runtime \
  api/crates/control-plane/Cargo.toml \
  api/crates/control-plane/src/lib.rs \
  api/crates/control-plane/src/orchestration_runtime.rs \
  api/crates/control-plane/src/_tests
git commit -m "feat: add node debug preview runtime service"
```

## Task 4: Expose Console Runtime APIs And Client Contracts

**Files:**
- Create: `api/apps/api-server/src/routes/application_runtime.rs`
- Modify: `api/apps/api-server/src/routes/mod.rs`
- Modify: `api/apps/api-server/src/lib.rs`
- Modify: `api/apps/api-server/src/openapi.rs`
- Create: `api/apps/api-server/src/_tests/application_runtime_routes.rs`
- Modify: `api/apps/api-server/src/_tests/mod.rs`
- Create: `web/packages/api-client/src/console-application-runtime.ts`
- Modify: `web/packages/api-client/src/index.ts`

- [x] **Step 1: Write the failing route tests**

```rust
// api/apps/api-server/src/_tests/application_runtime_routes.rs
#[tokio::test]
async fn application_runtime_routes_start_node_preview_and_query_logs() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let application_id = seed_agent_flow_application(&app, &cookie, &csrf).await;

    let preview = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/applications/{application_id}/orchestration/nodes/node-llm/debug-runs"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "input_payload": {
                            "node-start": { "query": "总结退款政策" }
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(preview.status(), StatusCode::CREATED);

    let list = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/console/applications/{application_id}/logs/runs"))
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(list.status(), StatusCode::OK);
}
```

- [x] **Step 2: Run the route tests and confirm they fail**

Run:

```bash
cd api && cargo test -p api-server application_runtime_routes
```

Expected: FAIL with missing routes, response DTOs and OpenAPI registration.

- [x] **Step 3: Implement runtime routes, response DTOs and api-client exports**

```rust
// api/apps/api-server/src/routes/application_runtime.rs
#[derive(Debug, Deserialize, ToSchema)]
pub struct StartNodeDebugPreviewBody {
    pub input_payload: serde_json::Value,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct FlowRunSummaryResponse {
    pub id: String,
    pub run_mode: String,
    pub status: String,
    pub target_node_id: Option<String>,
    pub started_at: String,
    pub finished_at: Option<String>,
}

pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route(
            "/applications/:id/orchestration/nodes/:node_id/debug-runs",
            post(start_node_debug_preview),
        )
        .route("/applications/:id/logs/runs", get(list_application_runs))
        .route("/applications/:id/logs/runs/:run_id", get(get_application_run_detail))
        .route(
            "/applications/:id/orchestration/nodes/:node_id/last-run",
            get(get_node_last_run),
        )
}
```

```ts
// web/packages/api-client/src/console-application-runtime.ts
import { apiFetch } from './transport';

export interface ConsoleApplicationRunSummary {
  id: string;
  run_mode: 'debug_node_preview';
  status: string;
  target_node_id: string | null;
  started_at: string;
  finished_at: string | null;
}

export function startConsoleNodeDebugPreview(
  applicationId: string,
  nodeId: string,
  input: { input_payload: Record<string, unknown> },
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch({
    path: `/api/console/applications/${applicationId}/orchestration/nodes/${nodeId}/debug-runs`,
    method: 'POST',
    body: input,
    csrfToken,
    baseUrl
  });
}
```

- [x] **Step 4: Run API and contract tests**

Run:

```bash
cd api && cargo test -p api-server application_runtime_routes
cd api && cargo test -p api-server application_routes
cd api && cargo test -p api-server application_orchestration_routes
```

Expected: PASS with runtime routes, existing application routes and orchestration routes all green.

- [x] **Step 5: Commit**

```bash
git add api/apps/api-server \
  web/packages/api-client/src/console-application-runtime.ts \
  web/packages/api-client/src/index.ts
git commit -m "feat: expose application runtime console APIs"
```

## Task 5: Connect Logs Page And Node Last Run To Real Data

**Files:**
- Create: `web/app/src/features/applications/api/runtime.ts`
- Create: `web/app/src/features/applications/pages/ApplicationLogsPage.tsx`
- Create: `web/app/src/features/applications/components/logs/ApplicationRunsTable.tsx`
- Create: `web/app/src/features/applications/components/logs/ApplicationRunDetailDrawer.tsx`
- Create: `web/app/src/features/applications/_tests/application-logs-page.test.tsx`
- Create: `web/app/src/features/agent-flow/api/runtime.ts`
- Modify: `web/app/src/features/applications/pages/ApplicationDetailPage.tsx`
- Modify: `web/app/src/features/applications/components/ApplicationSectionState.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/NodeRunButton.tsx`
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/tabs/NodeLastRunTab.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/last-run/NodeRunSummaryCard.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/last-run/NodeRunIOCard.tsx`
- Modify: `web/app/src/features/agent-flow/components/detail/last-run/NodeRunMetadataCard.tsx`
- Create: `web/app/src/features/agent-flow/_tests/node-last-run-runtime.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/node-last-run-tab.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`

- [ ] **Step 1: Write the failing frontend tests**

```tsx
// web/app/src/features/applications/_tests/application-logs-page.test.tsx
test('renders run table and opens detail drawer for selected run', async () => {
  vi.spyOn(runtimeApi, 'fetchApplicationRuns').mockResolvedValueOnce([
    {
      id: 'run-1',
      run_mode: 'debug_node_preview',
      status: 'succeeded',
      target_node_id: 'node-llm',
      started_at: '2026-04-17T09:00:00Z',
      finished_at: '2026-04-17T09:00:01Z'
    }
  ]);
  vi.spyOn(runtimeApi, 'fetchApplicationRunDetail').mockResolvedValueOnce(sampleRunDetail());

  render(<ApplicationLogsPage applicationId="app-1" />);

  expect(await screen.findByRole('table')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '查看运行详情' }));
  expect(await screen.findByText('node_preview_completed')).toBeInTheDocument();
});
```

```tsx
// web/app/src/features/agent-flow/_tests/node-last-run-runtime.test.tsx
test('runs node preview and refreshes last-run cards', async () => {
  vi.spyOn(runtimeApi, 'fetchNodeLastRun').mockResolvedValueOnce(null).mockResolvedValueOnce(sampleNodeLastRun());
  vi.spyOn(runtimeApi, 'startNodeDebugPreview').mockResolvedValueOnce(sampleNodeLastRun());

  render(<AgentFlowEditorPage applicationId="app-1" applicationName="Support Agent" />);

  await userEvent.click(await screen.findByRole('button', { name: '运行当前节点' }));

  expect(await screen.findByText('debug_node_preview')).toBeInTheDocument();
  expect(await screen.findByText('总结退款政策')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the targeted frontend tests and confirm they fail**

Run:

```bash
pnpm --dir web/app exec vitest run \
  src/features/applications/_tests/application-logs-page.test.tsx \
  src/features/agent-flow/_tests/node-last-run-runtime.test.tsx
```

Expected: FAIL with missing runtime API wrappers, missing logs page and placeholder last-run components.

- [ ] **Step 3: Implement the logs page, node preview mutation and last-run cards**

```tsx
// web/app/src/features/applications/pages/ApplicationDetailPage.tsx
const content =
  requestedSectionKey === 'orchestration' ? (
    <AgentFlowEditorPage applicationId={applicationId} applicationName={application.name} />
  ) : requestedSectionKey === 'logs' ? (
    <ApplicationLogsPage applicationId={applicationId} />
  ) : (
    <ApplicationSectionState application={application} sectionKey={requestedSectionKey} />
  );
```

```tsx
// web/app/src/features/applications/components/logs/ApplicationRunsTable.tsx
import { Button, Table, Tag } from 'antd';

export function ApplicationRunsTable({ runs, onSelectRun }: Props) {
  return (
    <Table
      rowKey="id"
      dataSource={runs}
      pagination={false}
      columns={[
        { title: '运行 ID', dataIndex: 'id' },
        { title: '模式', dataIndex: 'run_mode' },
        { title: '目标节点', dataIndex: 'target_node_id' },
        { title: '状态', render: (_, run) => <Tag>{run.status}</Tag> },
        {
          title: '操作',
          render: (_, run) => (
            <Button onClick={() => onSelectRun(run.id)}>查看运行详情</Button>
          )
        }
      ]}
    />
  );
}
```

```tsx
// web/app/src/features/agent-flow/components/detail/tabs/NodeLastRunTab.tsx
export function NodeLastRunTab({
  applicationId,
  nodeId
}: {
  applicationId: string;
  nodeId: string;
}) {
  const lastRunQuery = useNodeLastRun(applicationId, nodeId);

  if (lastRunQuery.isPending) {
    return <Result status="info" title="正在加载上次运行" />;
  }

  if (!lastRunQuery.data) {
    return <Empty description="当前节点还没有运行记录" />;
  }

  return (
    <div className="agent-flow-node-detail__last-run">
      <NodeRunSummaryCard lastRun={lastRunQuery.data} />
      <NodeRunIOCard lastRun={lastRunQuery.data} />
      <NodeRunMetadataCard lastRun={lastRunQuery.data} />
    </div>
  );
}
```

- [ ] **Step 4: Run feature tests and frontend gates**

Run:

```bash
pnpm --dir web/app exec vitest run \
  src/features/applications/_tests/application-logs-page.test.tsx \
  src/features/agent-flow/_tests/node-last-run-runtime.test.tsx \
  src/features/agent-flow/_tests/node-last-run-tab.test.tsx \
  src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx
pnpm --dir web lint
pnpm --dir web test
pnpm --dir web/app build
```

Expected: PASS; logs page shows real run data, node preview button invalidates last-run query, and full frontend gates stay green.

- [ ] **Step 5: Commit**

```bash
git add web/app/src/features/applications \
  web/app/src/features/agent-flow \
  web/packages/api-client/src/console-application-runtime.ts \
  web/packages/api-client/src/index.ts
git commit -m "feat: connect runtime logs and node last run UI"
```

## Task 6: Full Verification And Plan Backfill

**Files:**
- Modify: `docs/superpowers/plans/2026-04-17-module-05-runtime-orchestration.md`

- [ ] **Step 1: Run targeted backend behavior tests serially**

Run:

```bash
cd api && cargo test -p orchestration-runtime
cd api && cargo test -p control-plane orchestration_runtime_service_tests
cd api && cargo test -p storage-pg orchestration_runtime_repository_tests
cd api && cargo test -p storage-pg flow_repository_tests
cd api && cargo test -p storage-pg application_repository_tests
cd api && cargo test -p api-server application_runtime_routes
cd api && cargo test -p api-server application_orchestration_routes
cd api && cargo test -p api-server application_routes
```

Expected: PASS; these commands提供运行时行为证据，不受统一脚本前置格式门禁影响。

- [ ] **Step 2: Format Rust code and run the unified backend gate**

Run:

```bash
cd api && cargo fmt --all
node scripts/node/verify-backend.js
```

Expected: PASS. If `verify-backend.js` 先输出 `Diff in ...`，先修完格式再重跑，不要把这类失败误判成逻辑回归。

- [ ] **Step 3: Re-run frontend gates and manual smoke**

Run:

```bash
pnpm --dir web lint
pnpm --dir web test
pnpm --dir web/app build
```

Manual smoke:

```text
1. 打开一个已有 flow 的 Application Detail -> Logs，确认运行列表可见。
2. 在 orchestration 分区选中 `LLM` 节点，点击“运行当前节点”。
3. 确认 Last Run tab 出现新的时间、状态、输入快照和 preview 模式。
4. 返回 Logs 页，确认最新 run 出现在列表顶部，详情 drawer 能看到 timeline 事件。
```

- [ ] **Step 4: Backfill this plan document during execution**

```md
- 把已完成步骤改成 `- [x]`
- 在对应任务下追加执行备注：
  - 完成时间
  - 实际运行命令
  - 若命令调整为更精确的模块路径，也写回这里
```

- [ ] **Step 5: Commit the verification and plan-status backfill**

```bash
git add docs/superpowers/plans/2026-04-17-module-05-runtime-orchestration.md
git commit -m "docs: backfill module 05 runtime orchestration execution status"
```
