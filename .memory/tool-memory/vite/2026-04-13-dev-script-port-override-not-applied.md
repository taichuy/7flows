---
memory_type: tool
topic: pnpm filter 调用 vite dev 脚本时端口覆盖参数可能不会生效
summary: 从 monorepo 根执行 `pnpm --filter @1flowse/web dev -- --host 0.0.0.0 --port 4173` 时，参数会被原样传给脚本中的 `vite`，最终仍命中应用默认端口配置并报端口占用；改用 `pnpm --filter @1flowse/web exec vite --host 0.0.0.0 --port 4173` 可正常启动。
keywords:
  - vite
  - pnpm
  - dev
  - port
  - tmp/mock-ui
match_when:
  - 需要从 monorepo 根为 `@1flowse/web` 启动 vite dev server
  - 希望临时覆盖默认端口
  - 看到 `Port 3210 is already in use`
created_at: 2026-04-13 08
updated_at: 2026-04-13 08
last_verified_at: 2026-04-13 08
decision_policy: reference_on_failure
scope:
  - vite
  - pnpm
  - tmp/mock-ui
  - @1flowse/web
---

# pnpm filter 调用 vite dev 脚本时端口覆盖参数可能不会生效

## 时间

`2026-04-13 08`

## 失败现象

执行：

```bash
pnpm --filter @1flowse/web dev -- --host 0.0.0.0 --port 4173
```

输出里实际变成：

```text
vite "--" "--host" "0.0.0.0" "--port" "4173"
```

随后仍报：

```text
Port 3210 is already in use
```

## 触发条件

- 在 monorepo 根目录通过 `pnpm --filter` 调用包内 `dev` 脚本
- 该脚本本身已经写成 `vite`
- 想临时覆盖默认端口

## 根因

参数透传到了脚本层，但没有按预期覆盖应用内部使用的默认端口；最终仍命中 `vite.config` 或现有默认端口配置。

## 解法

- 不走包脚本，直接执行二进制：

```bash
pnpm --filter @1flowse/web exec vite --host 0.0.0.0 --port 4173
```

- 验证通过后再使用输出的 `Local` 或 `Network` URL 访问页面

## 复现记录

- `2026-04-13 08`：为 `tmp/mock-ui` 启动浅底主题预览时，`pnpm --filter @1flowse/web dev -- --host 0.0.0.0 --port 4173` 仍然报 `Port 3210 is already in use`；改用 `pnpm --filter @1flowse/web exec vite --host 0.0.0.0 --port 4173` 后成功启动在 `http://localhost:4173/`。
