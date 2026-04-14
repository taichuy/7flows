# 1Flowse 后端 workspace 物理命名统一设计

日期：2026-04-14
状态：已完成当前轮设计确认，待用户审阅
关联文档：
- [2026-04-13-backend-governance-phase-two-design.md](./2026-04-13-backend-governance-phase-two-design.md)
- [2026-04-13-data-model-physical-table-design.md](./2026-04-13-data-model-physical-table-design.md)
- [api/AGENTS.md](../../../../api/AGENTS.md)

## 1. 文档目标

本文档用于把 1Flowse 当前后端中的 `team/app` 历史命名一次性统一为 `workspace/system`，覆盖公开协议、Rust 语义、权限码、审计字段、物理库表、runtime metadata 和动态表 scope 列。

本文档要解决的核心问题是：

- 是否继续保留 `team -> workspace` 的中间兼容层
- 是否继续保留 `/api/console/team`、`scope_kind=team/app`、`team.configure.all` 等旧协议
- baseline migration 是继续沿用历史命名，还是直接重写成最终形态
- runtime 动态表 scope 列应该继续使用 `team_id/app_id`，还是收敛为最终规则

本文档只覆盖以下内容：

- backend 命名统一目标与边界
- 物理存储最终命名
- runtime scope 命名与动态表规则
- API、OpenAPI、环境变量与测试协议收口
- baseline migration 重写与验证门禁

本文档不覆盖：

- tenant 产品化 UI
- 多租户商业策略
- 与本轮命名统一无关的新业务模块
- 外部系统兼容迁移脚本

## 2. 设计结论

### 2.1 总体结论

本轮直接执行彻底统一方案，不采用“代码先统一、物理层后迁”的两阶段过渡。

前提如下：

- 当前项目仍处于初始化阶段
- 允许直接 reset 数据库
- 允许重写 baseline migration
- 不保留任何旧协议 alias

本文同时覆盖并替代 [2026-04-13-backend-governance-phase-two-design.md](./2026-04-13-backend-governance-phase-two-design.md) 中“当前代码层继续复用 `teams` / `TeamRecord` 作为 `workspace` 的持久化承载”的阶段性约定。

正式收口后的规则如下：

- 外部协议只允许 `workspace` 和 `system`
- Rust 核心语义只允许 `Workspace*`、`workspace_id`、`workspace.configure.all`
- 静态控制面物理表只允许 `workspaces`、`workspace_memberships`、`roles.workspace_id`、`audit_logs.workspace_id`
- `tenant` 继续作为结构父层存在，但默认隐藏，不进入当前公开业务活跃 scope
- 旧词 `team`、`app` 不允许继续出现在 API、OpenAPI、serde alias、环境变量、权限码、测试断言和 baseline SQL 中

### 2.2 明确不采用的方向

以下方向不作为当前正式路线：

- 不采用 `/api/console/workspace` 与 `/api/console/team` 双路并存
- 不采用 `workspace/system` 对外、`team/app` 对内的长期翻译层
- 不采用保留 `team.configure.all` 作为权限兼容码
- 不采用继续把 runtime 动态表 scope 列命名为 `team_id/app_id`
- 不采用保留 `BOOTSTRAP_TEAM_NAME` 作为环境变量 alias

### 2.3 六条固定规则

1. 当前工作空间详情接口固定为 `/api/console/workspace`。
2. 数据建模定义 `scope_kind` 只允许 `workspace` 或 `system`。
3. 静态控制面表的业务作用域列统一使用 `workspace_id`。
4. runtime 动态表统一使用通用列 `scope_id`，不再按作用域种类拆分列名。
5. system scope 使用固定单例 `SYSTEM_SCOPE_ID`，不再延续 `app` 语义。
6. baseline migration 直接重写为最终命名，不保留“先 team/app，后再 rename”历史步骤。

## 3. 作用域与核心语义

### 3.1 结构关系

后端正式采用以下层级：

- `system`
- `tenant`
- `workspace`

语义说明：

- `system` 是宿主级根控制面
- `tenant` 是结构父层和归属隔离层
- `workspace` 是当前公开业务主作用域

当前请求活跃业务 scope 只有：

- `system`
- `workspace`

`tenant` 继续作为结构存在，但不作为当前控制台默认业务动作的直接作用域。

### 3.2 核心对象命名

Rust 核心语义统一为：

- `WorkspaceRecord`
- `WorkspaceService`
- `WorkspaceRepository`
- `UpdateWorkspaceCommand`
- `workspace_id`
- `current_workspace_id`

旧命名全部移除：

- `TeamRecord`
- `TeamService`
- `TeamRepository`
- `UpdateTeamCommand`
- `team_id`

### 3.3 权限与角色语义

权限码统一收口为：

- `workspace.view.all`
- `workspace.configure.all`

本轮最关键的直接替换项是：

- `team.configure.all -> workspace.configure.all`

角色模板、角色权限检查、测试断言和迁移 smoke 必须同步改名，不允许出现“代码词汇已统一，但权限码仍残留旧值”的情况。

## 4. API 与协议规则

### 4.1 控制面接口

当前工作空间详情接口统一为：

- `GET /api/console/workspace`
- `PATCH /api/console/workspace`

旧接口不保留：

- `GET /api/console/team`
- `PATCH /api/console/team`

OpenAPI 只暴露最终命名，不保留历史 route 引用。

### 4.2 数据建模定义协议

数据建模定义创建和返回协议统一为：

- `scope_kind = "workspace"`
- `scope_kind = "system"`

不再接受或返回：

- `"team"`
- `"app"`

serde alias 也一起删除，避免旧词在协议层继续存活。

### 4.3 环境变量与 bootstrap 协议

bootstrap 环境变量统一为：

- `BOOTSTRAP_WORKSPACE_NAME`

以下旧变量不保留 alias：

- `BOOTSTRAP_TEAM_NAME`

所有启动入口、测试辅助、reset root password 脚本和健康检查测试一起改名。

## 5. 静态物理存储规则

### 5.1 最终表名

控制面静态表统一为以下命名：

- `workspaces`
- `workspace_memberships`
- `roles`
- `audit_logs`

其中需要改名的核心对象是：

- `teams -> workspaces`
- `team_memberships -> workspace_memberships`

### 5.2 最终列名

控制面静态表中的业务作用域列统一为：

- `workspace_id`

直接改名的关键列包括：

- `roles.team_id -> roles.workspace_id`
- `audit_logs.team_id -> audit_logs.workspace_id`
- `workspace_memberships.team_id -> workspace_memberships.workspace_id`

### 5.3 约束与索引

所有关联约束和索引命名一起改成最终语义，包括但不限于：

- `roles_workspace_code_uidx`
- `workspace_memberships` 上的 `(workspace_id, user_id)` 唯一约束
- `workspaces` 上的 `(tenant_id, lower(name))` 唯一约束

baseline 中不再保留：

- `roles_team_code_uidx`
- `roles_app_code_uidx`
- `scope_kind in ('app', 'team')`

### 5.4 审计字段

审计记录统一使用：

- `workspace_id`

领域对象、审计 helper、SQL insert 和测试断言必须全部同步改名。不能保留“事件发生在 workspace，但审计字段仍叫 team_id”的半统一状态。

## 6. runtime scope 规则

### 6.1 总体规则

runtime 不再继续维护 `team_id/app_id` 两套物理列名，而是统一为：

- `scope_kind`
- `scope_id`

其中：

- 元数据层保留 `scope_kind` 用于表达语义
- 动态 runtime 表只保留 `scope_id` 作为物理过滤列

### 6.2 为什么 runtime 使用 `scope_id`

静态控制面表使用显式 `workspace_id`，因为这是稳定业务语义。

runtime 动态表使用 `scope_id`，因为它属于物理适配层，目标是：

- 避免为 `workspace/system` 维护两套列名分支
- 避免继续沿用 `team_id/app_id` 历史债
- 让物理表结构与 `scope_kind` 解耦
- 方便后续 runtime registry 和 CRUD 仓储统一处理

因此本轮采用：

- 静态控制面表：显式 `workspace_id`
- runtime 动态表：通用 `scope_id`

这不是语义不统一，而是按稳定核心和适配层职责分层。

### 6.3 system scope 规则

system scope 不再保留 `app` 概念，也不允许用户自行传任意系统 scope id。

本轮固定引入：

- `SYSTEM_SCOPE_ID = 00000000-0000-0000-0000-000000000000`

规则如下：

- system-scoped 数据建模定义创建时由后端自动写入 `SYSTEM_SCOPE_ID`
- 外部协议创建 system-scoped model 时不再要求用户提供 `scope_id`
- 返回结构如保留 `scope_id`，其值恒定为 `SYSTEM_SCOPE_ID`

### 6.4 runtime 资源语义

runtime 相关枚举与资源描述统一收口为：

- `Workspace`
- `System`

不再保留：

- `Team`
- `App`

包括：

- `DataModelScopeKind`
- runtime resource descriptor scope 枚举
- runtime metadata 默认 `scope_column_name`
- 相关测试用例命名和断言

## 7. baseline migration 重写策略

### 7.1 重写原则

由于当前允许直接 reset，baseline migration 直接重写为最终形态。

原则如下：

- baseline 从第一步就是 `workspaces/workspace_memberships/workspace_id`
- baseline 从第一步就是 `scope_kind in ('system', 'workspace')`
- baseline 从第一步就是 `audit_logs.workspace_id`
- baseline 从第一步就是 model definition 使用 `workspace/system`
- baseline 从第一步就是 runtime 动态表统一 `scope_id`

### 7.2 不再保留的历史步骤

以下历史迁移逻辑不再作为长期仓库事实保留：

- 先创建 `teams`
- 先创建 `team_memberships`
- 先把 `roles.scope_kind` 写成 `app/team`
- 再通过后续 migration 改成 `system/workspace`
- 再通过后续 migration 为 `teams` 补 `tenant_id`

这些步骤在初始化项目阶段只会制造认知噪声，不产生实际兼容价值。

### 7.3 允许保留的内容

允许保留的只有与命名无关的后续结构演进，例如：

- metadata health check
- 新增 availability_status
- 与 runtime 失效治理直接相关的后续字段

前提是这些 migration 的前置命名必须已是最终形态。

## 8. 实施边界

### 8.1 需要修改的模块

- `api/apps/api-server`
- `api/crates/domain`
- `api/crates/control-plane`
- `api/crates/access-control`
- `api/crates/storage-pg`
- `api/crates/runtime-core`

### 8.2 需要同步修改的类型

- 路由文件名与模块名
- OpenAPI 注册入口
- domain record 与 enum
- service、repository trait、repository impl
- mapper 命名
- SQL helper 与查询函数
- migration smoke
- route/service/repository/runtime tests
- 启动配置与测试环境变量

### 8.3 本轮不做的事

本轮不扩 tenant 产品层能力，也不设计多租户 UI。目标只是在 backend 内把已经确认的最终语义一次性落成。

## 9. 验证门禁

本轮完成后必须满足以下门禁：

- 仓库根统一后端验证命令通过：`node scripts/node/verify-backend.js`
- migration smoke 通过
- runtime registry 与 runtime record 相关测试通过
- OpenAPI 中不再出现 `team` route 和 `team/app` scope 枚举
- 代码检索中不再出现有效残留：
  - `/api/console/team`
  - `team.configure.all`
  - `BOOTSTRAP_TEAM_NAME`
  - `scope_kind = 'team'`
  - `scope_kind = 'app'`
  - `team_id`
  - `TeamRecord`

如果仍有残留，只允许存在于：

- 历史设计文档
- git 历史

不允许继续留在活跃代码、测试和 migration 中。

## 10. 风险与规避

### 10.1 最容易漏的点

- runtime metadata 仍产出 `team_id/app_id`
- system scope 仍保留旧 `app` 输入语义
- reset root password 与测试辅助仍使用 `BOOTSTRAP_TEAM_NAME`
- 审计字段或权限码只改了一半

### 10.2 规避策略

- 先改 baseline 和 domain/ports，再改 API 和测试，最后清扫 runtime
- 改完后必须用检索做命名清场，而不是只靠测试通过判断
- 所有 helper 函数和测试工厂一起重命名，避免隐性旧语义继续扩散

## 11. 最终建议

当前项目阶段最优解是直接执行这次彻底统一，不保留别名，不保留兼容层，不保留中间语义翻译。

这样做的收益是：

- 公开协议、核心语义、物理存储和 runtime 不再双语
- 后续继续扩 workspace、tenant 或插件时，不需要再背着 `team/app` 历史命名债
- 新增代码和测试从第一天起就只面向最终规则编写
