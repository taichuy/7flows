---
memory_type: project
topic: agentflow-runtime-contract-spec-supplemented
summary: Agent Flow 变量链接器与运行态契约 spec 已补入持久化/snapshot 隔离、变量展示身份、RuntimeEventStream replay、debug offload、plugin contribution v2 版本锁定、Data Model write 同 run replay idempotency/side-effect receipt 和 object-level 变量缓存展示规则。
keywords:
  - agentflow
  - runtime contract
  - variable linker
  - debug snapshot
  - RuntimeEventStream
  - stream replay
  - debug offload
  - plugin contribution v2
  - plugin version pinning
  - data model side effect
  - data model idempotency
created_at: 2026-05-07 23
updated_at: 2026-05-08 23
last_verified_at: 2026-05-08 23
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

用户要求把 2026-05-07 对 Agent Flow 变量链接器与运行态契约设计文档的审计意见补充进 spec。AI 已将补充写入目标文档；当前只是本地文档更新，未提交或推送。

## 为什么这样做？

原 spec 已经确定 public-only outputs 的主方向，但持久化真值源、debug snapshot key/失效、RuntimeEventStream 与 LLM streaming、plugin contribution v2、Data Model 写入副作用和变量缓存 object-level 展示还不够硬。2026-05-07 的二次更新进一步补入：workspace/actor/debug session snapshot 隔离、`node.alias/key` 展示身份、stream `event_id/sequence` replay、offload/truncation/full-load API、plugin identity/hash/output schema snapshot、unknown output key 拒绝、Data Model idempotency key 和 side-effect receipt。用户随后确认 Data Model write idempotency 目标是防同一 `run_id` 内 checkpoint/replay 重复写，不承担跨 debug run 的业务级去重。2026-05-08 进一步确认：当前节点解析后的 `input_payload` 不能进变量缓存，但必须持久化在 node run trace，用于调试、审计、回放和 full-load。同日进一步确认：节点变量缓存必须保存完整 `node_run.output_payload` JSON，不按 public output key 投影裁剪；节点预览消费绑定时再按 output key / selector 从完整 JSON 中抽取需要字段。

## 为什么要做？

这份 spec 将作为后续 implementation plan 的输入。补齐这些硬契约后，重构可以围绕同一条链路推进：Node Runtime UI Contract -> variable linker -> payload builder/filter -> variable pool -> debug snapshot/display -> stream replay/offload/plugin/Data Model side-effect，而不是在 UI、runtime、插件和 Data Model 节点里各自补过滤规则。

## 截止日期？

无固定截止日期；后续拆 implementation plan 前优先引用已补充后的 spec。

## 决策背后动机？

当前项目处于开发初期，用户更重视长期一致性和重构彻底性，允许破坏性 baseline、重种子和数据库 reset。后续实现应继续按 public-only outputs、RuntimeEventStream 非真值、debug snapshot 非真值、input_payload 可审计但非变量、变量缓存保存完整 node output JSON、插件声明式 contract/版本锁定、Data Model side-effect matrix、同 run replay idempotency、offload 不反推变量字段的口径推进。
