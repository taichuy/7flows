# 运行历史摘要

- 2026-04-10 11:56-18:57 CST：P1 主线已收敛为工作流、运行时、发布优先；确认 `agentFlow`、应用级 `root` + 空间角色并集鉴权、`Publish` 才生效、运行时状态机主表 + 事件日志、发布网关薄代理、状态与记忆显式读写。
- 2026-04-10 20:03-21:24 CST：确认插件双轨、共享 `plugin-runner`、Docker Compose 单机部署、前端只覆盖登录后控制台/编辑器/调试/API 文档，不做匿名站和多人实时协同。
- 2026-04-10 21:34-23:14 CST：前端技术栈锁定为 `React + Vite + TanStack Router + Ant Design + CSS Modules/CSS Variables + TanStack Query + Zustand + xyflow + Lexical + Monaco`；不使用 `Tailwind`；画布外继续 `Ant`，画布内不纯原生散写，改为薄 `Editor UI` 自封装。
- 2026-04-10 23:31-23:55 CST：后端正式收敛为 `Rust 模块化单体 api-server + 独立 plugin-runner`；P1 不拆 `runtime-worker`；控制台鉴权正式采用 `服务端 Session + HttpOnly Cookie + CSRF`；`api-server -> plugin-runner` 定义为内部 `RPC` 契约，P1 初版可承载在内网 HTTP；代码插件官方支持语言先锁 `Rust`。
- 2026-04-11 00:01-00:14 CST：已把上述统一口径回写到 `product-design` 与 `p1-architecture`，并清理“进程内插件”等旧表述。
- 2026-04-11 00:27-00:30 CST：复核 `docs/superpowers` 后确认无新的结构性冲突；补充插件宿主通信安全口径为“内部 `RPC` + 可承载内网 HTTP + 固定服务密钥保护（如 `X-Api-Key`）”；新增统一摘要文档 `docs/superpowers/specs/1flowse/2026-04-11-p1-tech-stack-communication-baseline.md`。

# 下一步计划

- 以后讨论技术栈、部署、插件边界时，优先引用新的“P1 技术栈与通信口径基线”文档。
- 若继续推进实现，先基于这份口径把前端 `Editor UI`、后端 workspace、OpenAPI client 生成和 `plugin-runner` 内部 RPC 接口拆成实施计划。
