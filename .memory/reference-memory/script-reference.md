---
memory_type: reference
topic: 脚本相关引用
summary: 记录统一开发启动脚本、前后端启动命令和中间件命令入口，供需要执行脚本时快速定位。
keywords:
  - scripts
  - dev-up
  - pnpm
  - cargo
  - docker
match_when:
  - 需要查找本地开发命令入口
  - 需要确认前后端或中间件启动方式
created_at: 2026-04-12 19
updated_at: 2026-04-12 19
last_verified_at: 无
decision_policy: index_only
scope:
  - scripts/node/dev-up.js
  - web
  - api
  - docker
---

# 脚本相关引用

## 常见脚本与命令入口

- `node scripts/node/dev-up.js`
  - 统一启动前端、后端与默认中间件入口。
- `node scripts/node/dev-up.js --skip-docker`
  - 跳过 Docker 中间件，仅启动本地前后端进程。
- `node scripts/node/dev-up.js restart --frontend-only`
  - 仅重启前端。
- `node scripts/node/dev-up.js restart --backend-only`
  - 仅重启后端。
- `cd web && pnpm dev`
  - 前端本地开发入口。
- `cd web && pnpm lint && pnpm test && pnpm build`
  - 前端验证命令。
- `cd api && cargo run -p api-server`
  - 后端主服务启动入口。
- `cd api && cargo run -p plugin-runner`
  - 插件运行进程启动入口。
- `docker compose -f docker/docker-compose.middleware.yaml up -d`
  - 本地中间件启动入口。

## 使用说明

- 这里只记录脚本/命令入口，不记录具体问题排查过程。
- 若后续出现固定的自动化脚本路径，可继续补充到本文件。
