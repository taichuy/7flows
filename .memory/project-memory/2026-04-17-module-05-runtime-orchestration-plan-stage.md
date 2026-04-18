---
memory_type: project
topic: 模块 05 runtime orchestration 已从 readiness 评估进入 implementation plan 阶段
project_memory_state: in_progress
summary: 用户在 `2026-04-17 17` 明确要求把 `05` 写成正式计划；当前仓库已按该计划落下 `compiled plan + 单节点 debug preview + application logs / node last run` 最小链路，但统一验证、计划回填，以及更完整的 runtime route/query 仍未闭环，因此该专题仍按执行中计划阶段维护。
execution_gap:
  - compiled plan 已有
  - 单节点 debug preview 与 application logs / node last run 最小链路已落地
  - 统一验证与计划回填仍未闭环
  - 更完整的 runtime 路由与运行查询仍未闭环
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
updated_at: 2026-04-17 18
last_verified_at: 2026-04-17 18
decision_policy: verify_before_decision
scope:
  - docs/superpowers/plans/2026-04-17-module-05-runtime-orchestration.md
  - docs/superpowers/specs/1flowbase/modules/05-runtime-orchestration/README.md
  - docs/superpowers/specs/1flowbase/2026-04-10-orchestration-design-draft.md
  - api/crates/orchestration-runtime
  - api/crates/control-plane/src/orchestration_runtime.rs
  - api/apps/api-server/src/routes/application_runtime.rs
  - api/crates/storage-pg/migrations/20260417173000_create_orchestration_runtime_tables.sql
  - web/packages/api-client/src/console-application-runtime.ts
  - web/app/src/features/applications/pages/ApplicationLogsPage.tsx
  - web/app/src/features/agent-flow/components/detail/tabs/NodeLastRunTab.tsx
---

# 模块 05 runtime orchestration 已从 readiness 评估进入 implementation plan 阶段

## 时间

`2026-04-17 17`

## 谁在做什么

- 用户已经确认 `05` 应该正式启动，但启动方式是先落 implementation plan，而不是直接冲完整运行时。
- AI 已将 `05` 的实现拆成可执行任务，并固定到 `docs/superpowers/plans/2026-04-17-module-05-runtime-orchestration.md`；当前前 4 个任务对应的 `compiled plan`、runtime 持久化、console runtime routes 和前端 logs / last-run 接线已经落到代码。

## 为什么这样做

- 当前专题不能再被视为“只有计划没有实现”的阶段，因为最小 runtime 主链已经有第一版代码落地。
- 但统一验证、计划回填以及更完整的 runtime route/query 仍未收口，直接宣称 `05` 已完整闭环会误导后续决策。
- 继续直接做完整运行时，会把整流执行、恢复、callback/human-loop 和 observability 基建同时摊开，范围失控。

## 为什么要做

- 把 `05` 锁定为“最小运行闭环”后，后续实现可以围绕稳定边界推进，不会再回到“是不是应该先做 full runtime”的讨论。
- 先补 `Compiled Plan` 与运行对象，再接应用级 logs 和 node last run，已经让 `04` 留下来的壳层接上第一版真实数据；后续重点是把剩余闭环收口。

## 截止日期

- 当前目标是完成统一验证、计划回填与剩余 runtime 闭环收口；尚未进入完整运行时交付阶段。

## 决策背后动机

- 本次计划明确选择 `单节点 debug preview` 作为首个执行入口，而不是整流 debug run。
- 新代码边界固定为独立 `orchestration-runtime` crate，不继续向当前 `runtime-core` 堆叠 `05` 语义。
- 当前已落地的第一批范围为：
  - `draft -> compiled plan`
  - `flow_run / node_run / checkpoint / event log` 数据模型与表
  - 单节点 debug preview
  - 应用级 logs list/detail
  - node last run API 与现有前端壳层接线
- 当前仍明确暂缓：
  - `callback / waiting_human / resume`
  - 整流 debug run
  - metrics dashboard / tracing config
  - 真实外部副作用执行

## 关联文档

- `docs/superpowers/plans/2026-04-17-module-05-runtime-orchestration.md`
- `docs/superpowers/specs/1flowbase/modules/05-runtime-orchestration/README.md`
- `docs/superpowers/specs/1flowbase/2026-04-10-orchestration-design-draft.md`
