---
memory_type: project
topic: AgentFlow Data Model 节点拆分为固定 CRUD 节点
project_memory_state: implemented
summary: 用户确认不再用单个 `data_model` 节点通过 `config.action` 切换 CRUD，而是拆为 `data_model_list/get/create/update/delete` 五个内置节点；当前实现已移除前端旧节点入口，节点显示先用英文，中文留到后续 i18n 统一处理。
keywords:
  - agentflow
  - data model node
  - crud nodes
  - flow schema
  - i18n
match_when:
  - 后续新增或调整 AgentFlow 数据模型节点
  - 讨论数据节点是否用 action 下拉还是固定节点类型
  - 处理旧 `data_model` 节点兼容或迁移问题
created_at: 2026-05-04 22
updated_at: 2026-05-04 22
last_verified_at: 2026-05-04 22
decision_policy: verify_before_decision
scope:
  - web/packages/flow-schema
  - web/app/src/features/agent-flow
  - api/crates/orchestration-runtime
  - api/crates/control-plane/src/orchestration_runtime
---

# AgentFlow Data Model 节点拆分为固定 CRUD 节点

## 时间

`2026-05-04 22`

## 谁在做什么

用户确认 AgentFlow 的 Data Model 节点按 CRUD 拆分：查询多条、查询单条、新增、更新、删除分别作为独立内置节点。AI 已按该方向调整前端 schema、节点选择器、节点工厂、调试预览、文档校验、编译器 binding 过滤和后端 data model runtime action 分发。

## 为什么这样做

数据能力已经天然按 CRUD 分组；继续用单个节点通过 `config.action` 变更表单和输出，会让节点选择、Inspector 字段、输出契约和调试输入都产生动态变脸。拆成固定节点后，每个节点的字段、输出和运行语义都稳定。

## 为什么要做

降低用户在画布选择节点和理解输出变量时的成本，减少 schema adapter 里根据 action 动态改 outputs 的特殊逻辑，也让后端编译期可以直接按节点类型过滤有效 bindings。

## 截止日期

无。

## 决策背后动机

- 新内置节点类型为 `data_model_list`、`data_model_get`、`data_model_create`、`data_model_update`、`data_model_delete`。
- 前端节点显示先用英文，例如 `Data Model List`，中文文案后续和 i18n 一起统一处理。
- 当前开发阶段不保留旧 `data_model + config.action` 入口兼容。
- 后端仍复用同一个 Data Model runtime，实现上只从节点类型推导 action，不复制五套执行逻辑。
