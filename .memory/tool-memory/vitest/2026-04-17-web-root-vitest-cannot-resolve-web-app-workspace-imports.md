---
memory_type: tool
topic: 从 web 根目录直接跑 web/app 单测时可能无法解析 web/app 的 workspace 依赖
summary: 在仓库根执行 `pnpm --dir web exec vitest run app/src/...` 时，`vitest` 以 `web/` 为包根，`@1flowbase/flow-schema` 这类仅在 `web/app` 声明的 workspace 依赖会解析失败；已验证应切到 `web/app` 再执行 `pnpm exec vitest run src/...`。
keywords:
  - vitest
  - workspace
  - web
  - web/app
  - flow-schema
match_when:
  - 需要跑 `web/app` 的单个或少量 Vitest 文件
  - 从 `web/` 根目录执行 `pnpm --dir web exec vitest run app/src/...`
  - 看到 `Failed to resolve entry for package "@1flowbase/flow-schema"` 一类报错
created_at: 2026-04-17 12
updated_at: 2026-04-17 12
last_verified_at: 2026-04-17 12
decision_policy: reference_on_failure
scope:
  - vitest
  - pnpm
  - web
  - web/app
---

# 从 web 根目录直接跑 web/app 单测时可能无法解析 web/app 的 workspace 依赖

## 时间

`2026-04-17 12`

## 失败现象

执行：

```bash
pnpm --dir web exec vitest run app/src/features/agent-flow/_tests/node-detail-panel.test.tsx
```

报错：

```text
Failed to resolve entry for package "@1flowbase/flow-schema"
```

## 触发条件

- 目标测试文件位于 `web/app/src/...`
- 命令从仓库根通过 `pnpm --dir web exec vitest run app/src/...` 发起
- 测试依赖 `@1flowbase/flow-schema`、`@1flowbase/api-client` 等只在 `web/app/package.json` 声明的 workspace 包

## 根因

`vitest` 实际以 `web/` 作为当前包根运行，而不是 `web/app`。  
`web/package.json` 本身不声明 `@1flowbase/flow-schema`，所以 Vite 的 import analysis 在解析 `web/app` 测试文件时会直接失败。

## 已验证解法

切到 `web/app` 包根再跑：

```bash
cd web/app
pnpm exec vitest run src/features/agent-flow/_tests/node-detail-panel.test.tsx
```

如果需要多文件聚焦验证，也保持在 `web/app` 下执行 `pnpm exec vitest run src/... src/...`。

## 后续避免建议

- 跑 `web/app` 单测时，把 `workdir` 固定到 `web/app`
- `web/` 根目录更适合执行 `pnpm test` / `pnpm lint` / `pnpm build` 这类 workspace 级命令
- 一旦看到 workspace 包解析失败，先检查当前命令是否站在了错误的包根上

## 复现记录

- `2026-04-17 12`：为 agent-flow detail panel 改动跑聚焦单测时，先在 `web/` 根执行 `pnpm --dir web exec vitest run app/src/...`，命中 `@1flowbase/flow-schema` 解析失败；切到 `web/app` 改用 `pnpm exec vitest run src/...` 后恢复正常。
- `2026-04-17 23`：为 node detail tabs 布局修正做聚焦验证时，再次在 `web/` 根执行 `pnpm --dir web exec vitest run app/src/features/agent-flow/_tests/node-detail-panel.test.tsx`，同样报 `Failed to resolve entry for package "@1flowbase/flow-schema"`；确认该问题稳定复现，继续保持在 `web/app` 包根执行单文件测试。
