# 2026-04-11 P1 技术栈与通信口径基线

- 时间：2026-04-11 00:27-00:30 CST
- 结论：复核 `docs/superpowers` 后，当前正式规格已与用户最新方案大体一致，不存在新的结构性冲突。
- 唯一需要收口的残留差异在插件宿主通信表述：部分模块文档仍写“本机 RPC”，现统一为“内部 RPC 契约”；P1 初版可承载在内网 HTTP，若采用该传输方式，则叠加固定服务密钥保护，例如 `X-Api-Key`。
- 前端统一口径确认：控制台外壳继续使用 `Ant Design`，画布内不走纯原生散写，也不再引入新主组件库，而是增加一层薄的 `Editor UI` 自封装。
- 后端统一口径确认：采用 `Rust 模块化单体 api-server + 独立 plugin-runner`；P1 不拆独立 `runtime-worker`，但 `runtime-core` 在代码层保持可拆边界。
- 插件统一口径确认：P1 不做前端代码插件，宿主按 schema 渲染配置 UI；代码插件仅保留 `runner_wasm` 运行模式，官方支持语言先锁 `Rust`。
- 已新增统一摘要文档：`docs/superpowers/specs/1flowse/2026-04-11-p1-tech-stack-communication-baseline.md`，后续可作为技术栈、架构沟通和 AI 协作时的优先引用口径。
