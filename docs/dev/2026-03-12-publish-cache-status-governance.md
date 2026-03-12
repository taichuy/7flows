# 2026-03-12 Publish Cache Status Governance

## 背景

上一轮提交 `feat: add publish api key governance signals` 已把 published endpoint 的 activity audit 推进到：

- `request_surface`
- `reason_code`
- `api_key_usage`
- `timeline` 中的 API key / protocol / reason 信号

但 publish governance 里仍有一个明显缺口：

- 后端 summary 与 facets 已统计 `cache hit / miss / bypass`
- binding 级 invocation query 却还不能按 `cache_status` 过滤
- timeline 也没有把 cache 状态分布显式返回给前端

这会让开放 API 的治理仍停留在“知道总 cache 命中多少”，却无法回答：

- 当前列表里只想看 cache hit 的调用记录怎么办
- 某个时间桶里是 miss 在抬升，还是调用本来就都 bypass
- cache 问题排查时，如何和 `request_surface / api_key / reason_code` 一起组合筛选

## 目标

在不引入新执行链、不改动 publish binding 主模型的前提下，继续承接 `API 调用开放` 主线，为 published invocation audit 补齐 cache 维度治理能力：

- binding 级 `/invocations` 支持 `cache_status` 过滤
- 前后端 contract 同步暴露 `cache_status`
- timeline bucket 返回固定三态 `hit / miss / bypass`
- workflow 页面治理面板可直接按 cache 状态筛选，并在时间桶里观察 cache 分布

## 实现

### 1. 后端 audit/query 扩展

涉及文件：

- `api/app/services/published_invocations.py`
- `api/app/api/routes/published_endpoint_activity.py`
- `api/app/schemas/workflow_publish.py`

本轮改动：

- `PublishedEndpointInvocationFilters` 新增 `cache_status`
- `/api/workflows/{workflow_id}/published-endpoints/{binding_id}/invocations` 新增 `cache_status` 查询参数
- `PublishedInvocationService._build_binding_statement()` 将 `cache_status` 下推到数据库过滤
- `list_for_binding()` / `build_binding_audit()` 全链路透传该过滤条件
- timeline bucket 新增 `cache_status_counts`
- timeline 中的 cache 状态固定返回 `hit / miss / bypass` 三态，避免前端自行补零

### 2. 前端治理面板承接

涉及文件：

- `web/lib/get-workflow-publish.ts`
- `web/lib/get-workflow-publish-governance.ts`
- `web/lib/workflow-publish-governance.ts`
- `web/lib/published-invocation-presenters.ts`
- `web/app/workflows/[workflowId]/page.tsx`
- `web/components/workflow-publish-activity-panel.tsx`
- `web/components/workflow-publish-traffic-timeline.tsx`

本轮改动：

- publish governance active filter 增加 `cacheStatus`
- workflow 页面可从 `publish_cache_status` 解析并回填当前过滤状态
- invocation activity 面板新增 `Cache status` 过滤下拉
- active filter chips 新增 cache 标签
- recent items 中的 cache 状态改用统一 label
- timeline bucket 新增 cache 状态标签展示

### 3. 验证补齐

涉及文件：

- `api/tests/test_workflow_publish_activity.py`

新增或补强验证：

- 过滤返回的 `filters` 结构同步带上 `cache_status`
- 非缓存 binding 仍会稳定返回 `bypass` 统计
- timeline bucket 返回 `cache_status_counts`
- cache-enabled published endpoint 可按 `cache_status=hit` 正确过滤并返回对应 timeline

## 影响范围

- 继续增强 `API 调用开放` 的治理可见性，而不是新增新的 runtime 分支
- 保持 publish binding / gateway / invocation audit 的现有解耦方向
- 为后续 streaming / SSE 继续补治理区块提供更完整的筛选基础

## 验证方式

后端：

```powershell
cd api
.\.venv\Scripts\uv.exe run pytest tests\test_workflow_publish_activity.py
```

前端：

```powershell
web\node_modules\.bin\tsc.cmd --noEmit -p web\tsconfig.json
```

## 当前结论

- 上一轮提交需要承接，而且承接方向仍然是 `API 调用开放`
- 当前这轮不是继续堆基础框架，而是在已有 publish governance 主线上补一个真实可用的治理维度
- 基础框架已经足以支撑继续沿主业务补完整度，但要继续控制 `published_invocations.py`、`runtime.py` 与几个大测试文件的体量

## 下一步

按优先级建议继续：

1. 把 streaming / SSE 的协议治理信号接进同一条 publish binding + invocation audit 主线
2. 继续补长期趋势视图，避免 timeline 只覆盖短窗口
3. 若 publish governance 继续扩张，优先拆 `published_invocations.py` 的 query / aggregation 子职责
