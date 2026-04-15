---
memory_type: tool
topic: brainstorm 本地预览地址在 Codex 中可能很快失效
summary: 在 Codex 环境中通过 `start-server.sh` 启动 brainstorm 预览服务时，脚本返回的 `localhost` 地址可能很快失效；已验证的稳定做法是在持续 PTY 会话里直接运行 `server.cjs`，再用浏览器确认新端口可达后再给用户。
keywords:
  - brainstorm
  - localhost
  - stale-port
  - codex
  - preview
match_when:
  - 使用 brainstorming visual companion
  - `start-server.sh` 返回 URL 后用户访问被拒绝
  - 需要在 Codex 中启动本地 HTML 预览服务
created_at: 2026-04-15 12
updated_at: 2026-04-15 12
last_verified_at: 2026-04-15 12
decision_policy: reference_on_failure
scope:
  - shell
  - /home/taichu/.codex/superpowers/skills/brainstorming/scripts/start-server.sh
---

# brainstorm 本地预览地址在 Codex 中可能很快失效

## 时间

`2026-04-15 12`

## 失败现象

- `start-server.sh --project-dir <repo>` 返回了 `server-started` JSON 和 `localhost:<port>`。
- 用户立刻访问该地址时提示“访问拒绝”。
- 随后在当前环境中对该端口做连通性检查，也无法连接。

## 触发条件

- 在 Codex 环境下使用 brainstorming visual companion。
- 通过 `start-server.sh` 启动服务，并直接把脚本返回的端口发给用户。

## 根因

- 结合脚本与 `server.cjs` 行为判断：该脚本在 `CODEX_CI=1` 下会走前台模式，并把 server 生命周期绑定到当前工具会话的 owner PID。
- 工具会话结束后，server 可能随之退出，导致先前返回的端口很快失效。
- 旧的 `server-info` 仍可能残留，使人误以为服务还在。

## 解法

- 不直接相信 `start-server.sh` 首次返回的地址。
- 优先在一个持续存在的 PTY 会话中直接运行：
  - `env BRAINSTORM_DIR=<dir> BRAINSTORM_HOST=127.0.0.1 BRAINSTORM_URL_HOST=localhost BRAINSTORM_OWNER_PID=1 node /home/taichu/.codex/superpowers/skills/brainstorming/scripts/server.cjs`
- 写入新 screen 后，用浏览器或其他外部上下文再次确认 `http://localhost:<new-port>` 可达，再把地址发给用户。

## 验证方式

- 持续 PTY 会话启动后，浏览器上下文可成功打开 `http://localhost:63274/`。
- 同一页面在推送新 HTML 后可正常 reload 并显示内容。

## 复现记录

- `2026-04-15 12`：`start-server.sh` 返回 `http://localhost:59094`，用户访问失败；改为持续 PTY 直接运行 `server.cjs` 后，新地址 `http://localhost:63274` 可访问。
