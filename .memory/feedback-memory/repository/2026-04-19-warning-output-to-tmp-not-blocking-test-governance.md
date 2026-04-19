---
memory_type: feedback
feedback_category: repository
topic: 测试与治理讨论中的 warning 不作为当前阻塞项并统一输出到 tmp
summary: 当仓库处于测试分层、后端一致性或状态机治理阶段时，用户明确要求不要把现有 warning 清理作为当前阻塞项；warning 只需保留输出并统一落到 `tmp/` 供后续查看，而不是为了过会立即治理。
keywords:
  - warning
  - tmp
  - test
  - governance
  - backend
  - quality-gate
match_when:
  - 需要讨论 warning 是否阻塞当前治理推进
  - 需要制定测试门禁与 warning 处理策略
  - 需要决定 warning 的输出位置
created_at: 2026-04-19 18
updated_at: 2026-04-19 18
last_verified_at: 2026-04-19 18
decision_policy: direct_reference
scope:
  - web
  - api
  - scripts
  - tmp
---

# 测试与治理讨论中的 warning 不作为当前阻塞项并统一输出到 tmp

## 时间

`2026-04-19 18`

## 规则

- 在测试分层、后端一致性和状态机治理讨论中，现有 warning 不作为当前阻塞项。
- warning 需要保留输出，但统一写入 `tmp/` 供后续查看，不要求当前轮立即清理。
- 不要把“先清 warning”当成推进治理方案或讨论结论的前置条件。

## 原因

- 当前主线目标是先建立稳定的测试分层和后端状态机治理框架，而不是被既有 warning 噪音拖住。
- warning 仍然有价值，但应降级为待观察证据，而不是本轮的阻塞红灯。

## 适用场景

- 讨论 PR/full gate 是否应因 warning 停止推进
- 规划测试分层和后端一致性治理方案
- 设计本地验证输出落点与后续整理方式
