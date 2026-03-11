# 2026-03-12 Published Endpoint Activity

## 背景

上一轮已经把 published endpoint 的 `alias/path` 稳定地址语义补齐，并让 native published invoke 可以沿 `workflow_version + compiled_blueprint` 运行。

但发布主线仍有一个明显缺口：

- 发布调用成功或失败后，缺少独立的活动事实层；
- publish binding 列表虽然能展示生命周期，但还看不到最近是否被调用、调用是否被拒绝、最近一次运行挂到了哪个 run；
- 后续如果继续做开放 API 管理、审计、限流、缓存和协议映射，缺少最基础的发布活动追踪入口。

这会让 `API 调用开放` 这条主业务线停留在“可调用”，但还不到“可治理”。

## 目标

补齐一层最小但真实可用的 published endpoint activity：

- 每次 native published invoke 都形成独立持久化记录；
- publish binding 列表能返回活动摘要；
- 提供单独的 invocation 查询接口，供后续发布治理页、诊断页和外部开放 API 管理继续承接；
- 继续保持 publish 调用、publish binding 管理和 runtime 执行解耦，不把观测逻辑塞回 `runtime.py`。

## 实现方式

### 1. 新增发布活动事实表

新增 `workflow_published_invocations`，记录：

- `workflow_id / binding_id / endpoint_id`
- `endpoint_alias / route_path`
- `protocol / auth_mode / request_source`
- `status`
- `api_key_id / run_id / run_status`
- `request_preview / response_preview`
- `duration_ms / created_at / finished_at`

当前只记录摘要预览，不直接把原始输入输出整包塞进活动表，避免把发布治理层做成高噪音日志层。

### 2. 发布调用自动落活动记录

`PublishedEndpointGatewayService` 现在在三种入口下统一写活动事实：

- `workflow_id + endpoint_id`
- `endpoint_alias`
- `route_path`

记录规则：

- binding 未命中时，仍返回 404，但不生成孤立活动记录；
- binding 命中后，如果因为 auth mode、API key、streaming 等原因被拒绝，会记录 `rejected`；
- 成功触发 runtime 后，会把 `run_id / run_status` 和响应摘要一并挂到活动记录；
- 如果 runtime 返回失败 run，则活动状态记为 `failed`，而不是简单记成“调用成功”。

### 3. 独立 publish activity 查询接口

新增接口：

- `GET /api/workflows/{workflow_id}/published-endpoints/{binding_id}/invocations`

返回：

- summary：总调用数、成功/失败/拒绝数、最近一次状态与 run
- items：最近调用列表

这样发布治理和运行追溯之间有了清晰的旁路：

- publish binding 负责版本、地址和生命周期；
- published gateway 负责对外调用入口；
- published activity 负责观测与审计摘要；
- runtime 继续只负责执行与 run 事实。

### 4. publish binding 列表补 activity 摘要

`GET /api/workflows/{workflow_id}/published-endpoints` 现在会额外返回 `activity` 摘要，便于前端直接展示：

- endpoint 是否被使用过
- 最近一次调用结果
- 最近一次调用挂到哪个 run

## 影响范围

- 后端模型与迁移：
  - `api/app/models/workflow.py`
  - `api/migrations/versions/20260312_0014_published_endpoint_invocations.py`
- 服务层：
  - `api/app/services/published_gateway.py`
  - `api/app/services/published_invocations.py`
- 路由与 schema：
  - `api/app/api/routes/workflow_publish.py`
  - `api/app/api/routes/published_endpoint_activity.py`
  - `api/app/schemas/workflow_publish.py`
- 测试：
  - `api/tests/test_workflow_publish_routes.py`

## 验证

在 `api/` 目录使用本地 `.venv` 执行：

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_workflow_publish_routes.py tests/test_published_endpoint_api_keys.py -q
```

结果：

- `13 passed`

本轮重点验证了：

- alias/path 调用会正确写 activity
- publish binding 列表会返回 activity 摘要
- 未实现 auth mode 的拒绝调用也会留下 `rejected` 活动记录
- API key 管理链路未被活动记录逻辑破坏

## 当前结论

这轮不是去补限流或兼容协议映射，而是先把发布层从“可调用”推进到“可观测、可治理起步”。

这样后续继续做：

- 发布治理页
- 限流 / cache
- OpenAI / Anthropic 协议映射
- 发布调用审计

时，不需要再回头重造发布活动事实层。

## 下一步

按优先级建议继续推进：

1. 在 publish activity 基础上补最小发布治理能力：
   - endpoint 级调用审计筛选
   - 最近失败原因聚合
   - API key 维度调用可见性
2. 补 publish endpoint 的限流与 cache contract：
   - 先定义 binding 级配置与事实字段
   - 再决定是否接入 Redis
3. 把 OpenAI / Anthropic 协议映射挂到同一条 publish binding + activity 链上，而不是各自独立实现入口
