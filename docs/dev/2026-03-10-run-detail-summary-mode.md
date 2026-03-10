# Run Detail 摘要模式

## 背景

上一轮已经把 run 诊断页接到了 `/api/runs/{run_id}/trace`，但 `GET /api/runs/{run_id}` 仍然默认返回整包 `events`。

这会带来两个直接问题：

- 前端 run 诊断页同时请求 `run detail` 和 `run trace` 时，会重复搬运同一批事件
- “给人看的摘要层”和“给机器读的 trace 层”虽然概念上已经分开，接口负载上却还没有真正分层

## 目标

把 `GET /api/runs/{run_id}` 收紧成更适合人类诊断层的接口：

1. 保留节点执行、输入输出、状态等摘要信息
2. 增加事件统计摘要，避免页面为了几个计数把整批 `events` 拉回来
3. 允许调用方显式关闭 `events` 下发
4. 保持现有默认行为兼容，不破坏已有 API 使用方

## 实现

### 1. `RunDetail` 补事件摘要字段

更新 `api/app/schemas/run.py`：

- `event_count`
- `event_type_counts`
- `first_event_at`
- `last_event_at`

同时将 `events` 改为带默认空数组的字段，便于摘要模式下返回 `[]`。

### 2. `GET /api/runs/{run_id}` 支持 `include_events`

更新 `api/app/api/routes/runs.py`：

- `get_run()` 新增查询参数 `include_events`
- 默认值保持 `true`
- 当 `include_events=false` 时：
  - 仍返回完整 run 摘要
  - 返回节点执行列表
  - `events` 置为空数组
  - 事件数量、类型分布和时间边界改由摘要字段承载

这样原有调用方保持兼容，而 run 诊断页可以切到更轻量的读取方式。

### 3. 前端 run 诊断页改为读取摘要模式

更新：

- `web/lib/get-run-detail.ts`
- `web/components/run-diagnostics-panel.tsx`

前端现在会调用：

```text
GET /api/runs/{run_id}?include_events=false
```

并改为依赖：

- `event_count`
- `event_type_counts`
- `first_event_at`
- `last_event_at`

而不是再从 `run.events` 自己做一次完整统计。

## 影响范围

- `api/app/api/routes/runs.py`
- `api/app/schemas/run.py`
- `api/tests/test_run_routes.py`
- `web/lib/get-run-detail.ts`
- `web/components/run-diagnostics-panel.tsx`
- `docs/dev/runtime-foundation.md`

## 验证

执行：

```powershell
cd api
E:\code\taichuCode\7flows\api\.venv\Scripts\python.exe -m pytest api/tests/test_run_routes.py

cd ..\web
pnpm lint
```

结果：

- 本轮开发结束后实测

## 当前边界

这轮仍然没有实现：

- `GET /api/runs/{run_id}` 按字段选择返回内容
- run detail 与 trace 的统一缓存或条件请求
- 更细粒度的 node-run 级聚合摘要

## 下一步

更连续的后续顺序是：

1. 评估是否需要让 run detail 再区分更显式的 `summary/full` 模式，而不只是布尔开关。
2. 若 run 诊断页继续增强，优先复用 trace 层而不是再把机器字段塞回 run detail。
3. 后续如果要做导出包或 replay 包，继续围绕 `trace` 扩展，而不是重新扩张 summary 接口。
