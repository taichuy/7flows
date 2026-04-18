---
memory_type: feedback
feedback_category: repository
topic: 应用级对外调用路径不应按 applicationId 分叉而应由 API Key 绑定具体应用
summary: 当设计 `Application` 的 API 分区或发布网关时，不要把不同应用设计成不同外部调用 URL；同一 `application_type` 应共享统一调用 path，具体命中哪个应用由应用级 API Key 绑定关系决定。
keywords:
  - application
  - api
  - api-key
  - routing
  - publish-gateway
match_when:
  - 需要设计 `Application` 的 API 分区
  - 需要编写 `06B` 发布网关 spec
  - 需要决定外部调用 URL 是否包含 `applicationId`
created_at: 2026-04-15 09
updated_at: 2026-04-15 09
last_verified_at: 2026-04-15 09
decision_policy: direct_reference
scope:
  - docs/superpowers/specs/1flowbase/modules/03-workspace-and-application/README.md
  - docs/superpowers/specs/1flowbase/modules/06b-publish-gateway/README.md
  - api
  - web
---

# 应用级对外调用路径不应按 applicationId 分叉而应由 API Key 绑定具体应用

## 时间

`2026-04-15 09`

## 规则

- 对同一 `application_type`，未来对外调用 URL 应保持统一。
- 不同 `Application` 的区分主要依赖各自应用级 `API Key`，而不是 URL 中的 `applicationId`。

## 原因

- 如果把外部调用 path 设计成按 `applicationId` 分叉，会把应用身份暴露到 URL 结构中，并把“调用入口模板”和“具体应用实例”耦合在一起。
- 用户期望同类应用只在凭证层区分，调用心智更接近 Dify 的统一 service API。

## 适用场景

- 设计应用详情中的 `API` 分区
- 设计发布网关或统一调用协议
- 讨论应用级 API Key 与调用路由关系

## 备注

- 该规则约束的是“外部调用 URL”。
- 控制台内部管理接口是否挂在 `/api/console/applications/:id/...` 下，需要单独按实现阶段决定，不能反推外部调用 URL 也必须带 `applicationId`。
