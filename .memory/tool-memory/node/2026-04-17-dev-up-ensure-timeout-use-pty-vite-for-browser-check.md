---
memory_type: tool
topic: dev-up ensure 前端启动超时且 web.log 含旧 ready 记录时，浏览器验收改用前台 PTY vite
summary: 执行 `node scripts/node/dev-up.js ensure --frontend-only --skip-docker` 可能报 frontend 启动超时，但 `tmp/logs/web.log` 里仍保留历史 `VITE ready` 记录，容易误判当前 3100 已可用。已验证可复用解法是提权开启单独 PTY 会话运行 `pnpm --dir web/app dev -- --host 127.0.0.1 --port 3100`，在该会话存活期间执行 Playwright/浏览器验收，完成后再手动停掉。
keywords:
  - node
  - dev-up
  - vite
  - playwright
  - 3100
  - timeout
match_when:
  - `node scripts/node/dev-up.js ensure --frontend-only --skip-docker` 报 frontend 启动超时
  - `tmp/logs/web.log` 看起来像已启动但浏览器访问 `127.0.0.1:3100` 仍然拒绝连接
  - 需要继续做本地页面截图、Playwright 或人工浏览器验收
created_at: 2026-04-17 01
updated_at: 2026-04-17 01
last_verified_at: 2026-04-17 01
decision_policy: reference_on_failure
scope:
  - node
  - scripts/node/dev-up.js
  - web/app
  - playwright
---

# dev-up ensure 前端启动超时且 web.log 含旧 ready 记录时，浏览器验收改用前台 PTY vite

## 时间

`2026-04-17 01`

## 失败现象

执行：

```bash
node scripts/node/dev-up.js ensure --frontend-only --skip-docker
```

返回：

```text
[1flowbase-dev-up] frontend 启动超时，请查看日志：.../tmp/logs/web.log
```

但 `tmp/logs/web.log` 里同时还能看到旧的：

```text
VITE v6.4.2 ready ...
```

随后直接用 Playwright 打开 `http://127.0.0.1:3100/...` 仍报 `ERR_CONNECTION_REFUSED`。

## 为什么当时要这么做

- 需要完成 `agentflow node detail panel revision` 的桌面/窄视口浏览器验收与截图。
- 这一步依赖本地前端稳定监听 `3100` 端口。

## 为什么失败

- `web.log` 是追加日志，旧的 `VITE ready` 记录不能证明当前实例仍在监听。
- `dev-up ensure` 这次没有把前端稳定拉起，导致端口实际上没有服务。

## 已验证解法

1. 不再只看 `web.log` 的历史 ready 文本判断前端是否可用。
2. 提权开启一个单独 PTY 会话运行：

```bash
pnpm --dir web/app dev -- --host 127.0.0.1 --port 3100
```

3. 保持该会话存活期间执行 Playwright 或浏览器验收。
4. 验收完成后再手动停止这个 PTY 会话。

## 验证方式

- `pnpm --dir web/app dev -- --host 127.0.0.1 --port 3100` 在 PTY 中成功输出 `VITE ready`
- 随后 Playwright 成功访问 `http://127.0.0.1:3100/style-boundary.html?scene=page.application-detail`
- 桌面断言拿到 `agent-flow-editor-splitter / 节点详情 / 运行摘要`
- 窄视口断言拿到 `请使用桌面端编辑`

## 后续避免建议

- `dev-up ensure` 报前端启动超时时，不要被 `web.log` 里的旧 ready 文本误导。
- 需要继续做浏览器验收时，优先显式检查端口是否真在监听；若没有，就直接起一个前台 PTY `vite` 会话。
- 该 PTY 会话只用于验收，结束后及时关闭，避免遗留占用影响后续 `style-boundary` 或 dev server 启动。
