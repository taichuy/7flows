---
memory_type: project
topic: API 文档从 Swagger UI 迁移到 Scalar 的兼容性评估
summary: 当前仓库的 `/openapi.json` 已与文档 UI 解耦，Scalar 与 OpenAPI 规格本身兼容；推荐优先保留 `utoipa` 生成链，只替换 `/docs` 展示层，不建议现阶段把文档维护改成独立 docs-first 双轨。
keywords:
  - api-docs
  - swagger
  - scalar
  - openapi
  - utoipa
  - axum
match_when:
  - 用户询问 Swagger UI 是否应替换为 Scalar
  - 需要评估当前 API 文档维护方式是否迁移到 Scalar
  - 需要判断 `utoipa` 与 Scalar 的兼容边界
created_at: 2026-04-13 23
updated_at: 2026-04-13 23
last_verified_at: 2026-04-13 23
decision_policy: verify_before_decision
scope:
  - api/apps/api-server/src/lib.rs
  - api/apps/api-server/src/openapi.rs
  - api/Cargo.toml
  - docs
---

# API 文档从 Swagger UI 迁移到 Scalar 的兼容性评估

## 时间

`2026-04-13 23`

## 谁在做什么

用户在评估是否把当前基于 Swagger UI 的 API 文档展示改为 Scalar，并关注界面观感、后续维护成本和搜索体验。

## 为什么这样做

当前仓库已经把 OpenAPI 真源收口到 `/openapi.json` 与 `openapi::ApiDoc`，文档 UI 只是挂载在 `/docs` 的展示层，因此需要确认 Scalar 是不是只替换展示壳，还是会连带改变文档维护模式。

## 为什么要做

如果只是替换 UI，可以在不动 OpenAPI 生成链和对齐测试的前提下改善阅读体验；如果改成 docs-first 双轨维护，则会重新引入文档与真实路由漂移的风险。

## 截止日期

无硬性截止日期；当前是评估与方案选择阶段。

## 决策背后动机

- 当前推荐路径是保留 `utoipa` 生成 `/openapi.json` 的 code-first 方式，只替换 `/docs` 的展示层为 Scalar。
- `Scalar` 与 OpenAPI 规格本身兼容，但 `utoipa-scalar 0.3.0` 的 Axum 集成依赖 `axum 0.8`，而仓库当前使用 `axum 0.7`，因此不建议直接走现成 Axum adapter。
- 若后续实施，优先方案是手写一个指向 `/openapi.json` 的 Scalar HTML 页面，继续保持 `/openapi.json` 为唯一真源。
- 只有在后续需要门户页、叙事文档、版本化文档站时，才再评估是否迁移到 Scalar Docs/Registry 一类 docs-first 流程。
