# 07 状态与记忆模型

日期：2026-04-10
状态：已确认

## 讨论进度

- 状态：`completed`
- 完成情况：已完成状态字段类型、读写方式、注入时机、后台最小能力与外部数据源边界定稿，并获用户确认。
- 最后更新：2026-04-10 18:57 CST

## 已整理来源文档

- [2026-04-10-product-design.md](../../2026-04-10-product-design.md)
- [2026-04-10-product-requirements.md](../../2026-04-10-product-requirements.md)
- [2026-04-10-p1-architecture.md](../../2026-04-10-p1-architecture.md)
- [2026-04-10-orchestration-design-draft.md](../../2026-04-10-orchestration-design-draft.md)

## 本模块范围

- State Model 定义
- State Data 持久化
- 上下文注入策略
- 记忆与业务状态边界

## 已确认

- `State Model` 是结构化持久化层。
- 它服务于记忆与状态，不演化成完整低代码平台。
- `State Model` 用于承接跨会话记忆、业务状态持久化、上下文注入和基础运营管理数据。
- P1 状态层定位为 Flow 的结构化记忆层，不是独立数据库产品。
- 状态模型中的数据必须可以按规则注入 Flow 运行上下文，作为跨会话记忆或业务上下文来源。
- 运行时不得直接绕过状态服务访问底层表，以保持权限与审计一致。
- 外部数据源允许接入，但 Flow 和状态模型的使用都必须经过统一权限治理。
- P1 编排层已纳入 `StateRead` 与 `StateWrite` 节点。
- `state_write` 已进入统一 `Binding Schema` 范围。
- P1 状态字段类型收敛为：`string`、`text`、`number`、`boolean`、`datetime`、`enum`、`json`、`single_ref`、`multi_ref`。
- 系统保留字段统一内建：`id`、`created_at`、`updated_at`。
- `Flow` 访问状态统一通过显式 `StateRead` / `StateWrite` 节点完成；`StateWrite` 在 P1 仅开放 `create`、`update`、`upsert`，不默认开放 `delete`。
- 记忆注入采用“启动快照 + 显式刷新”模式：`Flow Run` 启动时按规则注入只读状态快照；若流程中需要最新状态，必须显式使用 `StateRead` 再读取。
- 注入作用域先收敛到 `application / user / conversation / session` 等明确对象。
- 管理后台数据视图采用最小 CRUD 管理台：模型列表、字段结构、记录列表、分页、搜索、基础筛选、详情查看、创建/编辑、关联记录跳转。
- 状态模型与外部数据源在 P1 严格分离：`State Model` 是平台托管状态层，`External Data Source` 是独立集成资源；两者统一治理权限，但对象边界不合并。
- 若外部数据需要稳定注入、可运营管理、可回写审计，应进入平台托管的 `State Model`；是否提供同步/映射能力留待后续版本。

## 当前结论摘要

- P1 先做最小结构化字段类型集，保证状态服务、自动 CRUD、权限和注入链路统一可控。
- 状态访问统一节点化，避免隐式读写破坏调试、审计与运行语义。
- 记忆采用启动快照注入，实时状态依赖显式 `StateRead`，兼顾稳定性与灵活性。
- 后台先收敛到最小 CRUD 管理台，先打通“建模 -> 管理 -> 注入 -> 编排读写”闭环。
- 外部数据源与平台托管状态层严格分离，后续再视需要扩展受控映射或同步能力。
