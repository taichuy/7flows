# 1Flowse 第二阶段后端治理与作用域收口设计

日期：2026-04-13
状态：核心收口已在 `2026-04-14 00` 落地并完成统一验证；本文按当前实现与规则现状回填更新
关联文档：
- [2026-04-12-backend-interface-kernel-design.md](../history/2026-04-12-backend-interface-kernel-design.md)
- [2026-04-12-backend-engineering-quality-design.md](../history/2026-04-12-backend-engineering-quality-design.md)
- [2026-04-13-backend-governance-phase-two.md](../../plans/history/2026-04-13-backend-governance-phase-two.md)
- [api/AGENTS.md](../../../../api/AGENTS.md)

## 1. 文档目标

本设计用于收束 1Flowse 第二阶段后端治理方向，目标不是扩新域，而是把第一阶段已经落地的后端骨架正式收口成稳定约定，保证后续无论扩多 workspace、多 tenant，还是插件能力，都只是在当前基础上增量扩展，而不是推翻重来。

本文档只覆盖以下内容：

- `system/root` 与业务空间边界
- `tenant / workspace` 作用域模型
- session 当前空间语义
- 插件安装与启用边界
- runtime registry 的失效与自愈策略
- `api/AGENTS.md` 的本地规则收口原则

本文档不覆盖：

- 新业务模块 API
- 前端交互与导航
- 多租户商业化与计费
- 具体数据库迁移执行步骤

## 2. 设计结论

第二阶段后端正式采用以下方向：

- `system/root` 与业务 `workspace` 严格分离
- 业务主作用域只保留 `workspace`
- 默认 bootstrap 固定为 hidden `root tenant` 加 1 个默认 `workspace`
- `tenant` 在表结构上长期存在，但默认不暴露 tenant 产品心智
- 多 workspace / 多 tenant 都不是默认能力，必须由插件开启
- session 必须持有一个 `current_workspace_id`
- runtime registry 采用“数据库真相 + 缓存自愈”的治理策略
- 当前代码层继续复用 `teams` / `TeamRecord` 作为 `workspace` 的持久化承载，避免本轮做大面积命名迁移
- `api/AGENTS.md` 只保留长期稳定、高频、不易过时的本地硬规则和模板

## 3. 作用域模型

### 3.1 system 与 root

- `system` 是宿主级管理面
- `root` 是 `system` 级身份，不属于任何业务 workspace
- `root/system` 不与第一个业务空间混用

### 3.2 tenant

- 数据库表结构上始终存在 `tenant`
- 默认 bootstrap 固定创建 1 条 hidden tenant 记录：
  - `id = 00000000-0000-0000-0000-000000000001`
  - `code = root-tenant`
  - `name = Root Tenant`
  - `is_root = true`
  - `is_hidden = true`
- 这条 `root tenant` 是持久化基础设施，不是默认产品概念
- 多租户插件未开启前：
  - tenant 相关接口不开放
  - tenant 不进入默认产品心智
  - UI 不展示 tenant 管理能力
  - 业务只感知 workspace
- 多租户插件开启后：
  - 才开放 tenant 管理接口与相关产品能力
  - 才允许新增 tenant

### 3.3 workspace

- 当前业务主作用域统一使用 `workspace`
- 当前语义上的 `team` 已收束到 `workspace`；现阶段仅保留 `teams` 表和 `TeamRecord` 作为兼容性命名承载
- `workspace` 在数据关系上必须隶属于某个 `tenant`
- 默认 bootstrap 会在 `root tenant` 下创建 1 个默认 `workspace`
- 同一 `tenant` 下的 `workspace` 名称唯一约束采用 `(tenant_id, lower(name))`
- 多租户插件未开启前，所有 workspace 都挂在默认的 `root tenant` 下

### 3.4 不再保留 app 作用域

- 第二阶段正式移除 `app` 这一层作为后端主作用域
- 后续新增能力若需要更细粒度边界，应在 `workspace` 内通过资源、策略或配置表达，而不是恢复 `app scope`

## 4. 会话上下文

session 与鉴权上下文现在都必须显式持有当前业务空间：

- `tenant_id`
- `current_workspace_id`

语义如下：

- 用户可以属于多个 workspace
- 但单个请求只能落在一个当前 workspace 上
- 当前 workspace 的语义类似“当前角色”，允许切换，但不允许请求链路隐式漂移
- 登录结果、session 读接口和请求中间件都必须把 `current_workspace_id` 继续向下传递
- 即使是 `root/system` 身份，请求链路里也仍然只保留一个当前 workspace 作为业务上下文

后端实现应以显式上下文向下传递当前 workspace，而不是在 repository 或 service 层自行猜测“默认 team / 第一条 workspace”。

## 5. 插件边界

### 5.1 安装权限

- system 插件只允许 host 安装
- workspace / tenant 不能直接安装宿主插件

### 5.2 非 host 侧能力

- workspace / tenant 侧只允许消费 host 已安装的能力，不允许反向变成宿主安装入口
- `runtime extension` 只允许绑定到 `workspace` 或 `model`，不接受 `tenant` 单独绑定，也不接受无绑定目标启用
- `capability plugin` 可以先绑定到 `workspace`，但绑定后仍需在具体配置里显式选中
- 因此非 host 侧能力边界应收束为：
  - 配置插件
  - 绑定插件
  - 显式选择已绑定能力

### 5.3 与现有扩展边界保持一致

- `runtime extension` 与 `capability plugin` 仍然禁止注册 HTTP 接口
- 二者只能挂到宿主预定义白名单槽位
- 开启多 workspace / 多 tenant 的能力也应视为 host 控制的系统插件能力

## 6. Runtime Registry 一致性策略

### 6.1 真相源

- 数据库物理结构和数据库中的模型元数据是唯一真相源
- runtime registry 只是运行时缓存，不拥有独立真相地位

### 6.2 基本策略

对模型、字段、物理表、物理列采用“发现错误立即隔离”的策略。当前已落地为：

- `model_definitions` 与 `model_fields` 都持久化 `availability_status`
- 状态值固定为 `available`、`unavailable`、`broken`
- 建表或加字段失败：对应模型或字段标记为 `broken`
- registry 重建前会先做 physical health check：
  - 模型元数据存在但物理表不存在：标记模型为 `unavailable`
  - 字段元数据存在但物理列不存在：标记字段为 `unavailable`，并连带把模型标记为 `unavailable`
- health-aware metadata loader 只把健康元数据交给 registry 重建
- runtime 读写阶段如果再命中“物理对象缺失”错误，也必须把对应模型标记为 `unavailable`

### 6.3 产品侧表现

- 出错模型只影响自身，不应污染整个 runtime
- 产品统一表现为“该模型暂不可用”或“该字段暂不可用”
- runtime 路由对不可用模型统一返回稳定错误码 `runtime_model_unavailable`
- 不允许继续把错误暴露成随机 SQL 报错或长期脏缓存行为

### 6.4 清理原则

- 首选“标记不可用或损坏 + 后续 registry 重建时剔除”
- 如有明确清理动作，再执行元数据删除或修复
- 不把“直接硬删除元数据”作为默认第一反应

## 7. api/AGENTS 原则

`api/AGENTS.md` 的目标是提供短、硬、稳定的本地执行规则。

应保留的内容：

- 不易过时的后端分层规则
- 高风险边界约束
- session 与审计这类必须长期稳定的本地硬约束

不应写入的内容：

- 代码收口后会消失的临时实现事实
- 仓库根 `AGENTS.md` 已统一约束的通用收纳规则与验证方式
- 需要先跳到其他长文档才能理解的主体规则
- 解释性过强的背景说明

推荐结构：

- 本地硬规则

## 8. 当前已落地的 api/AGENTS

```md
# api 本地硬规则

- session 必须持有一个 `current_workspace_id`。
- `route` 只做协议层、上下文提取、响应映射；不得直接承载业务写入。
- 所有关键写动作必须经过命名明确的 `service command`。
- `repository` 不得承载权限判断、状态流转、HTTP 语义。
- `mapper` 只做转换，不得藏业务规则。
- 成员、角色、权限、模型、会话等关键动作必须写审计日志。
```

落地说明：

- 插件绑定、runtime metadata 自愈、测试收纳、统一验证等规则继续由本设计、实现代码和仓库根规范共同约束
- `api/AGENTS.md` 不再为了“把所有规则都写进去”而扩成小型 spec

## 9. 当前仍未进入本轮扩展范围的事项

- tenant 管理接口与 UI 仍然关闭，继续保持 hidden infrastructure 语义
- workspace 切换 API 与前端选择器不在本轮范围；当前只保证 session 持有 `current_workspace_id`
- `teams` / `TeamRecord` 的兼容性命名清理可在后续独立重构，不作为本轮治理收口前置条件
- 面向运营的 runtime metadata 修复工作流可后续单独设计，本轮先保证“可隔离、可识别、不泄漏原始错误”
