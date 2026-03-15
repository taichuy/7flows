# 2026-03-15 WAITING_CALLBACK 退避摘要与 late callback 追踪

## 背景

- `d960378 feat: defer run resumes until commit` 已把 cleanup / approval / runtime waiting 的 resume 派发统一改成 after-commit。
- 但 `WAITING_CALLBACK` 主链还缺一层 durable 语义：
  - repeated expiry 仍然默认 `0s` 立即重试，外部 callback 长时间缺席时容易形成高频 resume 抖动；
  - late callback 缺少统一事件和 checkpoint 摘要，execution view 很难回答“这个节点到底等了几轮、过期过几次、是否已经收到迟到回调”。

## 目标

- 为 callback ticket cleanup 增加最小可用的 repeated expiry backoff，避免 repeated waiting 长期保持零延迟抖动。
- 把 late callback / expired / consumed / scheduled resume 收口进统一的 node checkpoint 摘要，供 execution view 和后续 published waiting surface 复用。
- 保持 `RuntimeService` 仍是唯一 orchestration owner，不在 callback helper 里再造第二条流程控制语义。

## 实现

- 新增 `api/app/services/callback_waiting_lifecycle.py`
  - 统一维护 `callback_waiting_lifecycle` checkpoint 摘要。
  - 收口 `issued / expired / consumed / canceled / late_callback / resume_schedule` 计数与最近一次状态。
  - 提供 repeated expiry backoff 规则：首轮 `0s`，之后递增到 `5s / 15s / 30s / 60s`。
- `api/app/services/runtime_lifecycle_support.py`
  - 节点进入 `waiting_callback` 时写入 wait cycle / issued ticket 摘要。
  - 等待状态离开时，把 cancel 结果同步进 lifecycle 摘要。
- `api/app/services/run_callback_ticket_cleanup.py`
  - cleanup 过期 ticket 时写入 expired 摘要。
  - 调度 resume 时根据 repeated expiry 计算 delay，并把 `backoff_attempt` 写进 `scheduled_resume` checkpoint 与 `run.resume.scheduled` 事件。
- `api/app/services/runtime_run_support.py`
  - callback 成功消费后写入 consumed 摘要。
  - stale / expired / left-waiting 的 callback 统一追加 `run.callback.ticket.late` 事件，并把 late callback 状态写入 checkpoint 摘要。
- `api/app/schemas/run_views.py` + `api/app/services/run_views.py`
  - execution view 新增 `callback_waiting_lifecycle` 结构化字段，带出 wait cycles、expired count、late callbacks、最近一次 resume/backoff。
- `web/lib/get-run-views.ts` + `web/components/run-diagnostics-execution-sections.tsx`
  - run diagnostics execution 面板新增 callback lifecycle chips，直接展示 repeated waiting 与 backoff 摘要。

## 影响范围

- repeated callback expiry 不再永远 `0s` 立即 resume，降低 callback 缺席时的无意义抖动。
- late callback 不再只有“接口返回 expired/ignored”这一个表象，`run_events` 和 node checkpoint 都能回答发生了什么。
- execution view 现在能直接暴露 callback waiting lifecycle，后续 published waiting surface 若要复用，只需要复用同一事实结构。

## 验证

- `api/.venv/Scripts/uv.exe run pytest -q tests/test_run_callback_ticket_routes.py tests/test_run_routes.py tests/test_run_view_routes.py`
- `api/.venv/Scripts/uv.exe run pytest -q`
- `api/.venv/Scripts/uv.exe run ruff check app/services/callback_waiting_lifecycle.py app/services/runtime_lifecycle_support.py app/services/run_callback_ticket_cleanup.py app/services/runtime_run_support.py app/schemas/run_views.py app/services/run_views.py tests/test_run_callback_ticket_routes.py tests/test_run_routes.py tests/test_run_view_routes.py`
- `web/pnpm exec tsc --noEmit`
- `web/pnpm lint`
- `git diff --check`

## 未决问题 / 下一步

1. 继续给 `WAITING_CALLBACK` 增加最大重试/终止策略，避免 repeated waiting 只有退避没有 stop policy。
2. 把同一套 lifecycle 摘要继续接到 published waiting / invocation detail，而不是只停留在 execution view。
3. 继续推进 publish export 的敏感访问控制与通知 worker / inbox，完成当前两个并列的 P0 主线。
