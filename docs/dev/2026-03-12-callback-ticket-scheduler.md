# 2026-03-12 Callback Ticket Scheduler

## 背景

上一轮提交 `feat: add callback ticket cleanup governance` 已经把 callback ticket cleanup 做成独立 service、API 和 worker task，但系统仍缺少周期调度入口。

这会带来一个明显断点：

- 手动治理能力已存在
- worker 也能消费 cleanup task
- 但如果没有 Celery beat / scheduler 进程，过期 ticket 不会自动清理

这与 `docs/dev/runtime-foundation.md` 里 “callback ticket 周期自动清理调度” 仍未完成的事实一致，也意味着上一轮提交之后需要继续承接。

## 目标

- 把 callback ticket cleanup 从“手动治理能力”推进到“可周期执行的系统治理能力”
- 保持 callback ticket 生命周期治理继续独立于 `runtime.py`
- 让本地源码模式和 Docker 全栈模式都具备明确的 scheduler 启动方式

## 实现

### 1. Celery beat schedule

在 `api/app/core/celery_app.py` 中注册 `runtime.cleanup_callback_tickets` 的 beat schedule，并通过以下配置控制：

- `SEVENFLOWS_CALLBACK_TICKET_CLEANUP_SCHEDULE_ENABLED`
- `SEVENFLOWS_CALLBACK_TICKET_CLEANUP_INTERVAL_SECONDS`

默认行为：

- 开启自动调度
- 每 300 秒投递一次 cleanup task
- 继续复用既有 `runtime.cleanup_callback_tickets` task，不另起第二套治理逻辑

### 2. Docker scheduler 进程

在 `docker/docker-compose.yaml` 中新增独立 `scheduler` 服务，命令为：

```powershell
uv run celery -A app.core.celery_app.celery_app beat --loglevel INFO
```

这样可以保持：

- `worker` 继续负责消费任务
- `scheduler` 负责周期投递
- 不把 beat 和 worker 混在同一进程里，避免后续调度职责继续回卷到单点

### 3. 本地开发入口与样例配置

同步更新：

- `api/.env.example`
- `docker/.env.example`
- `README.md`
- `api/README.md`

让本地和 Docker 启动方式都显式承认 scheduler 的存在，而不是默认只有 API + worker。

### 4. 测试

新增 `api/tests/test_celery_app.py`，覆盖：

- 开启调度时，`runtime.cleanup_callback_tickets` 会进入 beat schedule
- 关闭调度时，不会注册该 schedule

## 影响范围

- callback ticket 自动过期治理
- Celery 调度入口
- Docker 全栈启动拓扑
- 本地开发命令与文档

## 架构判断

这轮改动继续强化了当前分层，而不是增加耦合：

- cleanup 逻辑仍在 `RunCallbackTicketCleanupService`
- worker task 仍在 `api/app/tasks/runtime.py`
- scheduler 只负责“何时投递”，不拥有 cleanup 业务逻辑
- `RuntimeService` 没有因为周期治理继续膨胀

因此它是对最近提交的直接承接，也符合当前“Phase 1 MVP 稳定化”优先于继续堆砌 `runtime.py` 的方向。

## 验证

- `api/.venv/Scripts/uv.exe run pytest api/tests/test_celery_app.py api/tests/test_run_callback_ticket_routes.py`

## 后续

按优先级仍建议继续推进：

1. callback ticket 更强鉴权与系统诊断治理可见性
2. publish endpoint 限流、cache 与开放协议映射
3. scheduler / worker 的 dead-letter、去重、重投与更强观测
