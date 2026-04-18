---
memory_type: tool
topic: web 全量 Vitest 被既有 me-page 超时阻塞
summary: `pnpm --dir web test` 可能因为 `src/features/me/_tests/me-page.test.tsx` 的 `/me/profile` 用例 5 秒超时失败，和当前 agent-flow 改动无关时要单独说明。
keywords:
  - vitest
  - pnpm
  - web test
  - me-page
  - timeout
match_when:
  - 运行 `pnpm --dir web test`
  - 失败栈指向 `src/features/me/_tests/me-page.test.tsx`
  - 错误是 `keeps profile update flow working on /me/profile` 超时
created_at: 2026-04-15 23
updated_at: 2026-04-15 23
last_verified_at: 无
decision_policy: reference_on_failure
scope:
  - vitest
  - web
---

# 时间

`2026-04-15 23`

## 失败现象

运行 `pnpm --dir web test` 时，全量测试会被 `src/features/me/_tests/me-page.test.tsx` 的 `keeps profile update flow working on /me/profile` 用例卡住并在 5 秒后超时失败。

## 触发条件

- 在仓库根目录执行 `pnpm --dir web test`
- `@1flowbase/web` 包开始跑完整 `vitest --run`

## 根因

这是仓库内现存的 `/me/profile` 测试稳定性问题，不是本次 agent-flow 保存逻辑改动引入。当前失败信息只显示用例超时，没有指向本次修改文件。

## 解法

- 先补跑与当前改动直接相关的定向测试，确认目标回归已经修复
- 汇报时明确写出全量测试失败来自既有 `me-page` 超时，避免误判为本次回归
- 如果后续要处理该问题，再单独进入 `me-page` 测试链路做专项排查

## 验证方式

- `pnpm --dir web test`
- 观察失败是否仍然落在 `src/features/me/_tests/me-page.test.tsx:96`

## 复现记录

- `2026-04-15 23`：在 agent-flow 保存视口修复后执行 `pnpm --dir web test`，其余 85 个测试通过，只有 `MePage > keeps profile update flow working on /me/profile` 超时失败。
