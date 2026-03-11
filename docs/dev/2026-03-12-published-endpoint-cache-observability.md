# Published Endpoint Cache Observability

## 背景

`published endpoint cache` 已经开始进入后端主线，但当前发布治理里仍有一个事实缺口：

- native publish 请求已经可能直接命中缓存
- invocation audit 里却看不出本次请求到底是 `cache hit` 还是 `real execution`
- 这样会把“开放 API 请求量”和“真实 workflow 执行量”混在一起，削弱发布治理、运行追溯和后续前端可视化的价值

这和项目已经明确的“运行追溯必须基于机器可读事实层，而不是只靠前端摘要面板”存在冲突。

## 目标

- 给 published invocation 补上缓存命中事实，区分 `hit / miss / bypass`
- 让 publish binding 列表和 invocation audit 可以直接展示 cache effectiveness
- 保持 cache 能力继续挂在 publish binding 主线上，不把统计逻辑塞回 runtime 主循环

## 决策与实现

### 1. Invocation 记录新增 `cache_status`

在 `workflow_published_invocations` 上新增 `cache_status`：

- `hit`
  - 本次请求直接复用 cache entry 返回
- `miss`
  - 当前 binding 开启了 cache，但本次没有命中，实际执行了 workflow
- `bypass`
  - 本次请求没有进入 cache 判定路径，例如 endpoint 未启用 cache、请求在鉴权/协议校验阶段就被拒绝

这让 invocation 审计不再把缓存请求伪装成真实执行。

### 2. Gateway 只在 cache 生效路径内打 `hit/miss`

`PublishedEndpointGatewayService` 不再默认把所有成功请求视为 `MISS`，而是：

- 先判断 binding 是否真的启用了 cache
- 只有进入 cache 判定路径后才会标记 `miss` 或 `hit`
- 否则统一记为 `bypass`

这样可以避免“明明没开 cache，却在审计里显示 miss”的误导。

### 3. 发布治理返回结构补 cache summary

`PublishedInvocationSummary` 和 invocation facets 新增：

- `cache_hit_count`
- `cache_miss_count`
- `cache_bypass_count`
- `last_cache_status`
- `cache_status_counts`

这意味着：

- `/api/workflows/{workflow_id}/published-endpoints`
  - 返回的 `activity` 已可直接显示 cache effectiveness 摘要
- `/api/workflows/{workflow_id}/published-endpoints/{binding_id}/invocations`
  - 返回的 summary/facets/items 已可区分缓存命中与真实执行

## 影响范围

- 发布态调用审计
- 发布治理列表摘要
- 后续前端开放 API 治理页、缓存命中趋势和系统诊断接入

## 验证

- 补充 `api/tests/test_workflow_publish_routes.py`
- 覆盖 cache 命中后：
  - `X-7Flows-Cache` 仍按 `HIT/MISS` 返回
  - invocation summary 会统计 `hit/miss/bypass`
  - invocation items 会逐条返回 `cache_status`
  - publish binding 列表的 `activity` 会带 cache 命中摘要

## 当前结论

这一步不是新增第二套监控，而是把 publish cache 继续收口到既有 `workflow_published_invocations` 治理事实里。后续如果要做前端趋势图或更细系统诊断，可以直接复用这一层数据，而不必重新发明一套 cache telemetry。

## 下一步

1. 基于当前 `cache_status` 继续补 binding 级 cache inventory / active entry summary，解决“命中了多少次”和“当前缓存里有什么”之间的视图断层。
2. 把 cache / rate limit 两组治理事实接回前端开放 API 管理页，避免发布能力停留在后端可用、前端不可见。
3. 在同一条 publish binding 主线上继续推进 OpenAI / Anthropic 协议映射，而不是为兼容协议复制第二套发布执行链。
