---
memory_type: project
topic: 模块 05 runtime orchestration 已从 readiness 评估进入 implementation plan 阶段
summary: 用户在 `2026-04-17 17` 明确要求把 `05` 写成正式计划；计划已固定为 `docs/superpowers/plans/2026-04-17-module-05-runtime-orchestration.md`，并锁定为“单节点 debug preview + logs/node last run”的最小运行闭环，不直接铺完整运行时。
keywords:
  - module-05
  - runtime-orchestration
  - implementation-plan
  - plan-stage
  - compiled-plan
  - flow-run
  - node-run
match_when:
  - 需要继续执行模块 05 runtime orchestration
  - 需要确认模块 05 当前是 readiness 结论还是 plan 阶段
  - 需要定位模块 05 的正式 implementation plan 文件
created_at: 2026-04-17 17
updated_at: 2026-04-17 17
last_verified_at: 2026-04-17 17
decision_policy: verify_before_decision
scope:
  - docs/superpowers/plans/2026-04-17-module-05-runtime-orchestration.md
  - docs/superpowers/specs/1flowse/modules/05-runtime-orchestration/README.md
  - docs/superpowers/specs/1flowse/2026-04-10-orchestration-design-draft.md
  - api/crates/orchestration-runtime
  - api/crates/control-plane/src/orchestration_runtime.rs
  - api/crates/storage-pg/migrations/20260417173000_create_orchestration_runtime_tables.sql
  - web/app/src/features/applications/pages/ApplicationLogsPage.tsx
  - web/app/src/features/agent-flow/components/detail/tabs/NodeLastRunTab.tsx
---

# 模块 05 runtime orchestration 已从 readiness 评估进入 implementation plan 阶段

## 时间

`2026-04-17 17`

## 谁在做什么

- 用户已经确认 `05` 应该正式启动，但启动方式是先落 implementation plan，而不是直接冲完整运行时。
- AI 已将 `05` 的实现拆成可执行任务，并固定到 `docs/superpowers/plans/2026-04-17-module-05-runtime-orchestration.md`。

## 为什么这样做

- 当前代码已经具备 `03/04` 的宿主壳层、authoring document、draft/version 和 node detail last-run 挂点。
- 但 `Compiled Plan`、`Flow Run / Node Run / Checkpoint / Event Log`、logs 查询 API 和独立 orchestration runtime 层仍不存在。
- 继续直接做完整运行时，会把领域建模、执行骨架、日志查询和 observability 基建同时摊开，范围失控。

## 为什么要做

- 把 `05` 锁定为“最小运行闭环”后，后续实现可以围绕稳定边界推进，不会再回到“是不是应该先做 full runtime”的讨论。
- 先补 `Compiled Plan` 与运行对象，再接应用级 logs 和 node last run，能让 `04` 留下来的壳层尽快接上真实数据。

## 截止日期

- 当前目标是进入计划执行阶段；尚未进入完整运行时交付阶段。

## 决策背后动机

- 本次计划明确选择 `单节点 debug preview` 作为首个执行入口，而不是整流 debug run。
- 新代码边界固定为独立 `orchestration-runtime` crate，不继续向当前 `runtime-core` 堆叠 `05` 语义。
- 第一批范围固定为：
  - `draft -> compiled plan`
  - `flow_run / node_run / checkpoint / event log` 数据模型与表
  - 单节点 debug preview
  - 应用级 logs list/detail
  - node last run API 与现有前端壳层接线
- 明确暂缓：
  - `callback / waiting_human / resume`
  - 整流 debug run
  - metrics dashboard / tracing config
  - 真实外部副作用执行

## 关联文档

- `docs/superpowers/plans/2026-04-17-module-05-runtime-orchestration.md`
- `docs/superpowers/specs/1flowse/modules/05-runtime-orchestration/README.md`
- `docs/superpowers/specs/1flowse/2026-04-10-orchestration-design-draft.md`
