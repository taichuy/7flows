---
memory_type: tool
topic: pnpm offline force install 可能清空 node_modules 后失败
summary: 在 `tmp/mock-ui` 这类 workspace 上执行 `pnpm install --offline --force` 会先重建 `node_modules`，如果本地 store 缺 tarball 会在清空后失败；已验证的恢复方式是从同构 sibling workspace 复制 `node_modules`，并仅手工补需要的 direct package 入口。
keywords:
  - pnpm
  - offline
  - node_modules
  - force
  - workspace
match_when:
  - 需要在离线环境给 workspace 补依赖
  - `pnpm install --offline --force` 报 `ERR_PNPM_NO_OFFLINE_TARBALL`
created_at: 2026-04-13 09
updated_at: 2026-04-13 09
last_verified_at: 2026-04-13 09
decision_policy: reference_on_failure
scope:
  - pnpm
  - tmp/mock-ui
  - node_modules
---

# pnpm offline force install 可能清空 node_modules 后失败

## 时间

`2026-04-13 09`

## 失败现象

在 `tmp/mock-ui` 执行 `pnpm install --offline --force` 时，`pnpm` 先重建 `node_modules`，随后因缺少离线 tarball 报：

```text
ERR_PNPM_NO_OFFLINE_TARBALL
```

并导致 `tmp/mock-ui/node_modules` 基本被清空。

## 触发条件

- workspace 依赖树较大
- 使用 `--offline --force`
- 本地 pnpm store 不完整

## 根因

`pnpm --force` 会先移除并重建依赖目录；离线模式下如果任一包不在本地 store，就会在重建过程中失败，留下不完整的 `node_modules`。

## 解法

1. 避免在这类 workspace 上直接跑全量 `pnpm install --offline --force`。
2. 若已失败且存在同构 sibling workspace（如 `web/` 与 `tmp/mock-ui/`），优先复制：
   - `web/node_modules -> tmp/mock-ui/node_modules`
   - `web/app/node_modules -> tmp/mock-ui/app/node_modules`
   - 对应 package 的 `node_modules` 也一并复制
3. 如果只是新增 direct import，优先手工补顶层包入口或补 lock/importer，而不是重跑全量安装。

## 验证方式

恢复 `node_modules` 后，`tmp/mock-ui/app` 的 `pnpm test -- src/app/App.test.tsx` 与 `pnpm build` 都重新通过。

## 复现记录

- `2026-04-13 09`：为 `@ant-design/icons` 补 direct dependency 时误用 `pnpm install --offline --force`，导致 `tmp/mock-ui/node_modules` 被清空后失败；通过复制 `web` 的依赖目录并手工补包入口恢复成功。
