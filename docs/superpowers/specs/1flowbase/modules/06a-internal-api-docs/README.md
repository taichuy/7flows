# 06A 内部 API 文档

日期：2026-04-14
状态：已形成当前实现基线

## 讨论进度

- 状态：`implemented_baseline`
- 完成情况：设置区内部 API 文档已切换到前端接管、按接口按需加载、权限控制的最新链路；后续继续沿最新设计稿演进。
- 最后更新：2026-04-14 19:45 CST

## 本模块范围

- 设置区 `API 文档` 分区
- 内部平台 API 文档目录与单接口详情
- 后端 canonical OpenAPI 的受保护派生消费形态
- 文档查看权限

## 当前代码事实

- 前端 `ApiDocsPanel` 已采用“左侧目录 + 右侧详情”的真实页面结构
- 前端先请求接口目录，再按需请求单接口闭合 OpenAPI 文档
- 后端已提供：
  - `GET /api/console/docs/catalog`
  - `GET /api/console/docs/operations/{operation_id}/openapi.json`
- 文档查看权限已经独立为 `api_reference.view.all`
- 非生产环境仍保留 legacy `/docs` Swagger 入口作为兼容调试入口

## 本轮确认

- `06A` 只讨论内部平台 API 文档，不讨论对外发布协议。
- 正式控制台入口固定为：
  - `设置 -> API 文档`
- 正式文档链路固定为：
  - 前端页面渲染
  - 目录先行
  - 单接口按需加载
- 平台接口文档真值仍来自后端 `utoipa` 注册，不允许前端维护独立接口目录真值。
- 文档权限固定为：
  - `root` 永远可见
  - 非 `root` 必须显式拥有 `api_reference.view.all`
- 文档页继续保留在设置区，而不是上升为新的一级导航。

## 当前实现边界

- 已实现：
  - catalog + operation spec API
  - 设置区目录 / 搜索 / 详情页
  - 基于 `operationId` 的深链接
  - 文档权限控制
- 暂不纳入：
  - 外部开发者门户
  - 在线调试 / 发请求
  - CSRF 自动注入调试
  - 为每个动态模型自动生成独立文档门户

## 与发布网关的边界

- `06A` 只负责内部文档能力。
- 对外发布协议、`Publish Endpoint`、OpenAI / Claude 兼容接口、线上流量切换等，统一下沉到 `06B 发布网关`。

## 当前结论摘要

- 内部 API 文档已不是未来设计，而是当前实现基线。
- 后续该专题以 [2026-04-14-settings-api-docs-on-demand-design.md](../../2026-04-14-settings-api-docs-on-demand-design.md) 为设计真值继续推进。
