---
memory_type: project
topic: 统一开发启动入口与默认端口
summary: 本地开发统一通过 node scripts/node/dev-up.js 启动，并固定前端 3100、后端 7800、plugin-runner 7801。
keywords:
  - dev-up
  - port
  - frontend
  - backend
  - plugin-runner
match_when:
  - 需要启动本地开发环境
  - 需要确认默认端口或监听地址
created_at: 2026-04-12 17
updated_at: 2026-04-12 17
last_verified_at: 2026-04-12 17
decision_policy: verify_before_decision
scope:
  - scripts/node/dev-up.js
  - README.md
  - api
  - web
---

# 统一开发启动入口与默认端口

## 时间

`2026-04-12 17`

## 谁在做什么

- 用户要求为 1Flowse 增加统一本地开发启动脚本。
- AI 负责实现统一入口、局部重启参数和文档说明。

## 为什么这样做

- 目前前端、后端、中间件需要分别进入不同目录启动，联调成本偏高。
- 用户希望保留全量启动能力，同时支持跳过 Docker、中断后只重启前端或后端。

## 为什么要做

- 先把本地开发入口统一，后续再扩展真实业务后端时可以直接复用。
- 统一默认端口后，接口查看地址和联调方式更稳定。

## 截止日期

- 未指定

## 决策背后动机

- 统一入口固定为 `node scripts/node/dev-up.js`。
- 端口不再通过脚本传参覆盖，而是直接修改项目默认启动端口。
- 默认端口约定为：前端 `3100`、主后端 `7800`；插件运行进程默认延用同段端口 `7801`。
- 前端、`api-server`、`plugin-runner` 默认监听地址改为 `0.0.0.0`，允许本机外访问。
- `dev-up` 状态探活仍使用 `127.0.0.1`，以保证本机探测稳定。
- 前端默认 API 地址不再写死 `127.0.0.1`，而是默认跟随当前浏览器主机名并固定端口 `7800`。
- Docker 中间件保持当前 compose 映射，不额外改端口。

## 关联文档

- `README.md`
- `.memory/reference-memory/script-reference.md`
- `scripts/node/dev-up.js`
