---
memory_type: tool
topic: 用 pnpm package script 验证内层工具参数时，双横线参数会继续透传给脚本命令
summary: 需要验证 `turbo` 或 `vitest` 的命令行选项时，不要用 `pnpm <script> -- ...` 方式；在当前仓库中，这会把参数继续透传给脚本命令本体，而不是只作用于外层验证动作，可能误触发真实任务或留下挂起进程。更稳的做法是直接用 `pnpm exec <tool> ...` 验证底层命令。
keywords:
  - pnpm
  - script
  - double-dash
  - turbo
  - vitest
  - dry-run
  - help
  - pass-through
match_when:
  - 想验证 package script 里的 `turbo` 选项是否生效
  - 想执行 `pnpm --dir web test -- --dry-run=text`
  - 想执行 `pnpm --dir web/app test -- --help`
  - 想确认 package script 对底层 CLI 的参数解析
created_at: 2026-04-17 23
updated_at: 2026-04-17 23
last_verified_at: 2026-04-17 23
decision_policy: reference_on_failure
scope:
  - pnpm
  - web
  - web/app
  - turbo
  - vitest
---

# 用 pnpm package script 验证内层工具参数时，双横线参数会继续透传给脚本命令

## 时间

`2026-04-17 23`

## 为什么做这个操作

- 需要验证本轮新增的前端测试限流脚本是否生效，同时避免真的跑起整套前端测试。

## 失败现象

- 执行 `pnpm --dir web test -- --dry-run=text` 时，输出变成：

```text
turbo run test --concurrency=50% -- --dry-run=text
```

- 结果 `--dry-run=text` 被继续透传到内层任务，不是仅对外层 `turbo run` 做 dry-run 验证。
- 执行 `pnpm --dir web/app test -- --help` 时，也不是单纯查看帮助，而是留下了一个挂起的 `pnpm` / `vitest` 进程，需要手动 `kill` 清掉。

## 触发条件

- 通过 `pnpm <package-script> -- ...` 给 package script 追加验证参数；
- 目标 script 本身又是 `turbo`、`vitest` 这类会进一步解析参数的命令。

## 根因

- `pnpm run` 的 `--` 语义是“把后续参数传给脚本命令”，不是“只给外层验证动作使用”。
- 当脚本本身还会继续处理参数时，就会出现验证参数下沉到错误层级的问题。

## 解法

- 需要验证底层工具参数时，直接用 `pnpm exec` 调目标工具，不要绕 package script：

```bash
pnpm --dir web exec turbo run test --concurrency=50% --dry-run=text
pnpm --dir web/app exec vitest run --maxWorkers=50% --minWorkers=1 --help
```

- 如果已经误触发脚本验证并留下后台进程，直接查 PID 后 `kill`。

## 验证方式

- `2026-04-17 23` 已验证：
  - `pnpm --dir web test -- --dry-run=text` 会把 `--dry-run=text` 继续下沉到脚本命令层；
  - 改用 `pnpm --dir web exec turbo run test --concurrency=50% --dry-run=text` 后，可以稳定拿到纯 dry-run 结果；
  - `pnpm --dir web/app test -- --help` 留下挂起进程；
  - 改用 `pnpm --dir web/app exec vitest run --maxWorkers=50% --minWorkers=1 --help` 后，可直接验证参数被接受。

## 后续避免建议

- 以后凡是“我要验证脚本里的某个 CLI 选项是否生效”，优先直跑底层工具，不要先走 package script。

