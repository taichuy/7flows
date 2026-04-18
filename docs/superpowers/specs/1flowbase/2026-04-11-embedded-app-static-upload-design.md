# 1flowbase Embedded App 静态产物上传设计稿

日期：2026-04-11
状态：已完成初稿，待用户审阅
关联文档：
- [2026-04-10-product-design.md](./2026-04-10-product-design.md)
- [2026-04-10-product-requirements.md](./2026-04-10-product-requirements.md)
- [2026-04-10-p1-architecture.md](./2026-04-10-p1-architecture.md)
- [2026-04-11-p1-tech-stack-communication-baseline.md](./2026-04-11-p1-tech-stack-communication-baseline.md)

## 1. 设计目标

本文档用于收敛 `Embedded App` 在 P1 的最小落地方案，目标不是支持任意前端扩展形态，而是先支持一种稳定、容易治理、对平台侵入最小的接入方式：

`用户上传已构建的静态前端产物 zip，平台为其分配路由入口，并复用平台登录态。`

该方案用于承接以下场景：

- 用户希望独立维护自己的业务前端子系统
- 用户不希望修改 1flowbase 主仓源码
- 用户只需要复用平台既有登录态、权限上下文与现有 API
- 平台只负责托管、挂载与访问治理，不负责接管用户前端的源码构建链路

## 2. P1 结论

P1 正式采用以下边界：

- 接入方式：`静态 build zip 上传`
- 集成深度：`路由 + 登录态复用`
- 平台职责：`上传、存储、挂载、路由分发、登录态透传、错误回退`
- 用户职责：`自行开发前端子系统，并产出可托管静态资源`

P1 明确不做：

- 不做前端源码插件
- 不让用户把源码直接放进 `web/packages/*` 参与主仓构建
- 不支持 SSR / Node runtime 托管
- 不支持前端代码热插拔执行
- 不承诺兼容任意构建工具的任意输出结构

## 3. 接入模型

`Embedded App` 在 P1 中是平台页面体系中的一种特殊页面来源。

平台保留三层前端模型：

- 平台主前端：承载工作台、控制台、编排、日志、监控等内建能力
- 页面结构协议：承载平台默认的 AI 友好动态页面
- `Embedded App`：承载用户独立维护的复杂业务前端

`Embedded App` 的职责边界是：

- 复用平台登录态
- 使用平台开放的 API 与数据模型能力
- 通过平台分配的路由前缀访问
- 在视觉、路由、构建方式上允许与平台主前端解耦

## 4. 上传产物约束

P1 上传物统一采用 `zip`。

平台采用“宽松识别，失败报错”策略：

- 允许用户上传少量主流前端 build 产物
- 平台尝试自动识别入口目录
- 若无法识别为可托管静态站点，则上传或发布失败并返回明确错误

P1 首批接受的目录模式可收敛为：

- 根目录存在 `index.html`
- `dist/index.html`
- `build/index.html`
- `out/index.html`

P1 先不接受：

- 仅包含 `tsx/ts/jsx/js` 源码而无构建产物的压缩包
- 依赖运行中 Node 服务的产物
- 依赖 SSR、Server Actions、运行期 Next server 的产物

说明：`Next.js` 只有在最终导出为纯静态产物时，才属于本方案支持范围。

## 5. 路由与登录态

P1 采用“平台分配挂载路由”的思路，不要求用户修改主仓路由表。

推荐挂载模型：

- 平台控制台中配置一个 `Embedded App`
- 该对象归属于 `Team / Application`
- 平台为其分配稳定访问入口
- 用户访问该入口时，由平台先完成登录态校验，再分发静态资源

P1 先采用固定前缀的内部实现思路，例如：

- `/embedded/{embeddedAppId}/`
- `/embedded/{embeddedAppId}/*`

对用户显示层，可以在应用导航中映射为业务友好的菜单名称；是否允许用户自定义短路径，放到后续版本再评估。

登录态复用边界固定为：

- 平台仍使用 `Session + HttpOnly Cookie + CSRF`
- `Embedded App` 运行在平台统一受控域名与路由空间下
- 用户子系统不自行保存平台登录凭证
- 子系统通过同源请求调用平台开放 API

P1 不要求平台主动把复杂用户对象注入到前端全局变量；优先通过同源接口与轻量 SDK 获取当前登录上下文。

## 6. 目录规划

### 6.1 前端目录

```text
web/
├── app/
│   ├── src/
│   │   ├── app-shell/              # 平台主壳层
│   │   ├── routes/                 # 平台业务路由
│   │   ├── embedded/               # Embedded App 宿主页
│   │   │   ├── pages/              # 挂载页，例如 /embedded/:appId/*
│   │   │   ├── components/         # 宿主容器、错误页、加载态
│   │   │   └── utils/              # 路由拼接、登录态桥接、manifest 解析
│   │   └── features/
│   │       └── embedded-apps/      # 控制台中的 Embedded App 管理
│   └── public/
│       └── embedded-runtime/       # 少量前端运行时辅助资源（如需要）
│
├── packages/
│   ├── ui/                         # 平台通用 UI
│   ├── api-client/                 # OpenAPI 生成客户端
│   ├── shared-types/               # 共享类型
│   ├── embed-sdk/                  # 外部子系统可复用的前端 SDK
│   └── embedded-contracts/         # Embedded App manifest / 元数据契约
│
└── uploads/                        # 仅开发期可选；生产不作为正式存储
```

### 6.2 后端目录

```text
api/
├── apps/
│   ├── api-server/
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── console/        # 控制台管理接口
│   │       │   ├── embedded/       # Embedded App 上传、发布、路由解析
│   │       │   └── assets/         # 静态资源分发与回退入口
│   │       └── ...
│   └── plugin-runner/              # 保持不变
│
├── crates/
│   ├── domain/
│   │   └── embedded_app/           # Embedded App 领域模型
│   ├── control-plane/              # 应用、权限、配置
│   ├── access-control/             # Embedded App 访问控制
│   ├── storage-object/             # zip 与静态文件存储
│   ├── observability/              # 上传、发布、访问日志
│   └── embedded-runtime/           # 挂载解析、入口识别、回退规则
```

### 6.3 存储逻辑结构

```text
embedded-apps/
└── {teamId}/
    └── {applicationId}/
        └── {embeddedAppId}/
            ├── versions/
            │   └── {version}/
            │       ├── source.zip
            │       ├── manifest.json
            │       └── dist/...
            └── current -> versions/{version}
```

## 7. 平台与用户系统的职责划分

平台负责：

- 管理 `Embedded App` 元数据
- 校验上传包与入口目录
- 存储版本与当前激活版本
- 为其分配访问入口
- 在访问前完成登录态与权限校验
- 提供统一错误页、找不到入口页、未登录回退逻辑

用户负责：

- 自行维护业务前端源码仓库
- 自行完成打包构建
- 保证产物满足平台支持的静态目录约束
- 基于平台开放 API 实现业务能力
- 处理自身前端内部路由、页面逻辑与 UI 方案

## 8. P1 风险与约束

该方案虽然轻，但有几个明确约束：

- 用户前端若使用子路径路由，需兼容平台挂载前缀
- 构建产物中的静态资源基路径必须与挂载方式兼容
- 上传包识别策略若过宽，错误体验会偏差；若过严，会降低兼容性
- 不同前端框架的 build 输出可能差异较大，P1 只能先覆盖少量主流模式

因此 P1 的原则是：

- 先支持“静态 build zip 上传”这一条主线
- 先把失败报错做清楚，而不是追求兼容所有框架
- 先让用户能独立维护子系统并挂进平台，再考虑更深的 SDK 与自动适配

## 9. 当前设计结论

`Embedded App` 在 P1 最合适的落地方向，不是前端源码插件，也不是 SSR 托管，而是“用户自维护子系统前端 -> 产出静态 build zip -> 平台上传托管 -> 路由挂载 -> 登录态复用 -> 同源调用平台 API”。

这个方案的价值在于：

- 对主仓侵入低
- 对用户开发方式限制少
- 对平台安全边界更容易治理
- 能与既有 `Session + Cookie` 认证与应用路由体系自然衔接

后续若继续推进，再围绕以下主题拆分实现计划：

- 上传包识别与发布流程
- 挂载路由与前端宿主页
- 登录态桥接与轻量 SDK
- 静态资源分发与刷新回退规则
