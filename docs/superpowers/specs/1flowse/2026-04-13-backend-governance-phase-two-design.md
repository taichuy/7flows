# 1Flowse 第二阶段后端治理与作用域收口设计

日期：2026-04-13
状态：已完成当前轮讨论，待用户审阅
关联文档：
- [2026-04-12-backend-interface-kernel-design.md](./2026-04-12-backend-interface-kernel-design.md)
- [2026-04-12-backend-engineering-quality-design.md](./2026-04-12-backend-engineering-quality-design.md)

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
- `tenant` 在表结构上长期存在，但默认不暴露 tenant 产品心智
- 多 workspace / 多 tenant 都不是默认能力，必须由插件开启
- session 必须持有一个 `current_workspace_id`
- runtime registry 采用“数据库真相 + 缓存自愈”的治理策略
- `api/AGENTS.md` 只保留长期稳定、高频、不易过时的本地硬规则和模板

## 3. 作用域模型

### 3.1 system 与 root

- `system` 是宿主级管理面
- `root` 是 `system` 级身份，不属于任何业务 workspace
- `root/system` 不与第一个业务空间混用

### 3.2 tenant

- 数据库表结构上始终存在 `tenant`
- 默认安装时自动创建 1 条 tenant 记录，命名为 `root tenant`
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
- 当前语义上的 `team` 后续应收束到 `workspace`
- `workspace` 在数据关系上必须隶属于某个 `tenant`
- 多租户插件未开启前，所有 workspace 都挂在默认的 `root tenant` 下

### 3.4 不再保留 app 作用域

- 第二阶段正式移除 `app` 这一层作为后端主作用域
- 后续新增能力若需要更细粒度边界，应在 `workspace` 内通过资源、策略或配置表达，而不是恢复 `app scope`

## 4. 会话上下文

session 必须显式持有一个当前业务空间：

- `current_workspace_id`

语义如下：

- 用户可以属于多个 workspace
- 但单个请求只能落在一个当前 workspace 上
- 当前 workspace 的语义类似“当前角色”，允许切换，但不允许请求链路隐式漂移

后端实现应以显式上下文向下传递当前 workspace，而不是在 repository 层自行猜测“默认 team / 第一条 workspace”。

## 5. 插件边界

### 5.1 安装权限

- system 插件只允许 host 安装
- workspace / tenant 不能直接安装宿主插件

### 5.2 非 host 侧能力

- workspace / tenant 后续最多允许：
  - 配置插件
  - 绑定插件
  - 启停已安装能力

### 5.3 与现有扩展边界保持一致

- `runtime extension` 与 `capability plugin` 仍然禁止注册 HTTP 接口
- 二者只能挂到宿主预定义白名单槽位
- 开启多 workspace / 多 tenant 的能力也应视为 host 控制的系统插件能力

## 6. Runtime Registry 一致性策略

### 6.1 真相源

- 数据库物理结构和数据库中的模型元数据是唯一真相源
- runtime registry 只是运行时缓存，不拥有独立真相地位

### 6.2 基本策略

对模型、字段、物理表、物理列采用“发现错误立即隔离”的策略：

- 建表失败：对应模型标记为 `unavailable` 或 `broken`
- 加字段失败：对应字段标记为 `unavailable` 或 `broken`
- 检测到模型元数据存在但物理表不存在：
  - 不继续提供该模型 runtime 能力
  - 从 registry 中移除或隔离该模型
  - 刷新缓存
- 检测到字段元数据存在但物理列不存在：
  - 不继续接受该字段参与 runtime 读写
  - 从 registry 中移除或隔离该字段
  - 刷新缓存

### 6.3 产品侧表现

- 出错模型只影响自身，不应污染整个 runtime
- 产品统一表现为“该模型暂不可用”或“该字段暂不可用”
- 不允许继续把错误暴露成随机 SQL 报错或脏缓存行为

### 6.4 清理原则

- 首选“标记不可用 + 刷新缓存”
- 如有明确清理动作，再执行元数据删除或修复
- 不把“直接硬删除元数据”作为默认第一反应

## 7. api/AGENTS 原则

`api/AGENTS.md` 的目标是提供短、硬、稳定的本地执行规则。

应保留的内容：

- 不易过时的后端分层规则
- 高风险边界约束
- 统一验证命令
- 新增资源最低结构模板

不应写入的内容：

- 代码收口后会消失的临时实现事实
- 需要先跳到其他长文档才能理解的主体规则
- 解释性过强的背景说明

推荐结构：

- 本地硬规则
- 统一验证方式
- 新增资源最低结构

## 8. 当前建议的 api/AGENTS 示例

```md
# api 本地硬规则

- session 必须持有一个 `current_workspace_id`。
- `route` 只做协议层、上下文提取、响应映射；不得直接承载业务写入。
- 所有关键写动作必须经过命名明确的 `service command`。
- `repository` 不得承载权限判断、状态流转、HTTP 语义。
- `mapper` 只做转换，不得藏业务规则。
- 成员、角色、权限、模型、会话等关键动作必须写审计日志。
- `runtime extension` 与 `capability plugin` 禁止注册 HTTP 接口；只能挂宿主白名单槽位。
- system 插件只允许 host 安装；workspace / tenant 只允许配置或绑定。
- runtime 模型或字段若对应物理表/列缺失，必须标记不可用并刷新 registry。
- 测试统一放到对应子目录 `_tests`。
- 后端验证统一使用 `node scripts/node/verify-backend.js`。
- 同一工作区内 `cargo` 验证命令默认串行执行，不并发抢锁。

## 新增资源最低结构

- `route`
- `dto`
- `service`
- `repository trait`
- `repository impl`
- `mapper`
- `_tests`
```

## 9. 后续实现注意点

当前方向已经足够进入实现计划；后续实现时只需在技术细节上补齐以下内容：

- `root tenant` 的业务 code 与主键生成策略
- `workspace` 在数据库层的唯一约束形式
- tenant 插件开启前，默认 tenant 的查询与审计是否完全内部化
