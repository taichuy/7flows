---
memory_type: tool
topic: 并行跑 web test lint build 会触发前端 Vitest 大面积超时
summary: 在 `web/` 同时并行执行 `pnpm --dir web test`、`pnpm --dir web lint`、`pnpm --dir web/app build` 时，`@1flowbase/web` 的 Vitest 可能因资源争抢出现大量 timeout 假失败；应在重型前端验证里优先串行跑 `web test`。
keywords:
  - multi_tool_use
  - parallel
  - pnpm
  - web test
  - vitest
  - timeout
match_when:
  - 同一轮并行执行 `pnpm --dir web test` 和 `pnpm --dir web/app build`
  - `@1flowbase/web` 出现多文件大面积 `Test timed out`
  - 定向测试能过，但全量测试并行时突然成片超时
created_at: 2026-04-16 00
updated_at: 2026-04-16 00
last_verified_at: 2026-04-16 00
decision_policy: reference_on_failure
scope:
  - multi_tool_use
  - pnpm
  - web
---

# 时间

`2026-04-16 00`

## 失败现象

在同一轮里并行执行 `pnpm --dir web test`、`pnpm --dir web lint`、`pnpm --dir web/app build` 时，`@1flowbase/web` 的 Vitest 会出现大面积超时，涉及多个无关测试文件，不符合真实回归面。

## 触发条件

- 使用并行工具同时跑重型前端验证
- `web/app build` 与 `web test` 同时占用 CPU/内存

## 根因

这是本地验证资源争抢导致的假失败，不是单个业务改动引入的确定性回归。将 `web test` 单独串行重跑后可恢复正常结果。

## 解法

- 前端重型验证优先串行：先跑定向测试，再单独跑 `pnpm --dir web test`
- `lint` 与 `build` 可以放到 `web test` 之后再执行，避免和 Vitest 竞争资源

## 验证方式

- 先并行跑一次，记录大量 timeout
- 再单独执行 `pnpm --dir web test`，对比是否恢复稳定通过

## 复现记录

- `2026-04-16 00`：在修复 orchestration 保存回退问题时，并行执行 `web test/lint/build` 触发多套前端测试 timeout；随后单独重跑 `pnpm --dir web test`，30/30 文件、88/88 用例全部通过。
