# 2026-03-13 Publish Waiting Lifecycle Drilldown

## 背景

- `docs/dev/runtime-foundation.md` 已把 `API 调用开放` 继续列为当前 P0 主线，但 publish activity 里对 waiting run 的可见性仍偏薄，主要只有 `run_status / current_node / waiting_reason`。
- 当前项目虽然已有 `/runs/{run_id}` 诊断页，但 workflow 页面里的 publish governance 仍缺少一层“在 binding 语境里快速回答 waiting 卡在哪、有没有 callback ticket、是否存在 scheduled resume”的轻量钻取事实。
- 这类信息已经存在于 `runs / node_runs / run_callback_tickets / checkpoint_payload`，因此这轮优先目标不是新建第二套运行态协议，而是把现有事实重新聚合回 publish activity。

## 目标

- 在 published endpoint invocation 审计项里补齐 waiting lifecycle 摘要。
- 继续坚持 publish governance 复用 runtime 事实来源，不让前端靠页面抓取或临时推断补洞。
- 保持改动聚焦在 P0 主线，不插队去做完整 streaming / SSE。

## 本轮实现

- 后端为 `PublishedEndpointInvocationItem` 新增 `run_waiting_lifecycle`：
  - `node_run_id`
  - `node_status`
  - `waiting_reason`
  - `callback_ticket_count`
  - `callback_ticket_status_counts`
  - `scheduled_resume_delay_seconds`
  - `scheduled_resume_reason`
  - `scheduled_resume_source`
  - `scheduled_waiting_status`
- `api/app/api/routes/published_endpoint_activity.py` 现在会：
  - 先按 `Run.current_node_id` 优先选中当前 waiting node run
  - 回退到同一 run 下 `status=waiting` 的 node run，避免 run-level 指针漂移时丢失 waiting 事实
  - 聚合该 node run 对应的 callback tickets 与 `scheduled_resume` checkpoint
- 前端 `workflow-publish-activity-panel-sections.tsx` 已把上述 waiting lifecycle 摘要直接展示在 invocation 卡片里，减少用户为确认“当前是否卡在 callback / retry waiting”而频繁跳转页面。

## 影响范围

- `api/app/schemas/workflow_publish.py`
- `api/app/api/routes/published_endpoint_activity.py`
- `api/tests/test_published_native_async_routes.py`
- `api/tests/test_published_protocol_async_routes.py`
- `web/lib/get-workflow-publish.ts`
- `web/components/workflow-publish-activity-panel-sections.tsx`

## 验证方式

- 在 `api/` 下优先使用现有 `.venv` + `uv`：
  - `./.venv/Scripts/uv.exe run pytest tests/test_published_native_async_routes.py tests/test_published_protocol_async_routes.py -q`

## 结论

- 这轮没有声称“开放 API 已完整完成”，但把 waiting / async lifecycle drilldown 往前推进了一步：publish governance 现在可以直接展示 callback ticket 与 scheduled resume 的摘要，而不只停留在 `waiting_reason`。
- 该改动继续遵守当前架构边界：事实仍来自 `runs / node_runs / run_callback_tickets / checkpoint_payload`，前端只负责消费聚合结果。

## 下一步

1. 继续承接 `API 调用开放` 主线，优先补 `streaming / SSE` 与协议流式事件映射。
2. 在 publish governance 内继续补 waiting / async lifecycle 的长期趋势与单次 invocation drilldown，而不是把治理细节散落到多个面板。
3. 继续治理 `api/app/services/runtime.py` 与 `api/tests/test_runtime_service.py` 的结构热点，保持 Durable Runtime 可持续演进。
