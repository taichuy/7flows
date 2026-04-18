---
memory_type: tool
topic: tmp/demo 不要直接把 ../../web/packages/* 纳入 workspace 运行 turbo
summary: 在 `tmp/demo` 中把 `pnpm-workspace.yaml` 改成包含 `../../web/packages/*` 后，`pnpm --dir tmp/demo test` 会让 `@1flowbase/web` 同时加载 `tmp/demo/app/node_modules` 与 `web/node_modules` 的 React/Ant Design 依赖树，进而触发 `Invalid hook call`；已验证的稳定方案是保留本地 workspace，只在 `vite.config.ts` 里把源码 alias 到 `web/packages/*/src`，并把 `react / react-dom / antd` 精确钉到 `tmp/demo/app/node_modules`。
keywords:
  - pnpm-workspace
  - turbo
  - react duplication
  - invalid hook call
  - tmp/demo
  - web/packages
match_when:
  - 想让 `tmp/demo` 直接把 `web/packages/*` 作为 workspace 包运行
  - `pnpm --dir tmp/demo test` 在 `@1flowbase/web` 中报 `Invalid hook call`
  - `@1flowbase/ui` 已切到主仓库源码，但 demo 测试或构建出现双 React 症状
created_at: 2026-04-14 05
updated_at: 2026-04-14 05
last_verified_at: 2026-04-14 05
decision_policy: reference_on_failure
scope:
  - tmp/demo/pnpm-workspace.yaml
  - tmp/demo/app/vite.config.ts
  - web/packages/ui
  - pnpm
  - turbo
---

# tmp/demo 不要直接把 ../../web/packages/* 纳入 workspace 运行 turbo

## 时间

`2026-04-14 05`

## 失败现象

在 `tmp/demo/pnpm-workspace.yaml` 中把 workspace 改成：

```yaml
packages:
  - app
  - ../../web/packages/*
```

随后执行：

```bash
pnpm --dir tmp/demo test
```

会出现：

- `Unable to calculate transitive closures: Workspace '../../web/packages/ui' not found in lockfile`
- `@1flowbase/web` 测试内大量 `Invalid hook call`
- 栈里可见 `../../../web/node_modules/.pnpm/react...` 和 `../../../web/node_modules/.pnpm/antd...`

## 为什么会失败

- `tmp/demo` 与 `web/` 分别拥有自己的依赖树。
- 一旦把 `web/packages/*` 直接纳入 `tmp/demo` 的 workspace，`@1flowbase/web` 在运行时会把来自 `web/node_modules` 的 `antd` 和 `react` 一起带进来。
- 对 React UI 来说，这相当于同一应用里混入两棵 React 依赖树，于是 `ConfigProvider` 等组件会触发 `Invalid hook call`。
- 同时，外部 workspace 不在 `tmp/demo` 的 lockfile 里，`turbo` 会失去稳定的 transitive closure 计算。

## 已验证解法

1. 保持 `tmp/demo/pnpm-workspace.yaml` 仍只包含本地：

```yaml
packages:
  - app
  - packages/*
```

2. 在 `tmp/demo/app/vite.config.ts` 中，把业务源码 alias 到主仓库：

- `../../../web/packages/ui/src/index.tsx`
- `../../../web/packages/api-client/src/index.ts`
- 其他需要的 `web/packages/*/src`

3. 同时把运行依赖精确钉到 demo 自己的依赖树：

- `react`
- `react-dom`
- `antd`
- `@ant-design/icons`

4. 配合 `resolve.dedupe = ['react', 'react-dom']`

验证结果：

- `pnpm --dir tmp/demo/app test` 通过
- `pnpm --dir tmp/demo/app build` 通过
- `pnpm --dir tmp/demo test` 通过
- `pnpm --dir tmp/demo build` 通过

## 后续避免建议

- 想让 `tmp/demo` 跟随主仓库最新 UI 包时，优先走“源码 alias 到 `web/packages/*/src`”，不要先把整个 `web/packages/*` 拉进 workspace。
- 只要跨目录复用 `React` 组件源码，就默认检查它最终落在哪一棵 `node_modules` 上，避免双 React。
- 若后续一定要做跨根 workspace，同步前先确认 lockfile、依赖树和 `react / antd` 解析策略，不要直接在 `turbo test` 上试错。
