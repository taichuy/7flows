---
memory_type: project
topic: 模型供应商接入已从确认设计进入 implementation plan 阶段
summary: 自 `2026-04-18 11` 起，模型供应商接入专题已从“设计已确认、CLI 已落地”进入正式实现计划阶段；计划文档固定为 `docs/superpowers/plans/2026-04-18-model-provider-integration.md`，并明确按“后端任务先写、前端页面后置、前端完成时维护文件索引”的顺序推进。
keywords:
  - model-provider
  - plugin-framework
  - plugin-runner
  - implementation-plan
  - openai-compatible
  - settings
  - agentflow
match_when:
  - 需要继续执行模型供应商接入专题
  - 需要确认当前是否还停留在设计阶段
  - 需要找到供应商接入的正式 implementation plan
  - 需要确认任务顺序是否为后端优先、前端后置
created_at: 2026-04-18 11
updated_at: 2026-04-18 11
last_verified_at: 2026-04-18 11
decision_policy: verify_before_decision
scope:
  - docs/superpowers/plans/2026-04-18-model-provider-integration.md
  - docs/superpowers/specs/1flowbase/2026-04-18-model-provider-integration-design.md
  - docs/superpowers/specs/1flowbase/modules/08-plugin-framework/README.md
  - docs/superpowers/specs/1flowbase/modules/05-runtime-orchestration/README.md
  - api/crates/plugin-framework
  - api/apps/plugin-runner
  - api/crates/control-plane/src/model_provider.rs
  - api/crates/control-plane/src/plugin_management.rs
  - web/app/src/features/settings
  - web/app/src/features/agent-flow
  - ../1flowbase-official-plugins/models/openai_compatible
---

# 模型供应商接入已从确认设计进入 implementation plan 阶段

## 时间

`2026-04-18 11`

## 谁在做什么

- 用户已明确结束“CLI 是否已落地”的讨论，要求把模型供应商专题转成正式实现计划。
- AI 已将该专题写成 `docs/superpowers/plans/2026-04-18-model-provider-integration.md`，准备按计划推进实现。

## 为什么这样做

- 当前设计边界已经确认，继续停留在讨论态只会重复“provider kernel 是什么、CLI 是否存在、demo dev 是否已打通 runtime”这些已定事实。
- 该专题同时涉及 `plugin-framework`、`plugin-runner`、控制面、运行时、设置页和 `agentFlow` 节点；如果没有统一计划，后续容易把前端提前到后端 contract 之前，导致返工。

## 为什么要做

- 让宿主真正具备 provider plugin 安装、分配、实例配置、模型发现、运行时消费和前端选择链路。
- 把 `openai_compatible` 落成第一份官方参考插件，为后续其他 provider 按同一 contract 独立接入提供稳定样板。

## 截止日期

- 无

## 决策背后动机

- 任务顺序固定为后端优先：先做 provider contract、runner host、持久化、service、route 和 compile/runtime 校验，再做 `Settings / 模型供应商` 与 `LlmModelField`。
- 前端页面因为后续可能还会继续调整，所以计划中显式新增了 `Frontend File Index`，要求在前端任务完成时同步回填文件责任与本轮改动。
- 当前第一版 `plugin CLI` 已存在于主仓库，后续计划不会再按“CLI 还没落地”作为前提回答。

## 关联文档

- `docs/superpowers/plans/2026-04-18-model-provider-integration.md`
- `docs/superpowers/specs/1flowbase/2026-04-18-model-provider-integration-design.md`
- `docs/superpowers/specs/1flowbase/modules/08-plugin-framework/README.md`
- `docs/superpowers/specs/1flowbase/modules/05-runtime-orchestration/README.md`
