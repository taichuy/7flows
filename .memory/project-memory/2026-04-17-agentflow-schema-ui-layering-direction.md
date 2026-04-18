---
memory_type: project
topic: agentFlow schema UI 分层与首阶段范围已拍板
summary: 用户已确认 1flowbase 的 schema UI 先拆为 `canvas_node_schema`、`overlay_shell_schema`、`page_block_schema` 三类，其中当前阶段只落前两类；schema 真值先由前端 registry 提供，使用 typed contract + renderer registry，不在当前阶段引入后端下发 schema 和 page block renderer。
keywords:
  - agentflow
  - schema ui
  - canvas node schema
  - overlay shell schema
  - page block schema
  - registry
  - typed contract
match_when:
  - 需要继续设计或实现 agentFlow 的 schema UI 重构
  - 需要判断 page_block_schema 是否在当前阶段落地
  - 需要确认 schema 真值先由前端还是后端提供
created_at: 2026-04-17 23
updated_at: 2026-04-17 23
last_verified_at: 2026-04-17 23
decision_policy: verify_before_decision
scope:
  - web/app/src/features/agent-flow
  - web/app/src/shared
  - docs/superpowers/specs
---

# agentFlow schema UI 分层与首阶段范围已拍板

## 时间

`2026-04-17 23`

## 谁在做什么

用户正在推进 `agentFlow` 子节点 UI 的结构化重构，要求从“一个个调节点界面”转向“按 schema UI 和公共容器统一抽象”。AI 已对照当前 `1flowbase`、`../dify`、`../nocobase` 实现完成第一轮边界分析，现已得到用户对关键方向的明确选择。

## 为什么这样做

当前 `agent-flow` 仍处于混合态：节点元信息、字段定义、详情卡片和停靠面板壳层分散在多个组件中，`NodeInspector` 只是字段渲染器雏形，还没有形成真正的节点 schema runtime。继续在现状上局部修补，会让节点详情、弹窗壳层和插件扩展继续分叉。

## 为什么要做

目标是让节点 UI、详情 UI 和未来插件扩展都收敛到稳定合同上，先建立 `canvas_node_schema` 和 `overlay_shell_schema` 两条运行时主线，再为未来 `page_block_schema` 预留位置与类型，不在当前阶段把范围扩展到页面区块 renderer。

## 截止日期

无

## 决策背后动机

- schema 分层固定拆为三类：`canvas_node_schema`、`overlay_shell_schema`、`page_block_schema`。
- 当前阶段只实现前两类；`page_block_schema` 只保留预留位置和设计，不落 renderer。
- schema 真值本阶段先由前端 registry 提供，不要求后端直接下发。
- `canvas_node_schema` 粒度按完整节点 UI 定义，而不是只覆盖配置字段；至少应能覆盖节点卡片、详情头、配置区、输出/关系和运行态预留槽。
- `overlay_shell_schema` 当前阶段只统一 `dock panel`、`drawer form`、`modal form` 三类主容器，不把全部 popover / menu 一起纳入。
- schema 合同采用 typed contract + renderer registry，不直接引入重型 DSL，也不允许任意组件名透传破坏边界。
- 插件扩展方向允许注册“节点类型 + schema + renderer slots + data adapter”，而不是只允许追加字段。

## 关联文档

- `docs/superpowers/specs/1flowbase/2026-04-16-agentflow-node-detail-design.md`
- `web/app/src/features/agent-flow/lib/node-definitions.tsx`
- `web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx`
