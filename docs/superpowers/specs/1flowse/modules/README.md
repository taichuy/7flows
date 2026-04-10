# 1Flowse 模块讨论目录

日期：2026-04-10
状态：进行中

## 当前规则

- 先整理功能清单，再按模块逐项讨论。
- 根 `README` 统一记录 8 个子模块的总览状态。
- 每个子模块在各自目录的 `README.md` 中沉淀已确认结论与待讨论项。
- 模块设计讨论内容统一以本目录及子模块 `README.md` 为主，`docs/userDocs` 仅保留运行摘要、历史记忆和用户偏好。
- 当前优先顺序：用户登录与团队接入 -> 权限与资源授权 -> ChatFlow 编排与版本管理 -> 插件体系。
- `运行时`、`发布`、`状态与记忆` 属于 P1 主轴，保持独立模块讨论，不并入 ChatFlow 细节。
- 本文件是模块讨论总览入口。

## 已整理讨论来源

- [2026-04-10-product-design.md](../2026-04-10-product-design.md)
- [2026-04-10-product-requirements.md](../2026-04-10-product-requirements.md)
- [2026-04-10-p1-architecture.md](../2026-04-10-p1-architecture.md)
- [2026-04-10-orchestration-design-draft.md](../2026-04-10-orchestration-design-draft.md)

## 当前总体进度

- 模块拆分：已完成
- 子模块目录初始化：已完成
- 已讨论文档回填：已完成首轮
- 细化讨论：进行中
- 当前进行中：08 插件体系

## 8 个子模块总览状态

| 模块 | 状态 | 完成情况 | 详情 |
| --- | --- | --- | --- |
| 01 用户登录与团队接入 | `completed` | 已确认邮箱+密码、无自助注册/找回、初始化团队+默认 root 账号、后台创建成员、`root/admin/manager` 角色模型、默认角色与改密链路、团队基础配置边界 | [README](./01-user-auth-and-team/README.md) |
| 02 权限与资源授权 | `in_progress` | 已确认资源清单、标准动作、`own/all` 范围、默认角色矩阵、自定义空间角色、明文敏感配置、`allow` 并集、审计与编码规范 | [README](./02-access-control/README.md) |
| 03 工作台与应用容器 | `completed` | 已确认工作台首页、应用容器边界、概览落点、左侧导航、生命周期与协作者模型，并完成残留文档对齐 | [README](./03-workspace-and-application/README.md) |
| 04 agentFlow 编排与版本管理 | `completed` | 已完成模块定稿并获用户通过 | [README](./04-chatflow-studio/README.md) |
| 05 运行时编排与调试 | `completed` | 已确认 checkpoint、调度主模型、单服务队列组织、流式双层模型、LLM 节点重试边界与统一执行引擎 | [README](./05-runtime-orchestration/README.md) |
| 06 发布网关与 API 文档 | `completed` | 已确认三类发布协议、应用级 API Key/Token、Dify 文档参考、控制面薄代理与 Draft 回滚规则 | [README](./06-publish-gateway/README.md) |
| 07 状态与记忆模型 | `completed` | 已确认最小字段类型集、显式 StateRead/StateWrite、启动快照注入、最小 CRUD 后台与外部数据源严格分层 | [README](./07-state-and-memory/README.md) |
| 08 插件体系 | `in_progress` | 已确认双轨主线、四类插件、统一包结构、来源与启用策略、共享 runner 与团队/应用范围边界 | [README](./08-plugin-framework/README.md) |
