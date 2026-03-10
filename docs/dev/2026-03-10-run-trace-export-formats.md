# Run Trace 导出格式

## 背景

上一轮已经把 run 诊断页接到了 `/api/runs/{run_id}/trace`，并提供了“导出当前 trace JSON”的入口。

但当时导出仍然停留在：

- 直接打开原始 `/trace` JSON
- 没有显式导出接口
- 没有面向逐行消费的 JSONL 形态

这会让“导出”和“在线查询”混在一起，也不利于后续回放包或机器离线消费能力继续演进。

## 目标

补一个明确的 trace 导出入口，并先支持两种稳定格式：

1. `json`
   - 适合完整保存当前 trace 查询结果
2. `jsonl`
   - 适合逐行处理、离线分析和后续 replay 管道

同时要求：

- 不重复实现一套新的 trace 查询逻辑
- 导出继续复用现有过滤条件
- 前端直接暴露显式格式按钮，而不是让用户手工拼 URL

## 实现

### 1. 新增 `/api/runs/{run_id}/trace/export`

更新：

- `api/app/api/routes/runs.py`

新增端点：

- `GET /api/runs/{run_id}/trace/export`

支持沿用 `/trace` 现有过滤参数：

- `cursor`
- `event_type`
- `node_run_id`
- `created_after`
- `created_before`
- `payload_key`
- `before_event_id`
- `after_event_id`
- `limit`
- `order`

并新增：

- `format=json | jsonl`

### 2. 抽共享 trace 构建逻辑

为了避免 `/trace` 和 `/trace/export` 各自维护一套查询逻辑，这轮把 trace 组装收敛为：

- `_load_trace_request()`
- `_create_run_trace()`

这样：

- `/trace` 继续返回结构化 `RunTrace`
- `/trace/export` 复用同一批过滤、游标和 summary 逻辑

### 3. JSONL 导出结构

当前 `jsonl` 导出采用两类记录：

- 第一行：`record_type = "trace"`
  - 包含 `run_id`、`exported_at`、`filters`、`summary`
- 后续每行：`record_type = "event"`
  - 对应单条 trace event

这样比“只导事件行”更稳一些，因为离线消费者不需要额外找配套元数据文件就能恢复当前窗口语义。

### 4. 前端导出按钮升级为显式格式

更新：

- `web/lib/get-run-trace.ts`
- `web/components/run-diagnostics-panel.tsx`

新增：

- `buildRunTraceExportUrl()`

前端现在会在当前过滤条件下直接给出：

- 导出 trace JSON
- 导出 trace JSONL

原始 `/events` API 入口仍保留，方便直接查看完整原始事件列表。

## 影响范围

- `api/app/api/routes/runs.py`
- `api/tests/test_run_routes.py`
- `web/lib/get-run-trace.ts`
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

- 带压缩包或多文件清单的 replay export
- JSONL 导出里的 artifact 大对象拆分或外链引用
- 前端本地直接下载并命名文件，而不是依赖浏览器打开下载链接

## 下一步

更连续的后续顺序是：

1. 继续评估 replay export 是否需要在 `json/jsonl` 之外单独增加更面向回放的包格式。
2. 如果 trace 规模继续上升，再评估导出分页和流式写出，而不是当前一次性构造完整响应。
3. 在前端考虑把 replay offset 继续组织成更直观的时间线视图。 
