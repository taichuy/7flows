# 2026-03-12 Publish Async Run Status Governance

## 背景

上一轮已经落地 `feat: add published protocol async bridge`，让 `native / openai / anthropic` 的 async 发布入口可以在 `run.status=waiting` 时诚实返回 `202 + run detail`。

但 publish governance 侧仍然只有 `status / request_surface / cache_status / reason_code / api_key` 这些维度，无法直接回答：

- 哪些 published invocation 已经进入 runtime，但仍卡在 `waiting`
- async bridge 带来的 `run_status=waiting` 与普通 `status=succeeded` 如何区分治理
- workflow 页面是否能直接按 run state 过滤最近调用与时间桶趋势

这会让“async bridge 已接入”停留在后端事实层，无法真正转化为开放 API 治理能力。

## 目标

- 为 published invocation audit 增加 `run_status` 维度
- 让 workflow 页可以按 `run_status` 过滤 publish activity
- 让 timeline 和 activity summary 能显式看到 `waiting / succeeded / failed` 等运行态分布
- 在不引入第二套审计模型的前提下，继续复用既有 `workflow_published_invocations` 事实层

## 实现

### 后端

- `GET /api/workflows/{workflow_id}/published-endpoints/{binding_id}/invocations`
  - 新增 `run_status` 查询参数
  - `filters` 返回体新增 `run_status`
  - `facets` 返回体新增 `run_status_counts`
  - `timeline[]` 返回体新增 `run_status_counts`
- `PublishedInvocationService`
  - 在 statement 层支持 `run_status` 过滤
  - 聚合 `run_status` facet，并在时间桶中统计 `run_status_counts`
  - 保持既有 `request_surface / cache_status / reason_code / api_key` 维度不变

### 前端

- workflow 页面 query 参数新增 `publish_run_status`
- publish governance snapshot 会把 `runStatus` 透传到 `/invocations`
- `workflow-publish-activity-panel`
  - 新增 `Run status` 筛选项
  - active chips 新增 run state 标签
  - traffic mix 区块新增 `Run states` 摘要
- `workflow-publish-traffic-timeline`
  - 每个时间桶新增 run state 标签，直接显示 top run states

## 影响范围

- `api/app/api/routes/published_endpoint_activity.py`
- `api/app/schemas/workflow_publish.py`
- `api/app/services/published_invocations.py`
- `web/app/workflows/[workflowId]/page.tsx`
- `web/components/workflow-publish-activity-panel.tsx`
- `web/components/workflow-publish-traffic-timeline.tsx`
- `web/lib/get-workflow-publish*.ts`
- `web/lib/published-invocation-presenters.ts`

## 验证

- `api/.venv/Scripts/uv.exe run pytest tests/test_workflow_publish_activity.py tests/test_published_native_async_routes.py tests/test_published_protocol_async_routes.py -q`
- `web`: `pnpm exec tsc --noEmit`

结果：

- 发布活动相关后端测试 `8 passed`
- 前端 TypeScript 静态检查通过

## 当前结论

- 最新一轮 async bridge 需要承接，而且优先级判断是正确的
- 当前基础框架已经足够支撑继续推进主业务，不需要回头重做一套发布审计模型
- publish governance 现在已经能把“协议入口成功受理，但 runtime 仍在 waiting”作为独立治理信号展示出来

## 后续

1. 把 `waiting` 请求继续推进到真正的 async lifecycle 治理：
   - async invoke 列表
   - run detail 快捷跳转
   - callback / resume / timeout 信号联动
2. 继续补 streaming / SSE：
   - 统一事件流映射
   - OpenAI / Anthropic 协议面可见性
3. 控制 publish governance 相关长文件继续增长：
   - `api/app/services/published_invocations.py`
   - `web/components/workflow-publish-activity-panel.tsx`
