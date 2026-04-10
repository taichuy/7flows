# 2026-04-11 全栈初始化设计确认

- 时间：2026-04-11 06:33-06:36 CST
- 用户确认按“骨架优先 + 架构占位”方案执行。
- 前端初始化边界确认：`pnpm workspace + Turbo + apps/web + 全部 packages/* 占位`。
- 后端初始化边界确认：`api-server + plugin-runner + 全部 crates/* 占位`。
- 版本锁定确认：`Node 22`、`pnpm 10`、`Rust stable`。
- 前端质量基线确认：`Vitest + React Testing Library + ESLint + Prettier`。
- 后端质量基线确认：`cargo fmt + clippy + cargo test`。
- OpenAPI 确认第一天接入：`api-server` 需提供 `openapi.json` 和可查看文档页，初始化完成后需把本地查看链接发给用户校验。
- 项目专用 skill 确认放到仓库内 `.agent/skills/`，绑定 1Flowse 当前目录与技术栈约定。
