# Waiting Callback Ingress

## 背景

截至 `2026-03-11`，7Flows 的 Durable Runtime 已经具备：

- `waiting_tool / waiting_callback` 状态表达
- `POST /api/runs/{run_id}/resume` 的手动恢复入口
- `run_resume_scheduler + worker task` 的时间驱动恢复

但 `WAITING_CALLBACK` 仍缺一条正式的事件驱动闭环：

- 没有独立的 callback ticket 事实边界
- 外部系统无法通过稳定入口把结果送回 waiting run
- waiting tool 的最终结果无法回写到既有 `tool_call_records / run_artifacts / run_events`

这会导致 runtime 虽然已经“能等”，但还不算真正 durable。

## 目标

本轮目标不是一步做完整 callback bus，而是补齐 Phase 1.5 所需的最小正式回调闭环：

- 为 `waiting_callback` 生成独立 ticket
- 让外部系统能通过 ticket 投递 callback 结果
- callback 结果进入既有运行态事实，而不是旁路写入
- callback 到达后自动恢复 run
- 重复 callback 具备最小幂等处理

## 决策与实现

### 1. 新增 `run_callback_tickets` 作为正式持久化边界

新增运行态表：

- `run_callback_tickets`

当前保存：

- ticket
- `run_id`
- `node_run_id`
- `tool_call_id`
- `tool_id`
- `tool_call_index`
- `waiting_status`
- ticket 生命周期状态（`pending / consumed / canceled`）
- callback payload
- 创建、消费、取消时间

设计取舍：

- 当前采用 opaque ticket 作为最小鉴权载体
- 没有引入独立 secret/header 双因子，也没有先上 callback bus
- 先把“ticket -> run/node_run/tool_call” 的事实边界站稳

### 2. 把 callback ticket 生命周期从 `RuntimeService` 主循环中拆到独立服务

新增：

- `api/app/services/run_callback_tickets.py`

职责：

- 签发 ticket
- 查找 ticket
- 标记 consumed
- 取消同一 `node_run` 下仍 pending 的旧 ticket

这样做的目的，是避免继续把 ticket 管理逻辑塞回 `runtime.py` 的执行主循环。

### 3. `waiting_callback` 进入正式“挂起即发 ticket”语义

当节点进入 `waiting_callback` 时：

- runtime 会读取当前 waiting tool 的 `tool_call_id / tool_id / tool_call_index`
- 签发 callback ticket
- 把 ticket 摘要写入 `node_runs.checkpoint_payload.callback_ticket`
- 追加事件：
  - `run.callback.ticket.issued`

当前 ticket 摘要对调试和人工排障可见，但真正的生命周期事实仍以 `run_callback_tickets` 为准。

### 4. 新增正式回调入口

新增接口：

- `POST /api/runs/callbacks/{ticket}`

当前请求模型：

- `source`
- `result.status`
- `result.content_type`
- `result.summary`
- `result.structured`
- `result.meta`

处理流程：

1. 校验 ticket 是否存在且仍为 `pending`
2. 将 callback 结果通过 `ToolGateway` 标准化并回写原 waiting `tool_call_record`
3. 如需 artifact，则继续复用 `RuntimeArtifactStore`
4. 将 tool result 写回 `node_run.checkpoint_payload.tool_results`
5. 推进 `next_tool_index`
6. 写入事件：
   - `run.callback.received`
   - `tool.completed`
7. 自动调用 `resume_run()` 继续执行

### 5. 幂等与重复 callback 处理

当前最小策略：

- 首次成功消费 ticket：返回 `accepted`
- 已消费 ticket 的重复 callback：返回 `already_consumed`
- ticket 已失效或 run 已离开 waiting：返回 `ignored`

这不是最终形态，但已经能避免重复回调把同一 waiting run 再次推进。

## 影响范围

后端新增或更新的核心文件：

- `api/app/models/run.py`
- `api/app/services/run_callback_tickets.py`
- `api/app/services/tool_gateway.py`
- `api/app/services/runtime.py`
- `api/app/api/routes/runs.py`
- `api/app/schemas/run.py`
- `api/migrations/versions/20260311_0008_run_callback_tickets.py`

运行态事实新增：

- `run_callback_tickets`
- `run.callback.ticket.issued`
- `run.callback.received`

## 验证

已执行：

- `api/.venv/Scripts/python.exe -m pytest tests/test_runtime_service.py`
- `api/.venv/Scripts/python.exe -m pytest tests/test_run_routes.py`

验证覆盖：

- callback ticket 签发
- callback 结果回写 waiting tool
- 自动恢复 waiting run
- 重复 callback 幂等返回
- 既有 runtime / run routes 回归不破坏

## 当前边界

本轮仍未完成的部分：

- callback ticket 的过期策略与清理任务
- 更强的 callback 鉴权形态（例如 ticket + secret/header）
- callback bus / webhook relay / 外部事件订阅
- callback 来源审计和限流
- 更完整的 execution/evidence view 对 callback 事件的前端呈现

## 下一步

建议优先级：

1. 让 compiled blueprint 与 publish binding 真正成为稳定运行边界
2. 把 `run_artifacts / tool_call_records / ai_call_records / callback events` 组织成 execution view / evidence view 查询面
3. 为 callback ticket 增加过期、清理、来源审计与更强鉴权
