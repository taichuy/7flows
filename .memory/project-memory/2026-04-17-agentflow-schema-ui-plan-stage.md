---
memory_type: project
topic: agentFlow schema UI 已进入计划阶段
project_memory_state: plan
summary: 基于 2026-04-17 已确认的 schema UI 分层决策，AI 已产出 `docs/superpowers/plans/2026-04-17-agentflow-schema-ui.md`，当前进入执行前计划阶段；计划固定采用前端 registry-first 方案，当前阶段覆盖 `canvas_node_schema` 与 `overlay_shell_schema`，并以 `NodeDetailPanel`、`VersionHistoryDrawer`、`ApplicationCreateModal` 作为首批迁移样板。
keywords:
  - agentflow
  - schema ui
  - plan
  - canvas node schema
  - overlay shell schema
  - registry
match_when:
  - 需要继续执行 agentFlow schema UI 重构计划
  - 需要确认 schema UI 当前处于设计还是计划阶段
  - 需要定位本轮计划文档和迁移样板范围
created_at: 2026-04-17 23
updated_at: 2026-04-17 23
last_verified_at: 2026-04-17 23
decision_policy: verify_before_decision
scope:
  - docs/superpowers/plans/2026-04-17-agentflow-schema-ui.md
  - web/app/src/shared/schema-ui
  - web/app/src/features/agent-flow
  - web/app/src/features/applications/components/ApplicationCreateModal.tsx
---

# agentFlow schema UI 已进入计划阶段

## 时间

`2026-04-17 23`

## 谁在做什么

用户已确认 schema UI 的分层和执行边界，AI 已把方案写成正式实现计划，接下来可直接按计划执行。

## 为什么这样做

当前 `agent-flow` 的节点卡片、节点详情和非画布壳层仍是混合实现，需要通过计划把 contracts、runtime、registry、adapter 和迁移顺序锁定，避免执行时继续发散。

## 为什么要做

目的是把 UI 真值从分散组件迁到可注册、可扩展的 schema runtime，并用最小样板验证跨 feature 的 overlay shell 能力。

## 截止日期

无

## 决策背后动机

- 采用前端 registry-first，而不是本轮直接上后端下发 schema。
- `page_block_schema` 当前只做预留，不扩到 renderer 和页面接入。
- 首批迁移样板固定为 `NodeDetailPanel`、`VersionHistoryDrawer`、`ApplicationCreateModal`，确保同时验证 `dock_panel`、`drawer_panel`、`modal_panel` 三类壳层。

## 关联文档

- `docs/superpowers/plans/2026-04-17-agentflow-schema-ui.md`
- `.memory/project-memory/2026-04-17-agentflow-schema-ui-layering-direction.md`
