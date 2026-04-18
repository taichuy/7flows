---
memory_type: tool
topic: pnpm 离线或受限环境补依赖时可能先破坏 node_modules
summary: 在 `web`、`tmp/mock-ui` 这类同构 workspace 上执行 `pnpm install`（尤其 `--offline --force`，或无网络下补 direct dependency）可能先重建/清空 `node_modules`，随后因 lock 或 tarball 缺失失败；已验证的恢复方式是从同构 sibling workspace 复制根、app 与受影响 package 的 `node_modules`，再继续验证。
keywords:
  - pnpm
  - offline
  - install
  - node_modules
  - force
  - workspace
match_when:
  - 需要在离线环境给 workspace 补依赖
  - `pnpm install --offline --force` 报 `ERR_PNPM_NO_OFFLINE_TARBALL`
  - 无网络环境下为 workspace 新增 direct dependency
created_at: 2026-04-13 09
updated_at: 2026-04-13 12
last_verified_at: 2026-04-13 12
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

在 `tmp/mock-ui` 或 `web` 执行 `pnpm install --offline --force`，或在无网络环境下直接 `pnpm install --no-frozen-lockfile` 补 direct dependency 时，`pnpm` 可能先重建 `node_modules`，随后因缺少离线 tarball、lock 不一致或镜像不可访问失败。

典型报错包括：

```text
ERR_PNPM_NO_OFFLINE_TARBALL
ERR_PNPM_OUTDATED_LOCKFILE
GET https://registry.npmmirror.com/... error (EPERM)
```

并导致对应 workspace 的根 `node_modules` 被重建后不完整，进而让 `app` 或 `packages/*` 的依赖解析连续失败。

## 触发条件

- workspace 依赖树较大
- 使用 `--offline --force`
- lock 与 `package.json` 不一致
- 当前会话没有外网
- 本地 pnpm store 不完整

## 根因

`pnpm --force` 会先移除并重建依赖目录；而在 lock 不一致或无网络时，即便不带 `--offline`，`pnpm install` 也可能在补 direct dependency 过程中先改坏 workspace 的依赖入口，再因为 tarball 或 registry 不可达失败，留下不完整的 `node_modules`。

## 解法

1. 避免在这类 workspace 上直接跑全量 `pnpm install --offline --force`。
2. 若已失败且存在同构 sibling workspace（如 `web/` 与 `tmp/mock-ui/`），优先复制：
   - sibling 根 `node_modules -> 当前 workspace/node_modules`
   - sibling `app/node_modules -> 当前 workspace/app/node_modules`
   - 所有受影响 package（如 `packages/ui`）的 `node_modules` 也一并复制
3. 如果只是新增 direct import，优先手工补顶层包入口或补 lock/importer，而不是重跑全量安装。

## 验证方式

恢复 `node_modules` 后，目标 workspace 的关键验证命令应重新通过；本次已验证：
- `web/app` 的 `pnpm test -- src/app/_tests/router.test.tsx src/app/App.test.tsx`
- `web/app` 的 `pnpm build`

## 复现记录

- `2026-04-13 09`：为 `@ant-design/icons` 补 direct dependency 时误用 `pnpm install --offline --force`，导致 `tmp/mock-ui/node_modules` 被清空后失败；通过复制 `web` 的依赖目录并手工补包入口恢复成功。
- `2026-04-13 12`：为 `web/app` 补 `@ant-design/icons` 时，先遇到 `pnpm install --filter @1flowbase/web` 的交互式重装提示；改用 `CI=1 pnpm install --force` 后又先触发 `ERR_PNPM_OUTDATED_LOCKFILE`，继续改用 `--no-frozen-lockfile` 则因镜像 `EPERM` 无法下载并把 `web/node_modules` 重建为空。最终通过复制 `tmp/mock-ui` 的根、`app` 与 `packages/*` 的 `node_modules` 恢复，再完成测试与构建验证。
