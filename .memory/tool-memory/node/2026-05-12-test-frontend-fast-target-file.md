---
memory_type: tool
topic: test-frontend fast 不适合追加单文件 Vitest 参数
summary: `node scripts/node/test-frontend.js fast -- --run <file>` 已验证会启动 web/app fast 批量测试且不收敛到目标文件；定向文件应走 `pnpm --dir web/app test -- <file>`。
keywords:
  - node
  - test-frontend
  - vitest
  - web/app
  - targeted-test
match_when:
  - 需要只跑一个或少量 `web/app` Vitest 文件
  - 想给 `scripts/node/test-frontend.js fast` 追加 `--run <file>` 参数
  - 前端测试命令长时间无输出且实际启动了 fast 批量测试
created_at: 2026-05-12 22
updated_at: 2026-05-12 22
last_verified_at: 2026-05-12 22
decision_policy: reference_on_failure
scope:
  - scripts/node/test-frontend.js
  - web/app/package.json
---

# test-frontend fast 单文件参数跑偏

## 时间

`2026-05-12 22`

## 失败现象

执行：

```bash
node scripts/node/test-frontend.js fast -- --run web/app/src/features/agent-flow/_tests/debug-console/debug-composer.test.tsx
```

实际启动了 `pnpm --dir web/app test` 的 fast 批量测试，没有把目标文件参数透传到最终 Vitest 范围，命令长时间无输出。

## 已验证解法

定向跑 `web/app` 单个或少量 Vitest 文件时使用：

```bash
pnpm --dir web/app test -- src/features/agent-flow/_tests/debug-console/debug-composer.test.tsx
```

该命令已验证只运行目标文件。

## 适用场景

- 需要 TDD 红绿灯验证单个前端测试文件。
- 不需要跑 `test-frontend.js fast` 管理的整批 fast 测试。
