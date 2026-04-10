# 运行历史摘要

- 2026-04-10 11:56-18:57 CST：P1 主线收敛为工作流、运行时、发布优先；已确认应用级 `root` + 空间角色、权限并集鉴权、工作台最小概览、`agentFlow` 命名、仅 `Publish` 生效、运行时状态机主表 + 事件日志、发布网关控制面入口 + 薄代理、状态与记忆显式读写 + 快照注入。
- 2026-04-10 19:32-19:36 CST：协作偏好补充。实现可先整体铺开再按验证修复；讨论需写清现象/结果、收益/风险和明确建议；结束时仅提交本次相关文件。
- 2026-04-10 20:03-20:55 CST：`08 插件体系` 定稿并进入实施计划。确认双轨插件模型、四类插件、统一包结构、来源分级、共享 `plugin-runner`、本机 RPC、状态机生命周期、升级回滚、禁止插件间硬依赖；首份计划为 `docs/superpowers/plans/2026-04-10-plugin-framework-foundation.md`。
- 2026-04-10 21:13-21:24 CST：部署与前端边界确认。P1 先按 `单机/单区域 + Docker Compose`；前端控制台优先，仅覆盖登录后后台、工作台、`agentFlow` 编辑器、调试页、发布文档页；不做匿名公开站，也不做多人实时协同。
- 2026-04-10 21:34-22:03 CST：技术栈基线确认。通信采用 `REST + SSE`；鉴权参考 `Dify Cookie Token(access/refresh/csrf)`；对象存储用 `RustFS`；仓库采用 `单仓 Monorepo`；前端暂定 `React + Vite + TanStack Router + Ant Design + CSS Modules/CSS Variables + TanStack Query + Zustand + xyflow + Lexical + Monaco`；不使用 `Tailwind`；插件主线参考 `Dify` 三段式，但 P1 不做自定义前端插件。
- 2026-04-10 22:30-23:03 CST：补做 `Ant Design / Mantine / xyflow` 源码对比。结论：`Mantine` 的 `CSS Modules + Styles API` 更贴合编辑器微调；`Ant Design` 的后台能力面更强；`xyflow` 画布内节点/连线主要由业务自定义 DOM 与 CSS 控制，组件库影响集中在画布外壳与面板。当前建议维持“画布外 `Ant Design`，画布内自定义 UI + `CSS Modules/CSS Variables` + `xyflow`”，暂不直接切主库到 `Mantine`。
- 2026-04-10 23:14 CST：补充前端统一性偏好。用户希望节点、工具栏、侧栏、弹窗尽量使用同一套视觉语言与交互语法；同时因主流 GPT 工具不擅长前端细节，方案应尽量减少纯手搓 UI 负担，避免走“全部原生零基建”路线。
- 2026-04-10 23:31 CST：后端部署基线修正。P1 暂不启用独立 `runtime-worker`，统一收敛为“单体 Rust 模块化后端 + 进程内运行时调度”；运行时继续保留逻辑分层，但不单独部署。
- 2026-04-10 23:47 CST：复核“后端分层、插件运行边界、部署结构”与现有文档。确认大方向兼容：`单体 Rust api-server + 独立 plugin-runner + REST/SSE + PostgreSQL/Redis/RustFS + Docker Compose`。当前待统一的冲突集中在：控制台鉴权仍有“`Dify Cookie Token` vs `服务端 Session`”残留；正式架构稿尚未把 `plugin-runner` 写入总体部署与 workspace；插件运行通道存在“固定本机 RPC”与“内网 HTTP/固定密钥”两种表述；代码插件语言边界存在“`Rust + Wasm`”与“仅要求 `runner_wasm` 包产物”两种口径。
- 2026-04-10 23:55 CST：统一上述冲突口径。控制台鉴权正式采用 `服务端 Session + HttpOnly Cookie + CSRF`，`Dify Cookie Token` 仅保留为安全参考；后端对外仍是一个主入口 `api-server`，但后端体系内部包含独立 `plugin-runner` Rust 进程；`api-server -> plugin-runner` 正式定义为“内部 RPC 契约”，初版传输可承载在内网 HTTP；P1 代码插件运行模式保持 `runner_wasm`，官方支持语言先锁 `Rust`。

# 下一步计划

- 先统一控制台鉴权、`plugin-runner` 通信方式、代码插件语言边界三项口径，再回写正式技术架构稿。
- 下一步把正式架构稿中的总体部署、workspace 结构与插件运行边界全部按统一口径回写。
