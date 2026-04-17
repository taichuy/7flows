# Module 05 Stateful Debug Run And Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 `single-node debug preview` 基线上，为 `agentFlow` 增加 `whole-flow debug run -> waiting_human / waiting_callback checkpoint -> resume` 的第二阶段运行闭环。

**Architecture:** 继续保持 `orchestration-runtime` 作为独立运行时 crate，不把 `05` 语义重新塞回 `runtime-core`。本轮新增 shared binding runtime 与 step-based debug executor，由它在 `Compiled Plan` 上顺序执行节点、在 `human_input / tool / http_request` 上产出等待态；`control-plane / storage-pg / api-server` 负责持久化 `checkpoint / callback task / run event`、暴露 resume 写接口；前端从 editor overlay 发起整流 debug run，在应用 logs detail 中提交人工输入或 callback 结果后继续执行。

**Tech Stack:** Rust workspace (`domain`, `control-plane`, `storage-pg`, `orchestration-runtime`, `axum`, `sqlx`, `serde_json`, `tracing`), PostgreSQL, React 19, TypeScript, TanStack Query, Ant Design 5, Vitest, existing `@1flowse/api-client`

**Source Spec:** `docs/superpowers/specs/1flowse/modules/05-runtime-orchestration/README.md`, `docs/superpowers/specs/1flowse/2026-04-10-orchestration-design-draft.md`, `docs/superpowers/plans/2026-04-17-module-05-runtime-orchestration.md`

**Execution Note:** 本仓库执行实现计划时不使用 `git worktree`；直接在当前工作区按任务提交推进。后端统一验证仍采用串行 `cargo test` 先拿行为证据，再执行 `cd api && cargo fmt --all` 与 `node scripts/node/verify-backend.js`，避免把格式检查误判成运行时回归。

**Out Of Scope:** 本计划不做真实 `LLM / Tool / HTTP` 外部副作用执行、不做监控聚合图表与 tracing 配置 UI、不做公开 callback webhook 交付协议、不做发布网关，也不做自动重试策略扩张；`tool / http_request` 仅以 `waiting_callback` 的模拟回填语义进入运行主链。

---

## File Structure

### Shared runtime execution boundary

- Create: `api/crates/orchestration-runtime/src/binding_runtime.rs`
  - 提取 selector 解析、模板渲染和输入补齐逻辑，供 preview executor 与 whole-flow executor 复用。
- Create: `api/crates/orchestration-runtime/src/execution_state.rs`
  - 定义 debug flow execution outcome、stop reason、pending human input、pending callback task、checkpoint snapshot。
- Create: `api/crates/orchestration-runtime/src/execution_engine.rs`
  - 顺序执行 `Compiled Plan`，产出完成态或等待态。
- Modify: `api/crates/orchestration-runtime/src/lib.rs`
  - 导出新的 execution modules。
- Modify: `api/crates/orchestration-runtime/src/preview_executor.rs`
  - 改为复用 `binding_runtime`，避免 resolver 双份实现漂移。
- Create: `api/crates/orchestration-runtime/src/_tests/execution_engine_tests.rs`
- Modify: `api/crates/orchestration-runtime/src/_tests/mod.rs`

### Domain, service and persistence

- Modify: `api/crates/domain/src/orchestration.rs`
  - 增加 `debug_flow_run`、`CallbackTaskRecord`、generic update DTO 所需领域对象。
- Modify: `api/crates/domain/src/lib.rs`
- Modify: `api/crates/control-plane/src/ports.rs`
  - 增加 checkpoint / callback task / generic flow run update / resume lookup 端口。
- Modify: `api/crates/control-plane/src/orchestration_runtime.rs`
  - 增加 `start_flow_debug_run`、`resume_flow_run`、`complete_callback_task`。
- Create: `api/crates/control-plane/src/_tests/orchestration_runtime_resume_tests.rs`
- Modify: `api/crates/control-plane/src/_tests/mod.rs`
- Create: `api/crates/storage-pg/migrations/20260417210000_add_flow_run_resume_and_callback_tasks.sql`
  - 扩展 `flow_runs.run_mode` 并新增 `flow_run_callback_tasks`。
- Modify: `api/crates/storage-pg/src/orchestration_runtime_repository.rs`
- Modify: `api/crates/storage-pg/src/mappers/orchestration_runtime_mapper.rs`
- Modify: `api/crates/storage-pg/src/_tests/orchestration_runtime_repository_tests.rs`

### Console API and client contract

- Modify: `api/apps/api-server/src/routes/application_runtime.rs`
  - 新增 whole-flow debug run、resume、callback complete 写接口，并把 `callback_tasks` 暴露到 run detail。
- Modify: `api/apps/api-server/src/openapi.rs`
- Modify: `api/apps/api-server/src/_tests/application_runtime_routes.rs`
- Modify: `web/packages/api-client/src/console-application-runtime.ts`
- Modify: `web/packages/api-client/src/index.ts`

### Frontend surfaces

- Modify: `web/app/src/features/agent-flow/api/runtime.ts`
  - 新增 whole-flow debug run builder 和 mutation helper。
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowOverlay.tsx`
  - 增加 “调试整流” 入口。
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx`
  - 接 whole-flow debug run mutation 与 logs invalidation。
- Modify: `web/app/src/features/applications/api/runtime.ts`
  - 新增 resume / callback complete mutation helper。
- Create: `web/app/src/features/applications/components/logs/ApplicationRunResumeCard.tsx`
  - 在 run detail 中处理 `waiting_human / waiting_callback` 的继续执行动作。
- Modify: `web/app/src/features/applications/components/logs/ApplicationRunDetailDrawer.tsx`
- Modify: `web/app/src/features/applications/components/logs/ApplicationRunsTable.tsx`
- Create: `web/app/src/features/applications/_tests/application-run-resume-card.test.tsx`
- Modify: `web/app/src/features/applications/_tests/application-logs-page.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`

## Task 1: Add Shared Binding Runtime And Step-Based Flow Debug Executor

**Files:**
- Create: `api/crates/orchestration-runtime/src/binding_runtime.rs`
- Create: `api/crates/orchestration-runtime/src/execution_state.rs`
- Create: `api/crates/orchestration-runtime/src/execution_engine.rs`
- Modify: `api/crates/orchestration-runtime/src/lib.rs`
- Modify: `api/crates/orchestration-runtime/src/preview_executor.rs`
- Create: `api/crates/orchestration-runtime/src/_tests/execution_engine_tests.rs`
- Modify: `api/crates/orchestration-runtime/src/_tests/mod.rs`

- [ ] **Step 1: Write the failing execution engine tests**

```rust
// api/crates/orchestration-runtime/src/_tests/execution_engine_tests.rs
use orchestration_runtime::{
    compiled_plan::{CompiledBinding, CompiledNode, CompiledNodeOutput, CompiledPlan},
    execution_engine::{resume_flow_debug_run, start_flow_debug_run},
    execution_state::ExecutionStopReason,
};
use serde_json::json;
use std::collections::BTreeMap;
use uuid::Uuid;

fn base_plan() -> CompiledPlan {
    let mut nodes = BTreeMap::new();
    nodes.insert(
        "node-start".to_string(),
        CompiledNode {
            node_id: "node-start".to_string(),
            node_type: "start".to_string(),
            alias: "Start".to_string(),
            dependency_node_ids: vec![],
            bindings: BTreeMap::new(),
            outputs: vec![CompiledNodeOutput {
                key: "query".to_string(),
                title: "用户输入".to_string(),
                value_type: "string".to_string(),
            }],
            raw_config: json!({}),
        },
    );
    nodes.insert(
        "node-llm".to_string(),
        CompiledNode {
            node_id: "node-llm".to_string(),
            node_type: "llm".to_string(),
            alias: "LLM".to_string(),
            dependency_node_ids: vec!["node-start".to_string()],
            bindings: BTreeMap::from([(
                "user_prompt".to_string(),
                CompiledBinding {
                    kind: "selector".to_string(),
                    selector_paths: vec![vec!["node-start".to_string(), "query".to_string()]],
                    raw_value: json!(["node-start", "query"]),
                },
            )]),
            outputs: vec![CompiledNodeOutput {
                key: "text".to_string(),
                title: "模型输出".to_string(),
                value_type: "string".to_string(),
            }],
            raw_config: json!({ "model": "gpt-5.4-mini" }),
        },
    );
    nodes.insert(
        "node-human".to_string(),
        CompiledNode {
            node_id: "node-human".to_string(),
            node_type: "human_input".to_string(),
            alias: "Human Input".to_string(),
            dependency_node_ids: vec!["node-llm".to_string()],
            bindings: BTreeMap::from([(
                "prompt".to_string(),
                CompiledBinding {
                    kind: "templated_text".to_string(),
                    selector_paths: vec![vec!["node-llm".to_string(), "text".to_string()]],
                    raw_value: json!("请审核：{{ node-llm.text }}"),
                },
            )]),
            outputs: vec![CompiledNodeOutput {
                key: "input".to_string(),
                title: "人工输入".to_string(),
                value_type: "string".to_string(),
            }],
            raw_config: json!({}),
        },
    );
    nodes.insert(
        "node-answer".to_string(),
        CompiledNode {
            node_id: "node-answer".to_string(),
            node_type: "answer".to_string(),
            alias: "Answer".to_string(),
            dependency_node_ids: vec!["node-human".to_string()],
            bindings: BTreeMap::from([(
                "answer_template".to_string(),
                CompiledBinding {
                    kind: "selector".to_string(),
                    selector_paths: vec![vec!["node-human".to_string(), "input".to_string()]],
                    raw_value: json!(["node-human", "input"]),
                },
            )]),
            outputs: vec![CompiledNodeOutput {
                key: "answer".to_string(),
                title: "对话输出".to_string(),
                value_type: "string".to_string(),
            }],
            raw_config: json!({}),
        },
    );

    CompiledPlan {
        flow_id: Uuid::nil(),
        draft_id: "draft-1".to_string(),
        schema_version: "1flowse.flow/v1".to_string(),
        topological_order: vec![
            "node-start".to_string(),
            "node-llm".to_string(),
            "node-human".to_string(),
            "node-answer".to_string(),
        ],
        nodes,
    }
}

#[test]
fn start_flow_debug_run_waits_for_human_input() {
    let outcome = start_flow_debug_run(
        &base_plan(),
        &json!({
            "node-start": { "query": "请总结退款政策" }
        }),
    )
    .unwrap();

    match outcome.stop_reason {
        ExecutionStopReason::WaitingHuman(ref wait) => {
            assert_eq!(wait.node_id, "node-human");
            assert!(wait.prompt.contains("请审核"));
        }
        other => panic!("expected waiting_human, got {other:?}"),
    }

    assert_eq!(outcome.node_traces.len(), 3);
    assert_eq!(outcome.node_traces[1].node_id, "node-llm");
}

#[test]
fn resume_flow_debug_run_completes_answer_after_human_input() {
    let waiting = start_flow_debug_run(
        &base_plan(),
        &json!({ "node-start": { "query": "退款政策" } }),
    )
    .unwrap();

    let checkpoint = waiting.checkpoint_snapshot.clone().unwrap();
    let resumed = resume_flow_debug_run(
        &base_plan(),
        &checkpoint,
        &json!({ "node-human": { "input": "已审核，可继续" } }),
    )
    .unwrap();

    assert!(matches!(resumed.stop_reason, ExecutionStopReason::Completed));
    assert_eq!(
        resumed.variable_pool["node-answer"]["answer"],
        json!("已审核，可继续")
    );
}

#[test]
fn tool_node_emits_waiting_callback_stop_reason() {
    let mut plan = base_plan();
    plan.topological_order = vec![
        "node-start".to_string(),
        "node-tool".to_string(),
    ];
    plan.nodes.remove("node-llm");
    plan.nodes.remove("node-human");
    plan.nodes.remove("node-answer");
    plan.nodes.insert(
        "node-tool".to_string(),
        CompiledNode {
            node_id: "node-tool".to_string(),
            node_type: "tool".to_string(),
            alias: "Tool".to_string(),
            dependency_node_ids: vec!["node-start".to_string()],
            bindings: BTreeMap::new(),
            outputs: vec![CompiledNodeOutput {
                key: "result".to_string(),
                title: "工具输出".to_string(),
                value_type: "json".to_string(),
            }],
            raw_config: json!({ "tool_name": "lookup_order" }),
        },
    );

    let outcome = start_flow_debug_run(
        &plan,
        &json!({ "node-start": { "query": "order_123" } }),
    )
    .unwrap();

    match outcome.stop_reason {
        ExecutionStopReason::WaitingCallback(ref pending) => {
            assert_eq!(pending.node_id, "node-tool");
            assert_eq!(pending.callback_kind, "tool");
        }
        other => panic!("expected waiting_callback, got {other:?}"),
    }
}
```

- [ ] **Step 2: Run the targeted runtime tests and confirm they fail**

Run:

```bash
cd api && cargo test -p orchestration-runtime execution_engine_tests
```

Expected: FAIL with missing `execution_engine` / `execution_state` modules and missing shared binding runtime helpers.

- [ ] **Step 3: Implement shared binding runtime and flow debug executor**

```rust
// api/crates/orchestration-runtime/src/execution_state.rs
use serde_json::{Map, Value};

#[derive(Debug, Clone, PartialEq)]
pub struct PendingHumanInput {
    pub node_id: String,
    pub node_alias: String,
    pub prompt: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PendingCallbackTask {
    pub node_id: String,
    pub node_alias: String,
    pub callback_kind: String,
    pub request_payload: Value,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ExecutionStopReason {
    Completed,
    WaitingHuman(PendingHumanInput),
    WaitingCallback(PendingCallbackTask),
}

#[derive(Debug, Clone, PartialEq)]
pub struct CheckpointSnapshot {
    pub next_node_index: usize,
    pub variable_pool: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct NodeExecutionTrace {
    pub node_id: String,
    pub node_type: String,
    pub node_alias: String,
    pub input_payload: Value,
    pub output_payload: Value,
    pub metrics_payload: Value,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FlowDebugExecutionOutcome {
    pub stop_reason: ExecutionStopReason,
    pub variable_pool: Map<String, Value>,
    pub checkpoint_snapshot: Option<CheckpointSnapshot>,
    pub node_traces: Vec<NodeExecutionTrace>,
}
```

```rust
// api/crates/orchestration-runtime/src/binding_runtime.rs
use anyhow::{anyhow, Result};
use serde_json::{json, Map, Value};

use crate::compiled_plan::{CompiledBinding, CompiledNode};

pub fn resolve_node_inputs(
    node: &CompiledNode,
    variable_pool: &Map<String, Value>,
) -> Result<Map<String, Value>> {
    let mut resolved = Map::new();

    for (binding_key, binding) in &node.bindings {
        resolved.insert(
            binding_key.clone(),
            resolve_binding(binding, variable_pool).map_err(|error| {
                anyhow!("failed to resolve binding {binding_key} for {}: {error}", node.node_id)
            })?,
        );
    }

    Ok(resolved)
}

pub fn render_templated_bindings(
    node: &CompiledNode,
    resolved_inputs: &Map<String, Value>,
) -> Map<String, Value> {
    node.bindings
        .iter()
        .filter(|(_, binding)| binding.kind == "templated_text")
        .map(|(key, _)| {
            (
                key.clone(),
                resolved_inputs.get(key).cloned().unwrap_or(Value::Null),
            )
        })
        .collect()
}

fn resolve_binding(binding: &CompiledBinding, variable_pool: &Map<String, Value>) -> Result<Value> {
    match binding.kind.as_str() {
        "selector" => lookup_selector_value(variable_pool, binding.selector_paths.first().unwrap()),
        "selector_list" => binding
            .selector_paths
            .iter()
            .map(|selector| lookup_selector_value(variable_pool, selector))
            .collect::<Result<Vec<_>>>()
            .map(Value::Array),
        "templated_text" => binding
            .raw_value
            .as_str()
            .map(|template| Value::String(render_template(template, variable_pool)))
            .ok_or_else(|| anyhow!("templated_text raw_value must be string")),
        "named_bindings" | "condition_group" | "state_write" => Ok(binding.raw_value.clone()),
        other => Err(anyhow!("unsupported binding kind: {other}")),
    }
}

pub fn lookup_selector_value(
    variable_pool: &Map<String, Value>,
    selector: &[String],
) -> Result<Value> {
    let mut cursor = variable_pool
        .get(selector.first().ok_or_else(|| anyhow!("empty selector"))?)
        .ok_or_else(|| anyhow!("selector source not found: {}", selector.join(".")))?;

    for segment in selector.iter().skip(1) {
        cursor = cursor
            .get(segment)
            .ok_or_else(|| anyhow!("selector path not found: {}", selector.join(".")))?;
    }

    Ok(cursor.clone())
}

fn render_template(template: &str, variable_pool: &Map<String, Value>) -> String {
    let mut rendered = String::new();
    let mut cursor = 0;

    while let Some(start_offset) = template[cursor..].find("{{") {
        let start = cursor + start_offset;
        rendered.push_str(&template[cursor..start]);
        let token_start = start + 2;
        let Some(end_offset) = template[token_start..].find("}}") else {
            rendered.push_str(&template[start..]);
            return rendered;
        };
        let token_end = token_start + end_offset;
        let selector = template[token_start..token_end]
            .trim()
            .split('.')
            .map(str::to_string)
            .collect::<Vec<_>>();

        let replacement = if selector.len() >= 2 {
            lookup_selector_value(variable_pool, &selector).unwrap_or_else(|_| {
                json!(template[start..token_end + 2].to_string())
            })
        } else {
            json!(template[start..token_end + 2].to_string())
        };

        let replacement_text = match replacement {
            Value::String(text) => text,
            value => value.to_string(),
        };
        rendered.push_str(&replacement_text);
        cursor = token_end + 2;
    }

    rendered.push_str(&template[cursor..]);
    rendered
}
```

```rust
// api/crates/orchestration-runtime/src/execution_engine.rs
use anyhow::{anyhow, Result};
use serde_json::{json, Map, Value};

use crate::{
    binding_runtime::{render_templated_bindings, resolve_node_inputs},
    compiled_plan::CompiledPlan,
    execution_state::{
        CheckpointSnapshot, ExecutionStopReason, FlowDebugExecutionOutcome, NodeExecutionTrace,
        PendingCallbackTask, PendingHumanInput,
    },
};

pub fn start_flow_debug_run(
    plan: &CompiledPlan,
    input_payload: &Value,
) -> Result<FlowDebugExecutionOutcome> {
    let variable_pool = input_payload
        .as_object()
        .cloned()
        .ok_or_else(|| anyhow!("input payload must be an object"))?;

    execute_from(plan, 0, variable_pool)
}

pub fn resume_flow_debug_run(
    plan: &CompiledPlan,
    checkpoint: &CheckpointSnapshot,
    resume_payload: &Value,
) -> Result<FlowDebugExecutionOutcome> {
    let mut variable_pool = checkpoint.variable_pool.clone();

    if let Some(patch) = resume_payload.as_object() {
        for (node_id, payload) in patch {
            variable_pool.insert(node_id.clone(), payload.clone());
        }
    }

    execute_from(plan, checkpoint.next_node_index, variable_pool)
}

fn execute_from(
    plan: &CompiledPlan,
    next_node_index: usize,
    mut variable_pool: Map<String, Value>,
) -> Result<FlowDebugExecutionOutcome> {
    let mut node_traces = Vec::new();

    for (index, node_id) in plan.topological_order.iter().enumerate().skip(next_node_index) {
        let node = plan
            .nodes
            .get(node_id)
            .ok_or_else(|| anyhow!("compiled node missing: {node_id}"))?;
        let resolved_inputs = resolve_node_inputs(node, &variable_pool)?;
        let rendered_templates = render_templated_bindings(node, &resolved_inputs);

        match node.node_type.as_str() {
            "start" => {
                let payload = variable_pool.get(node_id).cloned().unwrap_or_else(|| json!({}));
                node_traces.push(NodeExecutionTrace {
                    node_id: node.node_id.clone(),
                    node_type: node.node_type.clone(),
                    node_alias: node.alias.clone(),
                    input_payload: json!({}),
                    output_payload: payload,
                    metrics_payload: json!({ "preview_mode": true }),
                });
            }
            "llm" | "template_transform" | "answer" => {
                let output_key = node.outputs.first().map(|output| output.key.clone()).unwrap_or_else(|| "result".to_string());
                let output_payload = json!({
                    output_key: rendered_templates
                        .values()
                        .next()
                        .cloned()
                        .unwrap_or_else(|| resolved_inputs.values().next().cloned().unwrap_or(Value::Null))
                });
                variable_pool.insert(node.node_id.clone(), output_payload.clone());
                node_traces.push(NodeExecutionTrace {
                    node_id: node.node_id.clone(),
                    node_type: node.node_type.clone(),
                    node_alias: node.alias.clone(),
                    input_payload: Value::Object(resolved_inputs),
                    output_payload,
                    metrics_payload: json!({ "preview_mode": true }),
                });
            }
            "human_input" => {
                let prompt = rendered_templates
                    .get("prompt")
                    .and_then(Value::as_str)
                    .unwrap_or("请提供人工输入")
                    .to_string();
                node_traces.push(NodeExecutionTrace {
                    node_id: node.node_id.clone(),
                    node_type: node.node_type.clone(),
                    node_alias: node.alias.clone(),
                    input_payload: Value::Object(resolved_inputs),
                    output_payload: json!({}),
                    metrics_payload: json!({ "preview_mode": true, "waiting": "human_input" }),
                });
                return Ok(FlowDebugExecutionOutcome {
                    stop_reason: ExecutionStopReason::WaitingHuman(PendingHumanInput {
                        node_id: node.node_id.clone(),
                        node_alias: node.alias.clone(),
                        prompt,
                    }),
                    variable_pool,
                    checkpoint_snapshot: Some(CheckpointSnapshot {
                        next_node_index: index + 1,
                        variable_pool: variable_pool.clone(),
                    }),
                    node_traces,
                });
            }
            "tool" | "http_request" => {
                node_traces.push(NodeExecutionTrace {
                    node_id: node.node_id.clone(),
                    node_type: node.node_type.clone(),
                    node_alias: node.alias.clone(),
                    input_payload: Value::Object(resolved_inputs.clone()),
                    output_payload: json!({}),
                    metrics_payload: json!({ "preview_mode": true, "waiting": node.node_type }),
                });
                return Ok(FlowDebugExecutionOutcome {
                    stop_reason: ExecutionStopReason::WaitingCallback(PendingCallbackTask {
                        node_id: node.node_id.clone(),
                        node_alias: node.alias.clone(),
                        callback_kind: node.node_type.clone(),
                        request_payload: Value::Object(resolved_inputs),
                    }),
                    variable_pool,
                    checkpoint_snapshot: Some(CheckpointSnapshot {
                        next_node_index: index + 1,
                        variable_pool: variable_pool.clone(),
                    }),
                    node_traces,
                });
            }
            other => return Err(anyhow!("unsupported debug node type: {other}")),
        }
    }

    Ok(FlowDebugExecutionOutcome {
        stop_reason: ExecutionStopReason::Completed,
        variable_pool,
        checkpoint_snapshot: None,
        node_traces,
    })
}
```

- [ ] **Step 4: Run the runtime tests and ensure they pass**

Run:

```bash
cd api && cargo test -p orchestration-runtime execution_engine_tests
cd api && cargo test -p orchestration-runtime preview_executor_tests
```

Expected: PASS. `preview_executor_tests` 也应继续通过，证明 resolver 抽取后没有打坏第一份计划里的单节点 preview。

- [ ] **Step 5: Commit**

```bash
git add api/crates/orchestration-runtime/src/binding_runtime.rs \
  api/crates/orchestration-runtime/src/execution_state.rs \
  api/crates/orchestration-runtime/src/execution_engine.rs \
  api/crates/orchestration-runtime/src/lib.rs \
  api/crates/orchestration-runtime/src/preview_executor.rs \
  api/crates/orchestration-runtime/src/_tests/execution_engine_tests.rs \
  api/crates/orchestration-runtime/src/_tests/mod.rs
git commit -m "feat: add stateful flow debug executor"
```

## Task 2: Extend Runtime Domain And Repository For Resume State

**Files:**
- Modify: `api/crates/domain/src/orchestration.rs`
- Modify: `api/crates/domain/src/lib.rs`
- Modify: `api/crates/control-plane/src/ports.rs`
- Create: `api/crates/storage-pg/migrations/20260417210000_add_flow_run_resume_and_callback_tasks.sql`
- Modify: `api/crates/storage-pg/src/orchestration_runtime_repository.rs`
- Modify: `api/crates/storage-pg/src/mappers/orchestration_runtime_mapper.rs`
- Modify: `api/crates/storage-pg/src/_tests/orchestration_runtime_repository_tests.rs`

- [ ] **Step 1: Write the failing repository tests**

```rust
// api/crates/storage-pg/src/_tests/orchestration_runtime_repository_tests.rs
#[tokio::test]
async fn orchestration_runtime_repository_persists_waiting_human_checkpoint() {
    let pool = connect(&test_database_url()).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);

    let compiled = seed_compiled_plan(&store).await;
    let run = seed_flow_run_with_mode(&store, &compiled, "debug_flow_run").await;
    let node_run = seed_node_run(&store, &run, "node-human", "human_input").await;

    store
        .update_node_run(&UpdateNodeRunInput {
            node_run_id: node_run.id,
            status: domain::NodeRunStatus::WaitingHuman,
            output_payload: json!({}),
            error_payload: None,
            metrics_payload: json!({}),
            finished_at: None,
        })
        .await
        .unwrap();
    store
        .create_checkpoint(&CreateCheckpointInput {
            flow_run_id: run.id,
            node_run_id: Some(node_run.id),
            status: "waiting_human".to_string(),
            reason: "等待人工输入".to_string(),
            locator_payload: json!({ "node_id": "node-human", "next_node_index": 3 }),
            variable_snapshot: json!({ "node-llm": { "text": "草稿回复" } }),
            external_ref_payload: Some(json!({ "prompt": "请人工审核" })),
        })
        .await
        .unwrap();

    let detail = store
        .get_application_run_detail(run.application_id, run.id)
        .await
        .unwrap()
        .unwrap();

    assert_eq!(detail.flow_run.run_mode.as_str(), "debug_flow_run");
    assert_eq!(detail.checkpoints[0].status, "waiting_human");
    assert_eq!(
        detail.checkpoints[0].external_ref_payload.as_ref().unwrap()["prompt"],
        json!("请人工审核")
    );
}

#[tokio::test]
async fn orchestration_runtime_repository_returns_callback_tasks_with_run_detail() {
    let pool = connect(&test_database_url()).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);

    let compiled = seed_compiled_plan(&store).await;
    let run = seed_flow_run_with_mode(&store, &compiled, "debug_flow_run").await;
    let node_run = seed_node_run(&store, &run, "node-tool", "tool").await;

    store
        .create_callback_task(&CreateCallbackTaskInput {
            flow_run_id: run.id,
            node_run_id: node_run.id,
            callback_kind: "tool".to_string(),
            request_payload: json!({ "tool_name": "lookup_order" }),
            external_ref_payload: Some(json!({ "tool_name": "lookup_order" })),
        })
        .await
        .unwrap();

    let detail = store
        .get_application_run_detail(run.application_id, run.id)
        .await
        .unwrap()
        .unwrap();

    assert_eq!(detail.callback_tasks.len(), 1);
    assert_eq!(detail.callback_tasks[0].callback_kind, "tool");
    assert_eq!(detail.callback_tasks[0].status.as_str(), "pending");
}
```

- [ ] **Step 2: Run the targeted repository tests and confirm they fail**

Run:

```bash
cd api && cargo test -p storage-pg orchestration_runtime_repository_tests
```

Expected: FAIL with missing `debug_flow_run` mode parsing, missing `callback_tasks` table and missing repository methods for checkpoints / callback tasks / generic updates.

- [ ] **Step 3: Add domain records, generic update DTOs and PostgreSQL schema**

```rust
// api/crates/domain/src/orchestration.rs
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FlowRunMode {
    DebugNodePreview,
    DebugFlowRun,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CallbackTaskStatus {
    Pending,
    Completed,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CallbackTaskRecord {
    pub id: Uuid,
    pub flow_run_id: Uuid,
    pub node_run_id: Uuid,
    pub callback_kind: String,
    pub status: CallbackTaskStatus,
    pub request_payload: serde_json::Value,
    pub response_payload: Option<serde_json::Value>,
    pub external_ref_payload: Option<serde_json::Value>,
    pub created_at: OffsetDateTime,
    pub completed_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApplicationRunDetail {
    pub flow_run: FlowRunRecord,
    pub node_runs: Vec<NodeRunRecord>,
    pub checkpoints: Vec<CheckpointRecord>,
    pub callback_tasks: Vec<CallbackTaskRecord>,
    pub events: Vec<RunEventRecord>,
}
```

```rust
// api/crates/control-plane/src/ports.rs
#[derive(Debug, Clone)]
pub struct UpdateFlowRunInput {
    pub flow_run_id: Uuid,
    pub status: domain::FlowRunStatus,
    pub output_payload: serde_json::Value,
    pub error_payload: Option<serde_json::Value>,
    pub finished_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone)]
pub struct UpdateNodeRunInput {
    pub node_run_id: Uuid,
    pub status: domain::NodeRunStatus,
    pub output_payload: serde_json::Value,
    pub error_payload: Option<serde_json::Value>,
    pub metrics_payload: serde_json::Value,
    pub finished_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone)]
pub struct CreateCheckpointInput {
    pub flow_run_id: Uuid,
    pub node_run_id: Option<Uuid>,
    pub status: String,
    pub reason: String,
    pub locator_payload: serde_json::Value,
    pub variable_snapshot: serde_json::Value,
    pub external_ref_payload: Option<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct CreateCallbackTaskInput {
    pub flow_run_id: Uuid,
    pub node_run_id: Uuid,
    pub callback_kind: String,
    pub request_payload: serde_json::Value,
    pub external_ref_payload: Option<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct CompleteCallbackTaskInput {
    pub callback_task_id: Uuid,
    pub response_payload: serde_json::Value,
    pub completed_at: OffsetDateTime,
}

#[async_trait]
pub trait OrchestrationRuntimeRepository: Send + Sync {
    async fn get_compiled_plan(&self, compiled_plan_id: Uuid)
        -> anyhow::Result<Option<domain::CompiledPlanRecord>>;
    async fn get_flow_run(
        &self,
        application_id: Uuid,
        flow_run_id: Uuid,
    ) -> anyhow::Result<Option<domain::FlowRunRecord>>;
    async fn get_checkpoint(
        &self,
        flow_run_id: Uuid,
        checkpoint_id: Uuid,
    ) -> anyhow::Result<Option<domain::CheckpointRecord>>;
    async fn update_flow_run(
        &self,
        input: &UpdateFlowRunInput,
    ) -> anyhow::Result<domain::FlowRunRecord>;
    async fn update_node_run(
        &self,
        input: &UpdateNodeRunInput,
    ) -> anyhow::Result<domain::NodeRunRecord>;
    async fn create_checkpoint(
        &self,
        input: &CreateCheckpointInput,
    ) -> anyhow::Result<domain::CheckpointRecord>;
    async fn create_callback_task(
        &self,
        input: &CreateCallbackTaskInput,
    ) -> anyhow::Result<domain::CallbackTaskRecord>;
    async fn complete_callback_task(
        &self,
        input: &CompleteCallbackTaskInput,
    ) -> anyhow::Result<domain::CallbackTaskRecord>;
}
```

```sql
-- api/crates/storage-pg/migrations/20260417210000_add_flow_run_resume_and_callback_tasks.sql
alter table flow_runs drop constraint flow_runs_run_mode_check;

alter table flow_runs
    add constraint flow_runs_run_mode_check
    check (run_mode in ('debug_node_preview', 'debug_flow_run'));

create table flow_run_callback_tasks (
    id uuid primary key,
    flow_run_id uuid not null references flow_runs(id) on delete cascade,
    node_run_id uuid not null references node_runs(id) on delete cascade,
    callback_kind text not null,
    status text not null check (status in ('pending', 'completed', 'cancelled')),
    request_payload jsonb not null default '{}'::jsonb,
    response_payload jsonb,
    external_ref_payload jsonb,
    created_at timestamptz not null default now(),
    completed_at timestamptz
);

create index flow_run_callback_tasks_flow_created_idx
    on flow_run_callback_tasks (flow_run_id, created_at desc, id desc);
```

- [ ] **Step 4: Run repository tests and mapper regression tests**

Run:

```bash
cd api && cargo test -p storage-pg orchestration_runtime_repository_tests
cd api && cargo test -p storage-pg flow_repository_tests
cd api && cargo test -p storage-pg application_repository_tests
```

Expected: PASS. `flow_repository_tests` 和 `application_repository_tests` 需要继续通过，证明 run detail 聚合字段扩展没有打坏应用详情和 flow 读取链路。

- [ ] **Step 5: Commit**

```bash
git add api/crates/domain/src/orchestration.rs \
  api/crates/domain/src/lib.rs \
  api/crates/control-plane/src/ports.rs \
  api/crates/storage-pg/migrations/20260417210000_add_flow_run_resume_and_callback_tasks.sql \
  api/crates/storage-pg/src/orchestration_runtime_repository.rs \
  api/crates/storage-pg/src/mappers/orchestration_runtime_mapper.rs \
  api/crates/storage-pg/src/_tests/orchestration_runtime_repository_tests.rs
git commit -m "feat: persist runtime checkpoints and callback tasks"
```

## Task 3: Implement Control-Plane Whole-Flow Debug Run And Resume Commands

**Files:**
- Modify: `api/crates/control-plane/src/orchestration_runtime.rs`
- Create: `api/crates/control-plane/src/_tests/orchestration_runtime_resume_tests.rs`
- Modify: `api/crates/control-plane/src/_tests/mod.rs`

- [ ] **Step 1: Write the failing service tests**

```rust
// api/crates/control-plane/src/_tests/orchestration_runtime_resume_tests.rs
#[tokio::test]
async fn start_flow_debug_run_stops_at_human_input_and_persists_waiting_state() {
    let repository = seeded_runtime_repository_with_human_input_flow();
    let service = OrchestrationRuntimeService::new(repository.clone());

    let detail = service
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id: seeded_user_id(),
            application_id: seeded_application_id(),
            input_payload: json!({ "node-start": { "query": "请总结退款政策" } }),
        })
        .await
        .unwrap();

    assert_eq!(detail.flow_run.run_mode.as_str(), "debug_flow_run");
    assert_eq!(detail.flow_run.status.as_str(), "waiting_human");
    assert_eq!(detail.node_runs.last().unwrap().status.as_str(), "waiting_human");
    assert_eq!(detail.checkpoints.len(), 1);
}

#[tokio::test]
async fn resume_flow_run_with_human_input_finishes_downstream_answer_node() {
    let repository = seeded_waiting_human_repository();
    let service = OrchestrationRuntimeService::new(repository.clone());

    let detail = service
        .resume_flow_run(ResumeFlowRunCommand {
            actor_user_id: seeded_user_id(),
            application_id: seeded_application_id(),
            flow_run_id: seeded_flow_run_id(),
            checkpoint_id: seeded_checkpoint_id(),
            input_payload: json!({ "node-human": { "input": "已审核通过" } }),
        })
        .await
        .unwrap();

    assert_eq!(detail.flow_run.status.as_str(), "succeeded");
    assert_eq!(detail.node_runs.last().unwrap().node_id, "node-answer");
    assert_eq!(detail.flow_run.output_payload["answer"], json!("已审核通过"));
}

#[tokio::test]
async fn complete_callback_task_updates_task_and_requeues_waiting_run() {
    let repository = seeded_waiting_callback_repository();
    let service = OrchestrationRuntimeService::new(repository.clone());

    let detail = service
        .complete_callback_task(CompleteCallbackTaskCommand {
            actor_user_id: seeded_user_id(),
            application_id: seeded_application_id(),
            callback_task_id: seeded_callback_task_id(),
            response_payload: json!({ "result": { "status": "ok" } }),
        })
        .await
        .unwrap();

    assert_eq!(detail.callback_tasks[0].status.as_str(), "completed");
    assert_eq!(detail.flow_run.status.as_str(), "succeeded");
}
```

- [ ] **Step 2: Run the targeted service tests and confirm they fail**

Run:

```bash
cd api && cargo test -p control-plane orchestration_runtime_resume_tests
```

Expected: FAIL with missing `StartFlowDebugRunCommand` / `ResumeFlowRunCommand` / `CompleteCallbackTaskCommand` and missing persistence helpers for waiting states.

- [ ] **Step 3: Implement debug run start, resume and callback completion service**

```rust
// api/crates/control-plane/src/orchestration_runtime.rs
pub struct StartFlowDebugRunCommand {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub input_payload: serde_json::Value,
}

pub struct ResumeFlowRunCommand {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub flow_run_id: Uuid,
    pub checkpoint_id: Uuid,
    pub input_payload: serde_json::Value,
}

pub struct CompleteCallbackTaskCommand {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub callback_task_id: Uuid,
    pub response_payload: serde_json::Value,
}

impl<R> OrchestrationRuntimeService<R>
where
    R: ApplicationRepository + FlowRepository + OrchestrationRuntimeRepository + Clone,
{
    pub async fn start_flow_debug_run(
        &self,
        command: StartFlowDebugRunCommand,
    ) -> Result<domain::ApplicationRunDetail> {
        let editor_state = FlowService::new(self.repository.clone())
            .get_or_create_editor_state(command.actor_user_id, command.application_id)
            .await?;
        let compiled_plan = orchestration_runtime::compiler::FlowCompiler::compile(
            editor_state.flow.id,
            &editor_state.draft.id.to_string(),
            &editor_state.draft.document,
        )?;
        let outcome = orchestration_runtime::execution_engine::start_flow_debug_run(
            &compiled_plan,
            &command.input_payload,
        )?;
        let persisted = self
            .persist_flow_debug_outcome(
                command.actor_user_id,
                command.application_id,
                &editor_state,
                &compiled_plan,
                &command.input_payload,
                outcome,
                None,
            )
            .await?;

        Ok(persisted)
    }

    pub async fn resume_flow_run(
        &self,
        command: ResumeFlowRunCommand,
    ) -> Result<domain::ApplicationRunDetail> {
        let flow_run = self
            .repository
            .get_flow_run(command.application_id, command.flow_run_id)
            .await?
            .ok_or_else(|| anyhow!("flow run not found"))?;
        let checkpoint = self
            .repository
            .get_checkpoint(command.flow_run_id, command.checkpoint_id)
            .await?
            .ok_or_else(|| anyhow!("checkpoint not found"))?;
        let compiled_record = self
            .repository
            .get_compiled_plan(flow_run.compiled_plan_id)
            .await?
            .ok_or_else(|| anyhow!("compiled plan not found"))?;
        let compiled_plan: orchestration_runtime::compiled_plan::CompiledPlan =
            serde_json::from_value(compiled_record.plan.clone())?;
        let snapshot = orchestration_runtime::execution_state::CheckpointSnapshot {
            next_node_index: checkpoint
                .locator_payload
                .get("next_node_index")
                .and_then(serde_json::Value::as_u64)
                .ok_or_else(|| anyhow!("checkpoint is missing next_node_index"))?
                as usize,
            variable_pool: checkpoint
                .variable_snapshot
                .as_object()
                .cloned()
                .ok_or_else(|| anyhow!("checkpoint variable_snapshot must be an object"))?,
        };
        let outcome = orchestration_runtime::execution_engine::resume_flow_debug_run(
            &compiled_plan,
            &snapshot,
            &command.input_payload,
        )?;

        self.persist_flow_debug_outcome_for_existing_run(
            command.actor_user_id,
            command.application_id,
            &flow_run,
            &compiled_plan,
            outcome,
        )
        .await
    }
}
```

- [ ] **Step 4: Run runtime and control-plane tests**

Run:

```bash
cd api && cargo test -p control-plane orchestration_runtime_service_tests
cd api && cargo test -p control-plane orchestration_runtime_resume_tests
```

Expected: PASS. 原有 `orchestration_runtime_service_tests` 继续证明 single-node preview 没被打坏，新测试证明 waiting/resume 路径成立。

- [ ] **Step 5: Commit**

```bash
git add api/crates/control-plane/src/orchestration_runtime.rs \
  api/crates/control-plane/src/_tests/orchestration_runtime_resume_tests.rs \
  api/crates/control-plane/src/_tests/mod.rs
git commit -m "feat: add flow debug run resume service"
```

## Task 4: Expose Console Runtime Write APIs And Client Contracts

**Files:**
- Modify: `api/apps/api-server/src/routes/application_runtime.rs`
- Modify: `api/apps/api-server/src/openapi.rs`
- Modify: `api/apps/api-server/src/_tests/application_runtime_routes.rs`
- Modify: `web/packages/api-client/src/console-application-runtime.ts`
- Modify: `web/packages/api-client/src/index.ts`

- [ ] **Step 1: Write the failing route tests**

```rust
// api/apps/api-server/src/_tests/application_runtime_routes.rs
#[tokio::test]
async fn application_runtime_routes_start_debug_run_and_resume_waiting_human() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let application_id = seed_human_input_application(&app, &cookie, &csrf).await;

    let start = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/console/applications/{application_id}/orchestration/debug-runs"))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "input_payload": {
                            "node-start": { "query": "请总结退款政策" }
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(start.status(), StatusCode::CREATED);
    let payload: Value = read_json(start).await;
    let run_id = payload["data"]["flow_run"]["id"].as_str().unwrap();
    let checkpoint_id = payload["data"]["checkpoints"][0]["id"].as_str().unwrap();

    let resume = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/applications/{application_id}/orchestration/runs/{run_id}/resume"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "checkpoint_id": checkpoint_id,
                        "input_payload": {
                            "node-human": { "input": "已审核通过" }
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(resume.status(), StatusCode::OK);
}
```

- [ ] **Step 2: Run the route tests and confirm they fail**

Run:

```bash
cd api && cargo test -p api-server application_runtime_routes
```

Expected: FAIL with missing whole-flow debug run route, missing resume body DTO and missing client contract fields for `debug_flow_run` / `callback_tasks`.

- [ ] **Step 3: Implement runtime routes, response DTOs and api-client exports**

```rust
// api/apps/api-server/src/routes/application_runtime.rs
#[derive(Debug, Deserialize, ToSchema)]
pub struct StartFlowDebugRunBody {
    pub input_payload: serde_json::Value,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct ResumeFlowRunBody {
    pub checkpoint_id: String,
    pub input_payload: serde_json::Value,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CompleteCallbackTaskBody {
    pub response_payload: serde_json::Value,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CallbackTaskResponse {
    pub id: String,
    pub flow_run_id: String,
    pub node_run_id: String,
    pub callback_kind: String,
    pub status: String,
    pub request_payload: serde_json::Value,
    pub response_payload: Option<serde_json::Value>,
    pub external_ref_payload: Option<serde_json::Value>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route("/applications/:id/orchestration/debug-runs", post(start_flow_debug_run))
        .route(
            "/applications/:id/orchestration/runs/:run_id/resume",
            post(resume_flow_run),
        )
        .route(
            "/applications/:id/orchestration/callback-tasks/:callback_task_id/complete",
            post(complete_callback_task),
        )
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
export type ConsoleFlowRunMode = 'debug_node_preview' | 'debug_flow_run';

export interface ConsoleCallbackTask {
  id: string;
  flow_run_id: string;
  node_run_id: string;
  callback_kind: string;
  status: 'pending' | 'completed' | 'cancelled';
  request_payload: Record<string, unknown>;
  response_payload: Record<string, unknown> | null;
  external_ref_payload: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
}

export interface ConsoleApplicationRunDetail {
  flow_run: ConsoleFlowRunDetail;
  node_runs: ConsoleNodeRunDetail[];
  checkpoints: ConsoleRunCheckpoint[];
  callback_tasks: ConsoleCallbackTask[];
  events: ConsoleRunEvent[];
}

export function startConsoleFlowDebugRun(
  applicationId: string,
  input: { input_payload: Record<string, unknown> },
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleApplicationRunDetail>({
    path: `/api/console/applications/${applicationId}/orchestration/debug-runs`,
    method: 'POST',
    body: input,
    csrfToken,
    baseUrl
  });
}

export function resumeConsoleFlowRun(
  applicationId: string,
  runId: string,
  input: { checkpoint_id: string; input_payload: Record<string, unknown> },
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleApplicationRunDetail>({
    path: `/api/console/applications/${applicationId}/orchestration/runs/${runId}/resume`,
    method: 'POST',
    body: input,
    csrfToken,
    baseUrl
  });
}

export function completeConsoleCallbackTask(
  applicationId: string,
  callbackTaskId: string,
  input: { response_payload: Record<string, unknown> },
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleApplicationRunDetail>({
    path: `/api/console/applications/${applicationId}/orchestration/callback-tasks/${callbackTaskId}/complete`,
    method: 'POST',
    body: input,
    csrfToken,
    baseUrl
  });
}
```

- [ ] **Step 4: Run API and contract tests**

Run:

```bash
cd api && cargo test -p api-server application_runtime_routes
cd api && cargo test -p api-server openapi_alignment
```

Expected: PASS. `openapi_alignment` 也要通过，证明新增 DTO 已进入 canonical OpenAPI。

- [ ] **Step 5: Commit**

```bash
git add api/apps/api-server/src/routes/application_runtime.rs \
  api/apps/api-server/src/openapi.rs \
  api/apps/api-server/src/_tests/application_runtime_routes.rs \
  web/packages/api-client/src/console-application-runtime.ts \
  web/packages/api-client/src/index.ts
git commit -m "feat: expose runtime resume console apis"
```

## Task 5: Connect Editor Debug Run Trigger And Logs Resume Actions

**Files:**
- Modify: `web/app/src/features/agent-flow/api/runtime.ts`
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowOverlay.tsx`
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx`
- Modify: `web/app/src/features/applications/api/runtime.ts`
- Create: `web/app/src/features/applications/components/logs/ApplicationRunResumeCard.tsx`
- Modify: `web/app/src/features/applications/components/logs/ApplicationRunDetailDrawer.tsx`
- Modify: `web/app/src/features/applications/components/logs/ApplicationRunsTable.tsx`
- Create: `web/app/src/features/applications/_tests/application-run-resume-card.test.tsx`
- Modify: `web/app/src/features/applications/_tests/application-logs-page.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`

- [ ] **Step 1: Write the failing frontend tests**

```tsx
// web/app/src/features/applications/_tests/application-run-resume-card.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { ApplicationRunResumeCard } from '../components/logs/ApplicationRunResumeCard';

describe('ApplicationRunResumeCard', () => {
  test('submits waiting_human input payload', async () => {
    const onResume = vi.fn().mockResolvedValue(undefined);

    render(
      <ApplicationRunResumeCard
        detail={{
          flow_run: { status: 'waiting_human' },
          checkpoints: [
            {
              id: 'checkpoint-1',
              locator_payload: { node_id: 'node-human' },
              external_ref_payload: { prompt: '请人工审核' }
            }
          ],
          callback_tasks: []
        } as never}
        onResume={onResume}
        onCompleteCallback={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('人工输入'), {
      target: { value: '已审核通过' }
    });
    fireEvent.click(screen.getByRole('button', { name: '提交并继续' }));

    await waitFor(() => {
      expect(onResume).toHaveBeenCalledWith('checkpoint-1', {
        'node-human': { input: '已审核通过' }
      });
    });
  });
});
```

```tsx
// web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx
test('starts whole-flow debug run from overlay action', async () => {
  vi.spyOn(runtimeApi, 'buildFlowDebugRunInput').mockReturnValue({
    input_payload: {
      'node-start': { query: '请总结退款政策' }
    }
  });
  vi.spyOn(runtimeApi, 'startFlowDebugRun').mockResolvedValue({
    flow_run: { id: 'run-1', run_mode: 'debug_flow_run', status: 'waiting_human' },
    checkpoints: [{ id: 'checkpoint-1', reason: '等待人工输入' }],
    callback_tasks: [],
    node_runs: [],
    events: []
  } as never);

  renderShell(
    <div style={{ width: 1280, height: 720 }}>
      <AgentFlowEditorShell
        applicationId="app-1"
        applicationName="Support Agent"
        initialState={createInitialState()}
      />
    </div>
  );

  fireEvent.click(await screen.findByRole('button', { name: '调试整流' }));

  await waitFor(() => {
    expect(runtimeApi.startFlowDebugRun).toHaveBeenCalledWith(
      'app-1',
      { input_payload: { 'node-start': { query: '请总结退款政策' } } },
      expect.any(String)
    );
  });
});
```

- [ ] **Step 2: Run the targeted frontend tests and confirm they fail**

Run:

```bash
pnpm --dir web test -- --run \
  web/app/src/features/applications/_tests/application-run-resume-card.test.tsx \
  web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx \
  web/app/src/features/applications/_tests/application-logs-page.test.tsx
```

Expected: FAIL with missing `startFlowDebugRun`, missing `ApplicationRunResumeCard` and missing overlay resume action wiring.

- [ ] **Step 3: Implement editor trigger, runtime mutations and logs resume card**

```ts
// web/app/src/features/agent-flow/api/runtime.ts
import {
  getConsoleNodeLastRun,
  startConsoleFlowDebugRun,
  startConsoleNodeDebugPreview,
  type ConsoleApplicationRunDetail,
  type ConsoleNodeLastRun
} from '@1flowse/api-client';

export function buildFlowDebugRunInput(document: FlowAuthoringDocument) {
  const startNode = document.graph.nodes.find((node) => node.type === 'start');
  const startPayload: Record<string, unknown> = {};

  for (const output of startNode?.outputs ?? []) {
    startPayload[output.key] = buildPreviewValue(startNode, output.key);
  }

  return {
    input_payload: {
      [startNode?.id ?? 'node-start']: startPayload
    }
  };
}

export function startFlowDebugRun(
  applicationId: string,
  input: { input_payload: Record<string, Record<string, unknown>> },
  csrfToken: string
) {
  return startConsoleFlowDebugRun(
    applicationId,
    input,
    csrfToken,
    getApplicationsApiBaseUrl()
  );
}
```

```ts
// web/app/src/features/applications/api/runtime.ts
import {
  completeConsoleCallbackTask,
  getConsoleApplicationRunDetail,
  getConsoleApplicationRuns,
  resumeConsoleFlowRun,
  type ConsoleApplicationRunDetail,
  type ConsoleApplicationRunSummary
} from '@1flowse/api-client';

export type ApplicationRunSummary = ConsoleApplicationRunSummary;
export type ApplicationRunDetail = ConsoleApplicationRunDetail;

export function resumeFlowRun(
  applicationId: string,
  runId: string,
  checkpointId: string,
  inputPayload: Record<string, unknown>,
  csrfToken: string
) {
  return resumeConsoleFlowRun(
    applicationId,
    runId,
    {
      checkpoint_id: checkpointId,
      input_payload: inputPayload
    },
    csrfToken,
    getApplicationsApiBaseUrl()
  );
}

export function completeCallbackTask(
  applicationId: string,
  callbackTaskId: string,
  responsePayload: Record<string, unknown>,
  csrfToken: string
) {
  return completeConsoleCallbackTask(
    applicationId,
    callbackTaskId,
    {
      response_payload: responsePayload
    },
    csrfToken,
    getApplicationsApiBaseUrl()
  );
}
```

```tsx
// web/app/src/features/agent-flow/components/editor/AgentFlowOverlay.tsx
interface AgentFlowOverlayProps {
  applicationName: string;
  autosaveLabel: string;
  autosaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onSaveDraft: () => void;
  saveDisabled: boolean;
  saveLoading: boolean;
  onStartDebugRun: () => void;
  debugRunLoading: boolean;
  onOpenIssues: () => void;
  onOpenHistory: () => void;
  onOpenPublish: () => void;
  publishDisabled: boolean;
}

<Button loading={debugRunLoading} onClick={onStartDebugRun}>
  调试整流
</Button>
```

```tsx
// web/app/src/features/applications/components/logs/ApplicationRunResumeCard.tsx
import { Button, Card, Input, Space, Typography } from 'antd';
import { useMemo, useState } from 'react';

import type { ApplicationRunDetail } from '../../api/runtime';

export function ApplicationRunResumeCard({
  detail,
  onResume,
  onCompleteCallback
}: {
  detail: ApplicationRunDetail;
  onResume: (checkpointId: string, inputPayload: Record<string, unknown>) => Promise<void>;
  onCompleteCallback: (
    callbackTaskId: string,
    responsePayload: Record<string, unknown>
  ) => Promise<void>;
}) {
  const [humanInput, setHumanInput] = useState('');
  const [callbackJson, setCallbackJson] = useState('{\n  "result": {}\n}');
  const latestCheckpoint = useMemo(
    () => detail.checkpoints[detail.checkpoints.length - 1] ?? null,
    [detail.checkpoints]
  );
  const pendingCallback = detail.callback_tasks.find((task) => task.status === 'pending');

  if (detail.flow_run.status === 'waiting_human' && latestCheckpoint) {
    const waitingNodeId =
      (latestCheckpoint.locator_payload?.node_id as string | undefined) ?? 'node-human';

    return (
      <Card title="继续执行">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Typography.Text>
            {(latestCheckpoint.external_ref_payload?.prompt as string | undefined) ??
              '请提供人工输入'}
          </Typography.Text>
          <Input.TextArea
            aria-label="人工输入"
            rows={4}
            value={humanInput}
            onChange={(event) => setHumanInput(event.target.value)}
          />
          <Button
            type="primary"
            onClick={() =>
              onResume(latestCheckpoint.id, {
                [waitingNodeId]: { input: humanInput }
              })
            }
          >
            提交并继续
          </Button>
        </Space>
      </Card>
    );
  }

  if (detail.flow_run.status === 'waiting_callback' && pendingCallback) {
    return (
      <Card title="Callback 回填">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Typography.Text>{pendingCallback.callback_kind}</Typography.Text>
          <Input.TextArea
            aria-label="Callback 响应"
            rows={6}
            value={callbackJson}
            onChange={(event) => setCallbackJson(event.target.value)}
          />
          <Button
            type="primary"
            onClick={() =>
              onCompleteCallback(
                pendingCallback.id,
                JSON.parse(callbackJson) as Record<string, unknown>
              )
            }
          >
            回填并继续
          </Button>
        </Space>
      </Card>
    );
  }

  return null;
}
```

```tsx
// web/app/src/features/applications/components/logs/ApplicationRunDetailDrawer.tsx
{renderDetail(detail)}
<ApplicationRunResumeCard
  detail={detail}
  onResume={(checkpointId, inputPayload) =>
    resumeFlowRun(applicationId, detail.flow_run.id, checkpointId, inputPayload, csrfToken!)
  }
  onCompleteCallback={(callbackTaskId, responsePayload) =>
    completeCallbackTask(
      applicationId,
      callbackTaskId,
      responsePayload,
      csrfToken!
    )
  }
/>
```

- [ ] **Step 4: Run feature tests and frontend gates**

Run:

```bash
pnpm --dir web test -- --run \
  web/app/src/features/applications/_tests/application-run-resume-card.test.tsx \
  web/app/src/features/applications/_tests/application-logs-page.test.tsx \
  web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx
pnpm --dir web lint
pnpm --dir web/app build
```

Expected: PASS. `build` 必须通过，证明 overlay props 和 runtime client types 扩展没有把应用详情页或 editor 壳层打坏。

- [ ] **Step 5: Commit**

```bash
git add web/app/src/features/agent-flow/api/runtime.ts \
  web/app/src/features/agent-flow/components/editor/AgentFlowOverlay.tsx \
  web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx \
  web/app/src/features/applications/api/runtime.ts \
  web/app/src/features/applications/components/logs/ApplicationRunResumeCard.tsx \
  web/app/src/features/applications/components/logs/ApplicationRunDetailDrawer.tsx \
  web/app/src/features/applications/components/logs/ApplicationRunsTable.tsx \
  web/app/src/features/applications/_tests/application-run-resume-card.test.tsx \
  web/app/src/features/applications/_tests/application-logs-page.test.tsx \
  web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx
git commit -m "feat: wire debug run resume actions in console"
```

## Task 6: Full Verification And Plan Backfill

**Files:**
- Modify: `api/crates/orchestration-runtime/src/_tests/execution_engine_tests.rs`
- Modify: `api/crates/control-plane/src/_tests/orchestration_runtime_resume_tests.rs`
- Modify: `api/crates/storage-pg/src/_tests/orchestration_runtime_repository_tests.rs`
- Modify: `api/apps/api-server/src/_tests/application_runtime_routes.rs`
- Modify: `web/app/src/features/applications/_tests/application-run-resume-card.test.tsx`
- Modify: `web/app/src/features/applications/_tests/application-logs-page.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx`
- Modify: `docs/superpowers/plans/2026-04-17-module-05-stateful-debug-run-and-resume.md`
- Create: `.memory/project-memory/2026-04-17-module-05-stateful-debug-run-plan-implemented.md`

- [ ] **Step 1: Run targeted backend behavior tests serially**

Run:

```bash
cd api && cargo test -p orchestration-runtime execution_engine_tests
cd api && cargo test -p orchestration-runtime preview_executor_tests
cd api && cargo test -p control-plane orchestration_runtime_service_tests
cd api && cargo test -p control-plane orchestration_runtime_resume_tests
cd api && cargo test -p storage-pg orchestration_runtime_repository_tests
cd api && cargo test -p api-server application_runtime_routes
```

Expected: PASS. 这些命令先给出 whole-flow debug run 与 resume 行为证据，不受统一脚本前置格式门禁干扰。

- [ ] **Step 2: Format Rust code and run the unified backend gate**

Run:

```bash
cd api && cargo fmt --all
node scripts/node/verify-backend.js
```

Expected: PASS. 若 `verify-backend.js` 先报格式 diff，先修格式再重跑，不要把它误判成 runtime 恢复逻辑失败。

- [ ] **Step 3: Re-run frontend gates and manual smoke**

Run:

```bash
pnpm --dir web lint
pnpm --dir web test
pnpm --dir web/app build
```

Manual smoke:

```text
1. 打开一个已有 flow 的 Application Detail -> orchestration，点击“调试整流”。
2. 如果 flow 含 `human_input` 节点，确认 run 进入 `waiting_human`，Logs 页详情出现继续执行卡片。
3. 在继续执行卡片中提交人工输入，确认 run 继续到下游 `answer` 并最终 `succeeded`。
4. 如果 flow 含 `tool` 或 `http_request` 节点，确认 run 进入 `waiting_callback`，Logs 页可回填 callback 结果。
5. 回填 callback 后确认 run detail 中 `callback_task` 变为 `completed`，事件时间线追加 `flow_run_resumed` / `flow_run_completed`。
```

- [ ] **Step 4: Backfill this plan document during execution**

```md
- 把已完成步骤改成 `- [x]`
- 在对应任务下追加执行备注：
  - 完成时间
  - 实际运行命令
  - 若命令为更精确的模块路径，也写回这里
  - 若为等待态 / resume 路径增加了额外测试样例，也写回这里
```

- [ ] **Step 5: Commit the verification and plan-status backfill**

```bash
git add api/crates/orchestration-runtime/src/_tests/execution_engine_tests.rs \
  api/crates/control-plane/src/_tests/orchestration_runtime_resume_tests.rs \
  api/crates/storage-pg/src/_tests/orchestration_runtime_repository_tests.rs \
  api/apps/api-server/src/_tests/application_runtime_routes.rs \
  web/app/src/features/applications/_tests/application-run-resume-card.test.tsx \
  web/app/src/features/applications/_tests/application-logs-page.test.tsx \
  web/app/src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx
git commit -m "fix: satisfy stateful runtime debug verification"

git add docs/superpowers/plans/2026-04-17-module-05-stateful-debug-run-and-resume.md \
  .memory/project-memory/2026-04-17-module-05-stateful-debug-run-plan-implemented.md
git commit -m "docs: backfill module 05 stateful debug run plan"
```
