---
memory_type: feedback
feedback_category: repository
topic: 主仓库只官方维护 PostgreSQL 主存储，外部数据源走插件扩展口
summary: 主仓库官方支持矩阵收敛到 PostgreSQL 主存储；外部数据源从一开始按平台扩展单元设计，但不承诺主仓库亲自维护所有 adapter。
keywords:
  - storage-durable
  - storage-postgres
  - data-source-platform
  - postgres
  - external-data-source
  - runtime-extension
match_when:
  - 讨论 durable storage 边界命名、官方支持矩阵或多数据源演进路线时
  - 评估外部数据库、SaaS 或 API 数据源应落在哪条架构线时
  - 设计第三方数据源 adapter、插件契约或平台扩展单元时
created_at: 2026-04-23 19
updated_at: 2026-04-23 19
last_verified_at: 无
decision_policy: direct_reference
scope:
  - api/crates/storage-durable
  - api/crates/storage-postgres
  - api/crates/control-plane
  - api/crates/plugin-framework
---

# 主仓库只官方维护 PostgreSQL 主存储，外部数据源走插件扩展口

## 时间

`2026-04-23 19`

## 规则

主仓库官方只维护 `PostgreSQL` 这一条主存储实现线，架构命名按 `storage-durable + storage-postgres` 收口。

外部数据库、`SaaS`、`API` 等其他数据源不继续塞进 `storage-durable`，而是单独按平台扩展单元设计，通过插件扩展口接入。

从一开始就要把外部数据源的契约、密钥模型、catalog/schema cache、preview/import 边界和宿主权限模型考虑清楚，但不要求主仓库一开始就官方维护多种 adapter。

## 原因

如果把平台主存储和外部数据源接入混成一个抽象层，后续很容易出现能力名和实现名混杂、迁移边界不清、维护范围失控的问题。

主仓库先把 `PostgreSQL` 主存储维护好，能够保证平台核心状态一致性；而外部数据源作为插件化扩展口，可以让后续开发者在稳定契约上自行实现新的 adapter，而不破坏主线。

## 适用场景

讨论主仓库是否应该官方支持多个 durable backend。

讨论 `storage-*` 命名与外部数据源平台是否应该混在一起。

设计第三方数据源插件、运行时扩展契约或 `data-source-platform` 时。

## 备注

推荐长期结构：

- `storage-durable`：平台主存储边界
- `storage-postgres`：当前唯一官方实现
- `data-source-platform`：外部数据源平台边界

