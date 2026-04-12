# 1Flowse 全栈初始化与项目专用 Skill 设计稿

日期：2026-04-11
状态：已完成设计，待用户审阅
关联文档：
- [2026-04-10-p1-architecture.md](./2026-04-10-p1-architecture.md)
- [2026-04-11-p1-tech-stack-communication-baseline.md](./2026-04-11-p1-tech-stack-communication-baseline.md)

## 1. 文档目标

本文档用于收敛 1Flowse 第一轮工程初始化方案，明确：

- 如何建立一个可直接启动的前端 `pnpm monorepo`
- 如何建立一个可直接编译与启动的 Rust workspace
- 如何把质量基线、版本锁定和本地开发命令一起固定下来
- 如何在仓库内 `.agent/skills/` 中沉淀一个项目专用 skill，供后续 agent 复用

本轮目标是“结构正确、命令可跑、验证闭环存在”，而不是一次实现业务功能。

## 2. 范围与非目标

### 2.1 本轮范围

本轮初始化包含两部分：

1. 前后端最小可跑骨架
2. 仓库内项目专用 skill

前端范围：

- 建立 `pnpm workspace`
- 引入 `Turbo`
- 建立 `apps/web`
- 建立全部约定 `packages/*` 目录并放入最小占位实现
- 接入 `Vite + React + TypeScript + TanStack Router + Ant Design + TanStack Query + Zustand`
- 接入 `Vitest + React Testing Library + ESLint + Prettier`

后端范围：

- 建立 Rust workspace
- 建立 `apps/api-server`
- 建立 `apps/plugin-runner`
- 建立全部约定 `crates/*` 目录并放入最小占位实现
- 接入 `Axum + Tokio + Tower + SQLx + utoipa + tracing`
- 接入 `cargo fmt + clippy + cargo test`

文档与协作范围：

- 在仓库内 `.agent/skills/` 新建项目专用 skill
- 把本轮决策同步到 `.memory/history` 与 `runtime-foundation.md`

### 2.2 本轮非目标

本轮明确不做：

- 登录、鉴权、会话实现
- 数据库迁移与真实表结构
- Flow 编辑器真实业务能力
- `Editor UI` 组件真正落地
- `plugin-runner` 真实插件加载协议
- OpenAPI 到 TS client 的真实生成脚本
- Docker 化前后端开发流程

## 3. 设计原则

- `最终结构先定死`：目录与包边界一次按正式架构落地，避免后续二次搬家。
- `实现只做最小可跑`：每个 package/crate 只放最小编译与最小运行代码，不提前填业务。
- `版本先锁定`：Node、pnpm、Rust 入口统一锁定，减少环境漂移。
- `质量基线即刻生效`：测试、lint、format 在第一天就能执行。
- `OpenAPI 先接入`：哪怕接口极少，也先把 JSON 与查看页跑通。
- `项目经验沉淀成 skill`：后续 agent 不再重复猜测目录、技术栈和命令。

## 4. 前端设计

### 4.1 目录结构

前端采用 `pnpm workspace + Turbo`，目录固定为：

- `apps/web`
- `packages/ui`
- `packages/flow-schema`
- `packages/page-protocol`
- `packages/page-runtime`
- `packages/api-client`
- `packages/embed-sdk`
- `packages/shared-types`

其中：

- `apps/web` 提供唯一可运行前端入口
- `packages/ui` 先提供最小共享导出，不在本轮实现 `Editor UI`
- 其余 `packages/*` 只提供最小类型、入口文件与 workspace 连通性

### 4.2 运行能力

`apps/web` 至少提供：

- 一个首页路由
- 一个 `agentFlow` 占位路由
- 一个基础 `App Shell`
- 一个请求后端 health 接口的最小示例

结果要求：

- `pnpm dev` 可启动
- 浏览器打开后可看到基础首页
- Router、Query、Ant、Zustand 已接入但不过度展开

### 4.3 版本与质量基线

前端固定：

- `Node 22`
- `packageManager: pnpm@10`
- 根级 `pnpm-workspace.yaml`
- 根级 `turbo.json`
- `Vitest + React Testing Library`
- `ESLint + Prettier`

前端至少提供以下命令：

- `pnpm dev`
- `pnpm build`
- `pnpm test`
- `pnpm lint`
- `pnpm format`

## 5. 后端设计

### 5.1 Rust workspace 结构

后端固定为：

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

其中：

- `apps/api-server` 提供主 HTTP 入口
- `apps/plugin-runner` 提供独立进程 health 占位
- `crates/*` 全部建立为最小可编译库 crate，并导出最小占位模块

### 5.2 运行能力

`apps/api-server` 至少提供：

- `/health`
- `/api/console/health`
- `/openapi.json`
- OpenAPI 查看页

`apps/plugin-runner` 至少提供：

- 单独启动能力
- 自身 health 输出

结果要求：

- `cargo run -p api-server` 可启动
- `cargo run -p plugin-runner` 可启动
- `cargo test` 可通过
- `cargo clippy --all-targets --all-features` 可通过

### 5.3 版本与质量基线

后端固定：

- `rust-toolchain.toml` 锁 `stable`
- `cargo fmt`
- `cargo clippy`
- `cargo test`

根目录至少提供便捷入口，确保前后端都能执行统一检查。

## 6. OpenAPI 与接口查看设计

虽然本轮接口极少，但 `api-server` 第一轮就接入 `utoipa`，原因是：

- 后续 `packages/api-client` 需要稳定来源
- 可以及早固定接口命名和分组边界
- 可以直接给用户可见文档页做校验

本轮要求：

- 输出 OpenAPI JSON 路由
- 输出可在浏览器直接访问的接口文档页
- 初始化完成后，需要把本地文档链接明确回传给用户进行人工校验

## 7. 本地开发与中间件策略

本地开发模式固定为“本地进程优先”：

- 前端和后端使用本地命令运行
- 中间件继续复用现有 `docker/docker-compose.middleware.yaml`

原因：

- 启动成本最低
- 更符合“先跑骨架”的目标
- 避免在本轮把 Docker 开发链路也做重

若依赖下载遇到网络问题，允许通过系统代理 `192.168.92.1:1454` 解决。

## 8. 项目专用 Skill 设计

### 8.1 位置

项目专用 skill 放在：

- `.agent/skills/1flowse-fullstack-bootstrap/`

### 8.2 目标

该 skill 不是通用初始化模板，而是绑定 1Flowse 当前约束的项目专用 skill。

它需要明确：

- 本仓库前端目录约定
- 本仓库 Rust workspace 约定
- 固定技术栈与版本锁定策略
- 本地开发命令
- OpenAPI 文档查看方式
- 新增 package/crate 时应遵循的规则
- 质量检查与验证顺序
- 网络问题时的代理约定

### 8.3 Skill 结构

该 skill 至少包含：

- `SKILL.md`
- 必要时的参考文件

内容重点是“何时触发、如何遵循 1Flowse 初始化约束”，而不是记录本次实现过程。

## 9. 错误处理与回退策略

初始化阶段主要风险与处理方式：

- 依赖下载失败
  - 先记录失败命令
  - 再按代理设置重试
- workspace 配置错位
  - 通过根级 lint/test/build/check 命令尽早暴露
- Rust crate 依赖循环或命名不一致
  - 在初始化阶段保持 crate 之间最低耦合，只做最小引用
- OpenAPI 文档页不可用
  - 至少保证 `openapi.json` 存在，再补文档 UI 挂载

## 10. 测试与验收

本轮验收标准固定为：

前端：

- `pnpm install`
- `pnpm lint`
- `pnpm test`
- `pnpm build`

后端：

- `cargo fmt --check`
- `cargo clippy --all-targets --all-features -- -D warnings`
- `cargo test`

运行态：

- `apps/web` 可启动
- `api-server` 可启动
- `plugin-runner` 可启动
- OpenAPI JSON 可访问
- OpenAPI 文档页可访问

Skill：

- `.agent/skills/1flowse-fullstack-bootstrap/` 已创建
- skill 内容能够指导后续 agent 在本仓库继续按同一规则扩展前后端

## 11. 实施顺序

建议实施顺序为：

1. 根级版本锁定与 workspace 框架
2. 前端 `apps/web` 与全部 `packages/*`
3. Rust workspace 与全部 `apps/*`、`crates/*`
4. `api-server` health 与 OpenAPI
5. 根级开发/校验命令
6. 项目专用 skill
7. 验证、文档回写、提交

## 12. 设计结论

本轮最合适的方案是：

`按最终架构一次建立前端 monorepo 和 Rust workspace 的完整目录边界，但每个模块只实现最小可跑、最小可编译、最小可验证能力；同时把这些约束沉淀为仓库内项目专用 skill。`

这样做的结果是：

- 后续目录边界不会漂
- 本地开发可以尽快启动
- 测试与格式基线第一天就可执行
- OpenAPI 和 TS client 链路从一开始就有承载点
- 以后让 agent 扩展项目时，不需要再次猜测技术栈和目录约定
