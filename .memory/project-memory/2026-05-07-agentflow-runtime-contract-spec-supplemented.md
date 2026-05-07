---
memory_type: project
topic: agentflow-runtime-contract-spec-supplemented
summary: Agent Flow 变量链接器与运行态契约 spec 已补入持久化/snapshot、缓存边界、RuntimeEventStream/LLM streaming、plugin contribution v2、Data Model side effect matrix 和 object-level 变量缓存展示规则。
keywords:
  - agentflow
  - runtime contract
  - variable linker
  - debug snapshot
  - RuntimeEventStream
  - plugin contribution v2
  - data model side effect
created_at: 2026-05-07 23
updated_at: 2026-05-07 23
last_verified_at: 2026-05-07 23
decision_policy: verify_before_decision
scope:
  - docs/superpowers/specs/1flowbase/2026-05-07-agent-flow-variable-linker-runtime-contract-design.md
  - web/app/src/features/agent-flow
  - api/crates/orchestration-runtime
  - api/crates/control-plane
  - api/crates/plugin-framework
---

# Agent Flow Runtime Contract Spec Supplemented

## 谁在做什么？

用户要求把 2026-05-07 对 Agent Flow 变量链接器与运行态契约设计文档的审计意见补充进 spec。AI 已将补充写入目标文档，并提交推送。

## 为什么这样做？

原 spec 已经确定 public-only outputs 的主方向，但持久化真值源、debug snapshot key/失效、RuntimeEventStream 与 LLM streaming、plugin contribution v2、Data Model 写入副作用和变量缓存 object-level 展示还不够硬，后续彻底重构容易继续把运行输入、输出、指标、错误和 debug 证据混在一起。

## 为什么要做？

这份 spec 将作为后续 implementation plan 的输入。补齐这些硬契约后，重构可以围绕同一条链路推进：Node Runtime UI Contract -> variable linker -> payload builder/filter -> variable pool -> debug snapshot/display，而不是在 UI、runtime、插件和 Data Model 节点里各自补过滤规则。

## 截止日期？

无固定截止日期；后续拆 implementation plan 前优先引用已补充后的 spec。

## 决策背后动机？

当前项目处于开发初期，用户更重视长期一致性和重构彻底性，允许破坏性 baseline、重种子和数据库 reset。后续实现应继续按 public-only outputs、RuntimeEventStream 非真值、debug snapshot 非真值、插件声明式 contract、Data Model side-effect matrix 的口径推进。
