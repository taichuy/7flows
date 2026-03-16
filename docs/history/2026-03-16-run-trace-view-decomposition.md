# 2026-03-16 Run Trace View 拆层

## 背景

- `docs/dev/runtime-foundation.md` 已把 run diagnostics / trace export 视为持续治理热点之一。
- `api/app/services/run_trace_views.py` 在承接 route 下沉后继续堆积 cursor、filter、payload key、summary 和 trace event 序列化责任，已进入“继续开发不会立刻阻断，但新增能力再叠加会重新膨胀”的区间。
- 本轮目标不是新增 trace 功能，而是沿既有主线继续做可持续拆层，降低后续 run diagnostics、export governance 和 operator explanation 的改动阻力。

## 目标

- 把 run trace 的 helper 责任从单文件 service 中拆开。
- 保持 `/api/runs/{run_id}/trace` 与 export 相关行为不变。
- 为后续 diagnostics / export 相关迭代补一个更稳定的测试锚点。

## 实现

- 新增 `api/app/services/run_trace_cursor.py`，承接 trace cursor encode / decode / build。
- 新增 `api/app/services/run_trace_filters.py`，承接 datetime、payload key 和 event filter 逻辑。
- 新增 `api/app/services/run_trace_builder.py`，承接 trace summary、分页 cursor 与 event item 组装。
- `api/app/services/run_trace_views.py` 退回更轻的 facade，只保留 route-facing 的 `load_run_trace`、导出文件名与 JSONL 序列化入口。
- 新增 `api/tests/test_run_trace_views.py`，补 cursor round-trip、invalid cursor、payload key 收集与 descending trace page 构造测试。

## 影响范围

- `api/app/api/routes/runs.py` 继续复用 `run_trace_views` 的公开入口，不需要改 route contract。
- run diagnostics / trace export 后续若继续补 filter、cursor 或 summary 逻辑，可优先落到拆出的 helper，而不是重新把复杂度堆回 facade。
- 这次改动直接支撑了“继续推进项目完整度而不是回头重搭框架”的主线：运行追溯这条事实链变得更容易维护，也更适合继续补 operator explanation。

## 验证

- `cd api; .\.venv\Scripts\uv.exe run pytest -q tests/test_run_trace_views.py tests/test_run_routes.py tests/test_run_trace_export_access.py`
  - 结果：`26 passed in 1.19s`
- `cd api; .\.venv\Scripts\uv.exe run ruff check app/services/run_trace_views.py app/services/run_trace_cursor.py app/services/run_trace_filters.py app/services/run_trace_builder.py tests/test_run_trace_views.py`
  - 结果：通过

## 下一步

- 优先继续治理 `workspace_starter_templates.py`、`runtime_node_dispatch_support.py` 与 `agent_runtime.py` 这类仍然较长的 orchestration 热点。
- 在 run diagnostics 主线上，下一步更适合补 security policy explanation、callback / approval 联合排障和 evidence/detail presenter 的进一步拆层，而不是再回到 trace facade 里堆逻辑。
