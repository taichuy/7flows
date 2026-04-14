---
memory_type: project
topic: backend naming cleanup 确认为直接执行 workspace 物理层统一方案
summary: 用户于 `2026-04-14 12` 明确确认 backend 命名统一直接走方案 3：允许直接 reset 并重写 baseline，API 工作空间详情入口固定为 `/api/console/workspace`，不保留 `team/app` 旧协议 alias；后续设计与实施应一次性统一公开协议、Rust 语义、权限码、审计字段、物理表列和 runtime scope 命名。
keywords:
  - backend
  - workspace
  - naming
  - baseline
  - migration
  - team
  - system
match_when:
  - 需要设计或实施 team 到 workspace 的统一改造
  - 需要判断是否保留旧 API 或旧 scope alias
  - 需要决定 baseline migration 是否可重写
  - 需要统一 runtime scope 列名与物理存储命名
created_at: 2026-04-14 12
updated_at: 2026-04-14 12
last_verified_at: 2026-04-14 12
decision_policy: verify_before_decision
scope:
  - api
  - api/apps/api-server
  - api/crates/control-plane
  - api/crates/domain
  - api/crates/storage-pg
  - api/crates/runtime-core
  - docs/superpowers/specs
---

# backend naming cleanup 确认为直接执行 workspace 物理层统一方案

## 时间

`2026-04-14 12`

## 谁在做什么

用户与 AI 正在评估并收敛 backend 早期作用域命名，目标是在项目初始化阶段把 `team/app` 残留彻底统一为 `workspace/system`。

## 为什么这样做

当前代码已经出现“请求上下文与部分外部返回用 workspace，但内部 service、repository、权限码、审计字段、物理表列和 runtime scope 仍残留 team/app”的双语状态。如果继续保留中间层翻译，会把早期命名债正式固化。

## 为什么要做

项目仍处于初始化阶段，允许直接 reset 数据库并重写 baseline。此时一次性统一物理层和代码语义，成本明显低于后续带兼容层、历史数据和外部消费者一起迁移。

## 截止日期

未指定。

## 决策背后动机

- 本轮命名统一直接走方案 3，不采用“代码先统一、物理层后迁”的过渡方案。
- 允许直接 reset 数据库，并重写 baseline migration，不保留当前 `teams/team_memberships/team_id` 作为长期兼容结构。
- API 当前工作空间详情入口固定为 `/api/console/workspace`。
- 不保留 `/api/console/team`、`scope_kind=team/app`、`team.configure.all` 等旧外部协议 alias。
- 后续设计与实施要一次性覆盖：
  - 公开协议命名
  - Rust 领域与 service/repository 命名
  - 权限码与角色模板
  - 审计字段
  - 物理表名、列名、索引名
  - runtime metadata 与动态表 scope 列命名
- `tenant` 继续保持结构父层、默认隐藏，不作为当前公开业务活跃 scope。
