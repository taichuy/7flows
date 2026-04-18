# 07 数据建模、作用域与 Runtime CRUD

日期：2026-04-14
状态：已形成当前实现基线

## 讨论进度

- 状态：`implemented_baseline`
- 完成情况：已从旧“状态与记忆模型”模块改写为当前代码真实主线：后台数据建模定义、`workspace/system` 作用域、物理表实时生效与 runtime CRUD。
- 最后更新：2026-04-14 19:45 CST

## 为什么改名

原模块名里的“记忆”会误导后续开发者，以为当前已经有：

- Flow 层的记忆注入
- `StateRead / StateWrite` 节点闭环
- 启动快照与运行中刷新语义

这些在当前代码里都还没有形成实现真相。

当前真正已经存在的是：

- 数据建模定义控制面
- 作用域收口
- PostgreSQL 物理表实时生效
- runtime CRUD 路由
- metadata 健康治理

## 本模块范围

- 数据建模定义
- 字段定义与关系字段
- `workspace / system` 作用域
- 物理表与物理列策略
- runtime registry
- runtime CRUD 路由
- metadata 可用性治理

## 当前代码事实

- 控制面已提供模型定义与字段定义 API
- `scope_kind` 已固定为：
  - `workspace`
  - `system`
- `system` 作用域固定使用 `SYSTEM_SCOPE_ID`
- 静态控制面表使用 `workspace_id`
- runtime 动态表统一使用 `scope_id`
- runtime 路由已形成：
  - `/api/runtime/models/{model_code}/records`
- metadata 已引入健康状态：
  - `available`
  - `unavailable`
  - `broken`

## 本轮确认

- 本模块的核心定位是“后台数据建模定义 + runtime 数据访问层”，不是独立数据库产品。
- 数据建模定义继续采用：
  - 控制面保存定义
  - 实时修改 PostgreSQL 物理表
  - runtime 统一路由访问真实表
- 模型作用域固定只允许：
  - `workspace`
  - `system`
- system-scoped 数据继续通过固定 `SYSTEM_SCOPE_ID` 表达，不再保留旧 `app` 语义。
- runtime 物理过滤列统一使用 `scope_id`，不再拆 `team_id / app_id`。
- 当前字段类型与关系能力，以现有实现为准，不再沿用旧文档里的“记忆字段”口径。
- runtime registry 继续采用：
  - 数据库元数据为真相源
  - registry 为运行时缓存
  - 物理对象不健康时隔离模型，而不是把错误原样泄漏给业务请求

## 明确不纳入本模块

以下内容不再写进本模块标题或当前实现说明：

- Flow 层记忆注入
- `StateRead / StateWrite` 节点编排语义
- 启动快照与显式刷新
- 面向 Flow 的跨会话记忆模型

如果后续需要把“Flow 记忆注入”继续做成真实实现，应作为 `04 / 05 / 07` 的联动专题单独重开，而不是继续沿用旧模块名假定它已经存在。

## 当前结论摘要

- `07` 的当前代码真相是“数据建模、作用域与 Runtime CRUD”。
- 后续一切围绕建表、字段、关系、runtime CRUD、作用域和 metadata 健康的开发，都应优先对齐本模块。
