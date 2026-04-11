# 脚本相关引用

## 常见脚本与命令入口

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
