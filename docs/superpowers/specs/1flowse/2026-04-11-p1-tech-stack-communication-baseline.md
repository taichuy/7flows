# 1Flowse P1 技术栈与通信口径基线

日期：2026-04-11
状态：已确认，可作为后续讨论与实现的统一表述
关联文档：
- [2026-04-10-product-design.md](./2026-04-10-product-design.md)
- [2026-04-10-p1-architecture.md](./2026-04-10-p1-architecture.md)

## 1. 文档目标

本文档用于把 P1 已确认的技术选型、通信边界与对内对外表述收成一套短口径，避免后续在架构讨论、实现计划和 AI 协作中反复出现旧说法。

## 2. 一句话总口径

`1Flowse P1 采用 pnpm monorepo 前端 + Ant 外壳与薄 Editor UI 画布层 + Rust 模块化单体 api-server + 独立 plugin-runner + PostgreSQL / Redis / RustFS 分层存储 + REST / SSE / 内部 RPC 三类通信边界。`

## 3. 前端口径

正式技术栈：
- `React + Vite`
- `TanStack Router`
- `Ant Design`
- `CSS Modules + CSS Variables`
- `TanStack Query`
- `Zustand`
- `xyflow`
- `Lexical`
- `Monaco`

正式约束：
- 画布外继续使用 `Ant Design`
- 画布内不做“纯原生散写”
- 不再引入新的主组件库
- 不再引入新的样式框架
- 画布内增加一层薄的 `Editor UI` 自封装

第一批 `Editor UI` 组件：
- `EditorSurface`
- `EditorToolbar`
- `EditorIconButton`
- `EditorPanelSection`
- `EditorBadge`
- `NodeCard`
- `NodePort`
- `InlineField`
- `EditorMenu`
- `EditorPopover`

实现原则：
- `NodeCard`、工具栏按钮、状态徽标、端口、选中框等核心视觉元素自行实现
- 输入框、选择器、弹窗等复杂交互允许通过 `EditorField`、`EditorDialog` 等壳组件适度复用 `Ant Design`

## 4. 后端口径

正式形态：
- `Rust 模块化单体 + 独立 plugin-runner`

正式技术栈：
- `Axum`
- `Tokio`
- `Tower + tower-http`
- `SQLx`
- `utoipa`
- `tracing + tracing-subscriber`
- `argon2`
- `UUIDv7`

Rust workspace 基线：
- `apps/api-server`
- `apps/plugin-runner`
- `crates/domain`
- `crates/control-plane`
- `crates/runtime-core`
- `crates/publish-gateway`
- `crates/access-control`
- `crates/plugin-framework`
- `crates/storage-pg`
- `crates/storage-redis`
- `crates/storage-object`
- `crates/observability`

补充边界：
- P1 不拆独立 `runtime-worker`
- `runtime-core` 在代码层保持可拆分边界
- 对外主业务入口始终是 `api-server`

## 5. 数据与安全口径

数据分层：
- 编辑态：`Authoring Document`
- 编译态：`Compiled Plan`
- 发布态：`Published Contract`
- 运行态：`Flow Run / Node Run / Checkpoint / Callback Task`
- 历史与调试：`Event Log`

存储职责：
- `PostgreSQL`：事实来源、元数据、版本、运行状态主表、checkpoint、事件索引
- `Redis`：session、限流、热缓存、运行协调、临时锁
- `RustFS`：文件、大 JSON、大文本、导出物、调试产物

认证与安全：
- 控制台：`服务端 Session + HttpOnly Cookie + CSRF`
- 发布接口：`API Key / Token`
- 浏览器不持久化前端可读登录凭证
- `plugin-runner` 不对公网暴露

## 6. 通信口径

接口与协议分层：
- `/api/console/*`：控制面 `REST JSON`
- `/api/runtime/*`：运行调试 `REST + SSE`
- `/api/publish/*`：内部发布管理动作
- `/v1/*`、`/openai/*`、`/claude/*`：对外发布协议入口

前后端契约来源：
- 后端 `OpenAPI`
- 前端基于 `OpenAPI` 生成 TS client

插件宿主通信：
- 契约层正式定义为内部 `RPC`
- P1 初版可承载在内网 HTTP
- 若采用内网 HTTP，则服务间使用固定密钥保护，例如 `X-Api-Key`
- 固定密钥只用于内部边界保护，不改变其 `RPC` 契约本质

明确不做：
- 不做 `GraphQL`
- 不做公网 `WebSocket` 主链路

## 7. 插件口径

P1 正式边界：
- 不做前端代码插件
- 宿主渲染插件配置 UI
- 插件 UI 契约先收敛为：`manifest`、`config_schema`、`secret_schema`、`io_schema`、`locales`
- 控制台先用 `Ant Design` 按 schema 渲染插件配置 UI

运行模式：
- `hosted`
- `runner_wasm`

开发与安装路径：
- `debug register`
- `install package`

插件包结构：
- `manifest.yaml`
- `schemas/*.json`
- `locales/*.json`
- `assets/*`
- `README.md`
- `dist/plugin.wasm`

代码插件边界：
- P1 官方支持语言先锁 `Rust`
- 标准交付物为 `Wasm`
- 未来可预留 `serverless runtime`、远程 runner、前端扩展点，但 P1 不实现

## 8. 部署口径

P1 Docker Compose 基线：
- `web`
- `api-server`
- `plugin-runner`
- `postgres`
- `redis`
- `rustfs`
- `nginx`

流量路径：
- 控制台：`browser -> nginx -> web/api-server`
- 发布请求：`client -> nginx -> api-server`
- 插件调用：`api-server -> plugin-runner`
- 存储访问：`api-server/plugin-runner -> postgres/redis/rustfs`

## 9. 对外统一表述模板

短版：

`P1 前端继续用 Ant 做控制台壳层，画布内部加一层薄的 Editor UI 自封装；后端采用 Rust 模块化单体 api-server，并通过独立 plugin-runner 承载 Wasm 代码插件；控制面走 REST，运行调试走 REST + SSE，插件宿主走内部 RPC。`

完整版：

`1Flowse P1 不走“纯原生散写画布”，也不再引入新的主组件库。前端基于 React + Vite + Ant Design + CSS Modules/CSS Variables + xyflow/Lexical/Monaco，画布内统一收敛到薄 Editor UI 组件层。后端采用 Axum/Tokio/SQLx/utoipa/tracing 的 Rust 模块化单体，对外主入口是 api-server，内部通过独立 plugin-runner 承载 runner_wasm 代码插件。数据层以 PostgreSQL 为事实来源，Redis 负责热态协调，RustFS 承接大对象。控制台鉴权采用服务端 Session + HttpOnly Cookie + CSRF，发布接口采用 API Key / Token；协议分层为控制面 REST、运行调试 REST + SSE、插件宿主内部 RPC，P1 初版内部 RPC 可承载在内网 HTTP 并叠加固定服务密钥保护。`
