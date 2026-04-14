---
memory_type: tool
topic: dev-up 后端重启会因本地 .env 仍使用 BOOTSTRAP_TEAM_NAME 而失败
summary: 运行 `node scripts/node/dev-up.js restart --backend-only --skip-docker` 时，`api-server` 预启动的 `reset_root_password` 会直接报 `missing env BOOTSTRAP_WORKSPACE_NAME`；已验证的解法是把本地 `api/apps/api-server/.env` 或当前 shell 环境改为 `BOOTSTRAP_WORKSPACE_NAME`。
keywords:
  - node
  - dev-up
  - api-server
  - BOOTSTRAP_WORKSPACE_NAME
  - reset_root_password
match_when:
  - 运行 `node scripts/node/dev-up.js start|restart --backend-only --skip-docker`
  - 日志出现 `missing env BOOTSTRAP_WORKSPACE_NAME`
  - `api-server 开发态重置 root 密码` 预启动步骤失败
created_at: 2026-04-14 18
updated_at: 2026-04-14 18
last_verified_at: 2026-04-14 18
decision_policy: reference_on_failure
scope:
  - node
  - scripts/node/dev-up.js
  - api/apps/api-server/.env
  - api/apps/api-server/.env.example
---

# dev-up 后端重启会因本地 .env 仍使用 BOOTSTRAP_TEAM_NAME 而失败

## 时间

`2026-04-14 18`

## 失败现象

执行 `node scripts/node/dev-up.js restart --backend-only --skip-docker` 后，`api-server` 没有起来，日志停在：

- `api-server 执行预启动步骤：api-server 开发态重置 root 密码`
- `Error: missing env BOOTSTRAP_WORKSPACE_NAME`

## 触发条件

- 后端工作区重命名后，代码已经只读取 `BOOTSTRAP_WORKSPACE_NAME`
- 本地 `api/apps/api-server/.env` 仍保留旧字段 `BOOTSTRAP_TEAM_NAME`
- `dev-up` 在开发态会先跑 `cargo run -p api-server --bin reset_root_password`

## 根因

`reset_root_password` 和 `api-server` 启动配置都走新的 `ApiConfig`，该配置不再接受 `BOOTSTRAP_TEAM_NAME`。如果本地 `.env` 还没跟进字段重命名，`dev-up` 的预启动步骤会先于主进程直接失败。

## 解法

- 把本地 `api/apps/api-server/.env` 中的 `BOOTSTRAP_TEAM_NAME` 改成 `BOOTSTRAP_WORKSPACE_NAME`
- 或者在执行 `dev-up` 前显式导出 `BOOTSTRAP_WORKSPACE_NAME`
- 同时保持仓库里的 `.env.example` / `.env.production.example` 也使用新字段，避免新机器继续复制出旧配置

## 验证方式

- 运行 `node --test scripts/node/dev-up/_tests/core.test.js`
- 检查 `api/apps/api-server/.env.example` 与 `.env.production.example` 都只包含 `BOOTSTRAP_WORKSPACE_NAME`

## 复现记录

- `2026-04-14 18`：为人工浏览器验收刷新本地 `api-server` 时命中该错误；已通过更新示例 env 文件和新增 `dev-up` 测试断言固定规避方式。
