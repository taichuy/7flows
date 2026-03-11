# 2026-03-12 Published Endpoint Rate Limits

## 背景

最近几轮已经把开放 API 主线推进到：

- `publish binding + lifecycle`
- `native` 发布调用
- `alias/path`
- `api_key`
- invocation audit 与时间窗筛选

但发布态仍缺少最基础的托管治理能力。没有限流，`API 调用开放` 仍然只算“可调用”，还不能算“可托管”。

同时，这一层能力应继续挂在 publish binding 上，而不是反向把治理逻辑塞回 runtime 主循环或 workflow CRUD。

## 目标

- 为 `workflow_published_endpoints` 增加最小 `rate_limit_policy`
- 让 publish definition 能声明发布限流，而不是让调用入口各自私有配置
- 在 `PublishedEndpointGatewayService` 中执行限流，保持发布网关对外入口统一收口
- 继续复用 `workflow_published_invocations` 作为治理事实来源，不新增第二套限流审计模型

## 实现

### 1. 发布定义支持 rate limit

在 `WorkflowPublishedEndpointDefinition` 中新增：

- `rateLimit.requests`
- `rateLimit.windowSeconds`

并将其持久化到 `workflow_published_endpoints.rate_limit_policy`。

这让限流配置继续绑定：

- `workflow_version`
- `compiled_blueprint`
- `published endpoint binding`

而不是漂浮在运行态内存或某条独立配置链上。

### 2. 发布查询接口返回治理配置

`GET /api/workflows/{workflow_id}/published-endpoints` 现在会把 `rate_limit_policy` 直接返回给前端治理视图。

这让发布治理页后续可以直接显示：

- 当前窗口大小
- 请求上限
- 不同 binding 的治理差异

### 3. 发布网关执行限流

`PublishedEndpointGatewayService` 在实际执行 workflow 前，会读取 binding 的 `rate_limit_policy` 并基于 invocation audit 做窗口计数。

当前最小规则：

- 只统计 `succeeded / failed`
- `rejected` 不占用配额
- 超限时返回 `429`
- 超限事件继续记入 `workflow_published_invocations`

`rejected` 不计入配额的原因是：

- 这类请求通常是鉴权失败或当前发布配置不支持
- 它们没有真正进入 workflow 执行
- 限流应优先保护“已被系统接受的执行负载”，而不是把治理错误和业务负载混在一起

### 4. 审计事实继续复用 invocation 表

本轮没有额外新增“限流命中表”。

仍然复用：

- `workflow_published_invocations.status`
- `workflow_published_invocations.error_message`
- 既有 activity summary / facets / timeline

这样发布治理、调用审计和后续趋势面板仍围绕一套事实源演进。

## 影响范围

- `api/migrations/versions/20260312_0016_publish_endpoint_rate_limits.py`
- `api/app/models/workflow.py`
- `api/app/schemas/workflow.py`
- `api/app/schemas/workflow_publish.py`
- `api/app/services/workflow_publish.py`
- `api/app/services/published_gateway.py`
- `api/app/services/published_invocations.py`
- `api/app/api/routes/workflow_publish.py`
- `api/tests/test_workflow_publish_routes.py`

## 验证

已执行：

```powershell
cd api
.\.venv\Scripts\uv.exe run pytest tests/test_workflow_publish_routes.py
```

验证结果：

- `tests/test_workflow_publish_routes.py` 14 项通过

其中新增确认：

- rate limit 配置会被持久化并返回给查询接口
- 超限请求会返回 `429`
- `rejected` 请求不会占用成功/失败配额

## 当前判断

- 这轮属于对 `API 调用开放` P0 主线的直接承接，不是偏离主业务的新抽象
- 架构上仍保持解耦：
  - 声明在 workflow publish definition
  - 持久化在 publish binding
  - 执行在 published gateway
  - 计数与审计在 invocation service
- 这也说明基础框架已经足够支撑继续补“发布托管能力”，不需要再回头重写底座

## 下一步

按优先级建议继续推进：

1. publish endpoint cache 与更细的 API key 趋势观测
2. callback ticket 更强鉴权与系统诊断可见性
3. OpenAI / Anthropic 协议映射继续挂到同一条 publish binding 主线
