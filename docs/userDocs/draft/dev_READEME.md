# 架构选型

那边界就清楚了：外面继续用 `Ant`，里面不要“纯原生散写”，也不要再切一套新的主组件库。最适合你现在约束的是一层薄的 `Editor UI` 自封装。

3. `薄自封装 Editor UI`  
现象/结果：视觉能统一，画布细节也能控住，而且不需要做一整套大而全设计系统。  
好处：最适合你。对 GPT 也友好，因为以后不是让它到处拼 DOM，而是让它复用少量稳定组件。  
风险：前期要先抽一层壳，但范围控制住就不重。  
建议：选这个。

具体我建议这样落：

- 样式基础：只用现有的 `CSS Modules + CSS Variables`，不要再加新的样式框架。
- 组件策略：只封画布内最小必要集，不做全站基础库。
- 第一批组件建议就 8 到 12 个：
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
- 实现原则：
  - `NodeCard`、工具栏按钮、状态徽标、端口、选中框这些自己写。
  - 输入框、选择器、弹窗这类复杂交互，可以先包一层自己的 `EditorField`/`EditorDialog`，内部必要时再借 `Ant`，但对外暴露的是你自己的组件接口和样式 token。

这样做的结果是：

- 视觉上：节点、工具栏、侧栏、弹窗能像同一套产品。
- 工程上：不用从零造一整套 Mantine/Ant 替代品。
- AI 协作上：以后让 GPT 写前端，只需要说“用 `NodeCard + EditorPanelSection + InlineField` 组合”，一致性会高很多。

明确建议：`不要纯原生散写，不要再引新的样式框架，不要把 Ant 直接铺进画布核心节点。做一层薄的画布内自封装组件层。`





后端、插件运行边界和部署结构我建议直接定成这一套。

**后端分层**
- 形态：`Rust 模块化单体 + 独立 plugin-runner`
- Web 框架：`Axum`
- 异步：`Tokio`
- 中间件：`Tower` + `tower-http`
- 数据访问：`SQLx`
- 契约/OpenAPI：`utoipa`
- 日志与观测：`tracing` + `tracing-subscriber`
- 密码：`argon2`
- ID：`UUIDv7`

Rust workspace 结构：
- `apps/api-server`
  - 控制面 API
  - 发布入口 API
  - callback 接口
  - SSE 流式输出
  - 内置 worker pool / recovery loop / callback requeue
- `apps/plugin-runner`
  - 独立进程，统一承载代码插件
- `crates/domain`
  - 核心领域模型
- `crates/control-plane`
  - 团队、权限、应用、Flow、发布配置
- `crates/runtime-core`
  - Run 状态机、调度、checkpoint、恢复
- `crates/publish-gateway`
  - 原生/OpenAI/Claude 三类对外协议适配
- `crates/access-control`
  - 角色、权限点、范围校验
- `crates/plugin-framework`
  - manifest/schema、注册、安装、分配、调用抽象
- `crates/storage-pg`
- `crates/storage-redis`
- `crates/storage-object`
- `crates/observability`

**数据分层**
- 编辑态：`Authoring Document`
- 编译态：`Compiled Plan`
- 发布态：`Published Contract`
- 运行态：`Flow Run / Node Run / Checkpoint / Callback Task`
- 历史与调试：`Event Log`

存储职责不变：
- `PostgreSQL`：事实来源，元数据、版本、运行状态主表、checkpoint、事件索引
- `Redis`：控制台 session、限流、热缓存、运行协调、临时锁
- `RustFS`：文件、大 JSON、大文本、导出物、调试产物

**认证与安全落点**
- 控制台：`服务端 Session + HttpOnly Cookie + CSRF`
- 发布接口：`API Key / Token`
- 前端 401 统一跳转/刷新逻辑保留，但不在浏览器存登录凭证
- `plugin-runner` 不对公网暴露，只跑内网，主系统通过内网地址 + 固定密钥访问，参考 Dify 的 `X-Api-Key` 边界

**API 契约**
- 控制面：`REST JSON`
- 运行调试：`REST + SSE`
- 插件内部调用：`本机 RPC/内网 HTTP`
- 前后端契约来源：后端 OpenAPI 生成，前端生成 TS client
- 不做 GraphQL，不做公网 WebSocket 主链路

接口层分 4 类：
- `/api/console/*`
  - 登录、团队、权限、应用、Flow、发布配置
- `/api/runtime/*`
  - run 查询、调试、checkpoint、回调处理
- `/api/publish/*`
  - 内部发布管理动作
- `/v1/*` `/openai/*` `/claude/*`
  - 对外发布协议入口

**插件边界**
P1 先定成“宿主渲染 UI + 独立代码插件运行”：

- 不做前端代码插件
- 只做多语言 UI 契约：
  - `manifest`
  - `config_schema`
  - `secret_schema`
  - `io_schema`
  - `locales`
- 控制台用 `Ant Design` 按 schema 渲染插件配置 UI
- 代码插件先只支持 `runner_wasm`
- 声明式插件走 `hosted`

插件开发/运行两条路径都要预留：
- `debug register`
  - 插件本地独立跑起来，再向宿主注册调试连接
- `install package`
  - 标准包安装，校验、解包、激活、分配到团队/应用

插件包建议固定为：
- `manifest.yaml`
- `schemas/*.json`
- `locales/*.json`
- `assets/*`
- `README.md`
- `dist/plugin.wasm`

以后如果要扩：
- 可新增 `serverless` runtime
- 可新增远程 runner
- 可新增前端扩展点
但 P1 不实现，只保留字段和生命周期槽位

**部署结构**
P1 Docker Compose 先这样：
- `web`
  - Vite 构建后的静态资源
- `api-server`
  - Rust 主服务
- `plugin-runner`
  - 独立插件进程
- `postgres`
- `redis`
- `rustfs`
- `nginx`
  - 生产反向代理，统一入口

流量路径：
- 控制台：`browser -> nginx -> web/api-server`
- 发布请求：`client -> nginx -> api-server`
- 插件调用：`api-server -> plugin-runner`
- 存储访问：`api-server/plugin-runner -> postgres/redis/rustfs`

# 目录结构：

仓库目录建议收敛为：

- `web/`
  - `app/`
    - 平台主前端
    - 控制台壳层
    - 应用工作区
    - 编排画布入口
    - `src/embedded`
      - Embedded App 宿主页、挂载页、错误页、加载态
    - `src/features/embedded-apps`
      - 控制台中的 Embedded App 管理界面
  - `packages/ui`
    - 通用 UI 组件
  - `packages/flow-schema`
    - Flow 节点与连线的前端结构定义
  - `packages/page-protocol`
    - AI 友好的页面结构协议定义
  - `packages/page-runtime`
    - 动态页面渲染运行时
  - `packages/api-client`
    - 基于后端 OpenAPI 生成的 TS client
  - `packages/embed-sdk`
    - 嵌入式前端接入 SDK
  - `packages/embedded-contracts`
    - Embedded App manifest / 元数据契约
  - `packages/shared-types`
    - 前后端共享轻类型

- `api/`
  - `apps/api-server`
    - 控制面 API
    - 发布入口 API
    - callback 接口
    - SSE 流式输出
    - 内置 worker pool / recovery loop / callback requeue
  - `apps/plugin-runner`
    - 独立插件进程
    - 统一承载 `runner_wasm` 代码插件
  - `crates/domain`
    - 核心领域模型
  - `crates/control-plane`
    - 团队、权限、应用、Flow、发布配置
  - `crates/runtime-core`
    - Run 状态机、调度、checkpoint、恢复
  - `crates/publish-gateway`
    - 原生 / OpenAI / Claude 对外协议适配
  - `crates/access-control`
    - 角色、权限点、范围校验
  - `crates/plugin-framework`
    - manifest/schema、注册、安装、分配、调用抽象
  - `crates/storage-pg`
  - `crates/storage-redis`
  - `crates/storage-object`
  - `crates/observability`
  - `apps/api-server/src/routes/embedded`
    - Embedded App 上传、发布、路由解析
  - `apps/api-server/src/routes/assets`
    - 静态资源分发与回退入口
  - `crates/embedded-runtime`
    - 上传包入口识别、挂载解析、回退规则

`Embedded App` 的 P1 主线固定为：用户独立开发前端子系统，产出静态 build zip 上传到平台；平台负责挂载路由、复用登录态、分发静态资源，不支持前端源码插件，也不支持 SSR / Node runtime 托管。
