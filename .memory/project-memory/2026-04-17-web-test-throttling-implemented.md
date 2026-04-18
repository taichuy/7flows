---
memory_type: project
topic: web 前端全量测试默认限流到系统 50% 资源已落地
summary: 用户在 `2026-04-17 23` 明确要求先做前端测试限流，并且直接固化到脚本里，不再依赖命令行临时追加参数；当前 `pnpm --dir web test` 已固定为 `turbo run test --concurrency=50%`，`pnpm --dir web/app test` 已固定为 `vitest --run --maxWorkers=50% --minWorkers=1`。
keywords:
  - web
  - frontend
  - test
  - turbo
  - vitest
  - throttling
  - 50%
  - resource
match_when:
  - 需要确认 `web` 前端测试是否已经默认限流
  - 需要判断为什么 `pnpm --dir web test` 比之前更慢但更稳
  - 需要继续调整前端测试资源占用或拆分测试脚本
created_at: 2026-04-17 23
updated_at: 2026-04-17 23
last_verified_at: 2026-04-17 23
decision_policy: verify_before_decision
scope:
  - web/package.json
  - web/app/package.json
---

# web 前端全量测试默认限流到系统 50% 资源已落地

## 时间

`2026-04-17 23`

## 谁在做什么

- 用户明确要求先处理前端全量测试容易打满机器资源的问题。
- AI 按用户决策把限流直接写入 `web` 根脚本和 `web/app` 的测试脚本。

## 为什么这样做

- 当前 `pnpm --dir web test` 实际是 `turbo run test`，并且 `test` 任务还会触发依赖包 `build`，资源峰值高。
- `web/app` 本身有较多 `jsdom + React + antd + React Flow` 集成测试，默认 worker 并发容易放大内存和 CPU 峰值。
- 用户明确要求“不用每次手动加参数”，而是让默认命令本身具备限流能力。

## 为什么要做

- 降低本地执行 `pnpm --dir web test` 时的卡死、假超时和整机不可用风险。
- 保持团队日常仍使用原来的测试入口，不引入新的记忆负担。

## 截止日期

- 无

## 决策背后动机

- 根层限流放在 `turbo`，用于压住 workspace 任务级并发。
- 应用层限流放在 `vitest`，用于压住 `web/app` 内部测试 worker 并发。
- 本轮只做最小必要调整，不改 `turbo` 的任务依赖图，不拆新脚本名，不改变现有测试入口。

## 当前结果

- `web/package.json`：
  - `test` 已改为 `turbo run test --concurrency=50%`
- `web/app/package.json`：
  - `test` 已改为 `vitest --run --maxWorkers=50% --minWorkers=1`

## 验证方式

- `2026-04-17 23` 已验证：
  - 直跑 `pnpm --dir web exec turbo run test --concurrency=50% --dry-run=text`，输出中的 `@1flowbase/web#test` 命令已经变为 `vitest --run --maxWorkers=50% --minWorkers=1`
  - 直跑 `pnpm --dir web/app exec vitest run --maxWorkers=50% --minWorkers=1 --help`，参数可被当前 Vitest 版本正常接受

