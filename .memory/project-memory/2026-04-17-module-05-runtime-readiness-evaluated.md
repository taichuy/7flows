---
memory_type: project
topic: 模块 05 runtime orchestration readiness 已按当前代码事实核查
project_memory_state: readiness
summary: `2026-04-17 18` 基于当前代码复核后，`03/04` 的应用宿主壳层、authoring document、draft/version 编辑闭环、`compiled plan` 编译链路、单节点 debug preview，以及应用 `logs / node last run` 最小查询链路都已落地；但更完整的 runtime route/query、monitoring 事实查询、callback/human-loop 与 observability 闭环仍未完成。
execution_gap:
  - compiled plan 已有
  - 单节点 debug preview 与 application logs / node last run 最小查询链路已闭环
  - 更完整的 runtime 路由仍未闭环
  - 更完整的运行查询与 monitoring 事实视图仍未闭环
keywords:
  - module-05
  - runtime-orchestration
  - readiness
  - compiled-plan
  - flow-run
  - node-run
  - checkpoint
match_when:
  - 需要判断是否可以从 04 进入 05
  - 需要评估当前代码是否已经具备 runtime orchestration 起步条件
  - 需要回看 03 04 对 05 的真实挂点是否已落地
created_at: 2026-04-17 17
updated_at: 2026-04-17 18
last_verified_at: 2026-04-17 18
decision_policy: verify_before_decision
scope:
  - docs/superpowers/specs/1flowse/modules/05-runtime-orchestration/README.md
  - docs/superpowers/specs/1flowse/modules/03-workspace-and-application/README.md
  - api/crates/orchestration-runtime
  - api/apps/api-server/src/routes/application_runtime.rs
  - web/packages/api-client/src/console-application-runtime.ts
  - web/app/src/features/applications/pages/ApplicationLogsPage.tsx
  - web/app/src/features/agent-flow/components/detail/tabs/NodeLastRunTab.tsx
  - web/app/src/features/agent-flow
  - web/app/src/features/applications
  - api/crates/storage-pg/migrations/20260417173000_create_orchestration_runtime_tables.sql
  - api/crates/observability
---

# 模块 05 runtime orchestration readiness 已按当前代码事实核查

## 时间

`2026-04-17 17`

## 谁在做什么

- 用户在判断 `04` 是否已经推进到可以开启 `05` 的阶段。
- AI 按当前仓库代码、模块 spec 和记忆，对 `03/04/05` 的衔接状态做 readiness 核查。

## 为什么这样做

- `05` 不是孤立专题，它依赖 `03` 的 application shell 和 `04` 的 authoring / draft / node detail 挂点是否已经稳定。
- 如果这些前置锚点已经足够稳定，就可以开始 `05`；如果没有，继续推进会反复返工边界。

## 为什么要做

- 给后续 `05` 一个清晰的启动口径：是直接大规模实现，还是先写 spec / plan 并补运行时骨架。

## 截止日期

- 无

## 决策背后动机

- 当前代码已具备这些正向条件：
  - `Application` 详情四分区路由已经落地，`orchestration` 接到 editor，`logs` 接到真实 `ApplicationLogsPage`。
  - `agentFlow` 已具备稳定的 `FlowAuthoringDocument`、binding schema、draft autosave、version restore 和 node detail last-run 挂点。
  - 仓库内已经存在 `orchestration-runtime`、`compiled plan` 编译链路、单节点 debug preview 服务与 runtime 持久化模型。
  - `application_runtime` 路由、`@1flowse/api-client` contract，以及前端 `ApplicationLogsPage / NodeLastRunTab` 查询已经接通最小运行闭环。
- 当前代码仍缺这些关键能力：
  - runtime 路由与查询目前仍局限在 `单节点 debug preview + logs run list/detail + node last run`，尚未扩展到整流运行、恢复、callback/human-loop 与更广泛 orchestration 查询。
  - `monitoring` 分区仍主要是 capability status，而不是完整运行事实视图。
  - 真实外部副作用执行、`waiting_human / resume` 与更完整 observability 闭环仍未落地。
- 因此结论固定为：
  - `05` 已经越过“能不能开始”的门槛，并且最小 runtime 闭环已有第一版落地。
  - 后续重点应转向补齐更完整的 runtime route/query、monitoring 查询和执行恢复能力，而不是回到 readiness 争论。
  - 仍不建议直接跳到完整调试面板、监控图表或 callback/human-loop 全量实现。
