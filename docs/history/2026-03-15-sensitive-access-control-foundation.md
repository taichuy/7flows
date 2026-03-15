# 2026-03-15 敏感访问控制事实层与审批 API 基础落地

## 背景

- 用户要求重新阅读 `AGENTS.md`、`docs/dev/user-preferences.md`、`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/dev/runtime-foundation.md`，并判断：
  - 上一次 Git 提交做了什么，是否需要继续衔接
  - 基础框架是否已经写好
  - 架构是否足以支撑功能推进、插件扩展、兼容性、可靠性、稳定性与安全性
  - 哪些文件还偏长，需要继续解耦
  - 项目是否还能沿主业务持续推进到产品设计目标
- 最近几次提交仍在持续做“收热点、稳边界”的治理：`workflow schema`、`workflow routes`、`workflow library catalog` 都已进入更稳定的 service/schema 分层。
- 结合产品与技术设计复核后，当前项目的主要结论是：基础框架已经足够继续推进主业务，不需要重写执行骨架；但安全侧存在明显 P0 空缺——`SensitiveAccessRequest / ApprovalTicket / NotificationDispatch` 仍只停留在设计文档，尚未形成独立事实层与 API。

## 目标

1. 沿当前运行时主线补齐统一敏感访问控制的最小事实层，而不是重新造第二套流程语义。
2. 让“资源声明 → 访问请求 → 审批票据 → 通知投递”先变成真实可追溯的后端能力。
3. 保持边界诚实：本轮先落地 foundation，不假装已经完成 ToolGateway 拦截、审批恢复和完整通知链路。

## 实现

### 1. 新增敏感访问控制事实模型

- 新增 `api/app/models/sensitive_access.py`，包含：
  - `SensitiveResourceRecord`
  - `SensitiveAccessRequestRecord`
  - `ApprovalTicketRecord`
  - `NotificationDispatchRecord`
- 对应 Alembic 迁移落到 `api/migrations/versions/20260315_0021_sensitive_access_control.py`。
- `app.models.__init__` 已同步导出，确保 Alembic 与 `Base.metadata` 能加载新事实层。

### 2. 新增最小默认策略引擎与服务层

- 新增 `api/app/services/sensitive_access_control.py`，提供：
  - 敏感资源注册与列表
  - 访问请求创建与查询
  - 审批票据查询与决策
  - 通知投递查询
- 服务内置了一个**保守的 bootstrap 默认策略矩阵**：
  - `L0` 默认放行
  - `L1` 对非人类 `export / write` 先走审批
  - `L2` 对非人类 `read / use / invoke` 优先返回 `allow_masked`
  - `L3` 对高风险非人类导出/写入直接拒绝，其余高敏访问进入审批
- 这套策略只是当前代码事实，不等于最终产品策略引擎；后续仍要把策略计算与运行时拦截挂点打通。

### 3. 暴露敏感访问控制 API

- 新增 `api/app/api/routes/sensitive_access.py`，并接入 `api/app/main.py`。
- 当前开放的接口包括：
  - `POST /api/sensitive-access/resources`
  - `GET /api/sensitive-access/resources`
  - `POST /api/sensitive-access/requests`
  - `GET /api/sensitive-access/requests`
  - `GET /api/sensitive-access/approval-tickets`
  - `POST /api/sensitive-access/approval-tickets/{ticket_id}/decision`
  - `GET /api/sensitive-access/notification-dispatches`
- 当前 `in_app` 通知会直接落成 `NotificationDispatchRecord(status=delivered)`，作为最小 inbox 事实入口；外部通知 worker 仍未接入。

### 4. 运行态引用校验

- `request_access()` 现在会校验可选的 `run_id / node_run_id`：
  - `run_id` 不存在时返回明确错误，而不是把数据库外键异常暴露成 500
  - `node_run_id` 存在时会校验其归属 run，避免挂出悬空或错绑的审批事实

## 项目现状结论刷新

### 1. 上一次 Git 提交做了什么，是否需要衔接

- `547bcd8 refactor: split workflow node validation helpers` 继续在做 workflow schema 收口。
- 本轮没有偏离主线，而是在“框架已经能推进主业务”的前提下，转去补安全侧最明显的 P0 空缺。
- 因此结论是：**需要衔接，但不必机械延续“继续拆 schema”这条局部子线；当前更高优先级的是补足真正阻塞架构可信度的缺口。**

### 2. 基础框架是否已经设计并写好

- 结论维持：**已经写好到足以持续功能开发。**
- 后端 runtime、published surface、trace/evidence、workflow editor 支撑接口都不是空壳。
- 当前更需要的是沿现有骨架持续补安全、隔离、治理与可追溯细节，而不是推翻重来。

### 3. 架构是否满足功能推进、扩展性、兼容性、可靠性、稳定性、安全性

- **功能推进**：满足。核心编排、调试、发布和追溯主链已成立。
- **插件扩展与兼容性**：方向正确。依然坚持 Dify 插件生态兼容层旁挂，而不是让外部 DSL 进入内核。
- **可靠性 / 稳定性**：继续可推进。全量后端 `pytest` 已通过，说明当前骨架在持续收敛而不是漂移。
- **安全性**：本轮明显提升。敏感访问现在终于有独立事实层、审批票据与通知投递 API，但仍未进入 ToolGateway / credential / context / publish export 的真实拦截主链，所以安全闭环还未完成。

### 4. 哪些文件仍值得继续解耦

- 后端热点仍主要集中在：
  - `api/app/services/agent_runtime_llm_support.py`
  - `api/app/api/routes/runs.py`
  - `api/app/services/published_protocol_streaming.py`
  - `api/app/services/runtime_run_support.py`
- 前端热点仍主要集中在：
  - `web/components/run-diagnostics-execution-sections.tsx`
  - `web/components/workspace-starter-library.tsx`
  - `web/components/workflow-editor-workbench/use-workflow-editor-graph.ts`
- 本轮新增的敏感访问层已从一开始就拆成 model / schema / service / route / migration / test，避免再造单文件热点。

### 5. 主业务是否还可以持续推进到产品设计目标

- 可以，而且这轮实现进一步证明：当前更适合沿主业务闭环持续补强，而不是回头重搭框架。
- 现阶段最合理的推进方式仍是：
  - 保持 `7Flows IR` 与单一 runtime orchestration 主控
  - 继续把执行隔离、安全闭环、发布治理和调试追溯补到真实可用
  - 同时持续治理已有热点文件，避免新增能力再次回流成单体
- 当前仍未进入“只剩人工逐项界面设计与验收”的阶段，因此本轮**不运行**通知脚本。

## 影响范围

- 后端数据模型：新增敏感资源、访问请求、审批票据、通知投递四类事实层
- 后端 API：新增 `sensitive-access` 路由
- 迁移：新增 `20260315_0021_sensitive_access_control.py`
- 文档：更新 `docs/dev/runtime-foundation.md`

## 验证

在 `api/` 目录执行：

```powershell
.\.venv\Scripts\uv.exe run ruff check app/models/sensitive_access.py app/schemas/sensitive_access.py app/services/sensitive_access_control.py app/api/routes/sensitive_access.py tests/test_sensitive_access_routes.py
.\.venv\Scripts\uv.exe run pytest -q tests/test_sensitive_access_routes.py
.\.venv\Scripts\uv.exe run pytest -q
```

结果：

- changed-files `ruff check`：通过
- `pytest -q tests/test_sensitive_access_routes.py`：通过，`3 passed`
- 后端全量 `pytest -q`：通过，`231 passed`

补充：

- `git diff --check` 未发现内容性 diff 错误，仅提示部分文件当前工作区仍会在下一次 Git 触碰时统一为 CRLF，这属于现有工作区换行风格提示，不是本轮逻辑错误。

## 下一步

1. **P0：把敏感访问控制真正挂到 runtime 主链**
   - 先接 ToolGateway、credential resolve、context read 和 publish export 的真实拦截点，让 `SensitiveAccessRequest` 不再只是管理 API 事实。
2. **P0：让审批结果接入 `waiting/resume`**
   - 审批通过后调度 resume，审批拒绝/过期后写入统一事件并终止当前访问，而不是只停在票据状态变更。
3. **P0：继续扩真实 execution adapter**
   - execution policy 已经可见且可追溯，但 `sandbox / microvm` tool adapter 仍未真正闭环。
4. **P1：继续拆 `runs.py`、`agent_runtime_llm_support.py` 和 `published_protocol_streaming.py`**
   - 避免安全、调试和发布能力再次回流到长文件里。
