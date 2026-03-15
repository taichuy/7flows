# 2026-03-15 Workflow 路由读写职责拆分与提交衔接

## 背景

- 用户要求先结合 `AGENTS.md`、产品/技术基线、`docs/dev/runtime-foundation.md` 与最近 Git 提交复核项目现状，再按优先级继续开发并补文档留痕。
- 最新一次 Git 提交是 `6a42c318 refactor: split workflow schema submodels`，已经把 `workflow.py` 里的 publish/runtime policy 子模型拆出；根据该提交对应的 `docs/history/2026-03-15-workflow-schema-split.md`，下一条自然衔接线就是继续治理 workflow route/service 的集中职责。
- 复核 `api/app/api/routes/workflows.py` 后确认：虽然 schema 热点已经下降，但该路由仍同时承担 workflow detail/version 序列化、compiled blueprint 查询、run summary 聚合，以及 create/update 内的 workflow version snapshot + publish binding 编排，不符合“route 保持薄、service 承担查询/写入编排”的当前后端分层方向。

## 目标

1. 把 `workflows.py` 中与视图查询、版本排序、序列化和 run summary 聚合相关的职责迁到 service 层。
2. 把 create/update 内重复的 workflow version snapshot、compiled blueprint 与 publish binding 编排收口到写入 service helper。
3. 保持 `/api/workflows`、`/{id}`、`/{id}/versions`、`/{id}/runs` 的响应结构与现有测试行为不变。
4. 继续顺着最近两次 workflow 结构治理，降低后续继续扩 workflow route/service 时的集中度风险。

## 实现

### 1. 新增 `workflow_views.py` 查询视图服务

- 新增 `api/app/services/workflow_views.py`，承接：
  - workflow version 的 semver 排序
  - compiled blueprint lookup
  - `WorkflowVersionItem` / `WorkflowDetail` 序列化
  - workflow run summary 的聚合查询与 `WorkflowRunListItem` 组装
- 该模块定位与现有 `run_views.py` 一致：为 route 提供“事实查询 + schema 序列化”能力，而不是把业务编排继续堆回 API 层。

### 2. 收口 `workflows.py` 路由职责

- 新增 `api/app/services/workflow_mutations.py`，统一承接：
  - workflow 初次创建
  - workflow definition 更新后的 version bump
  - workflow version snapshot 持久化
  - compiled blueprint 与 publish binding 的写入编排
  - 编排阶段错误向 `WorkflowMutationError` 的统一映射
- `workflow_mutations.py` 让 route 不再维护两套近似的 create/update 持久化流程，也为后续继续补 publish governance、sensitivity hook 或 compiled blueprint 规则预留单一入口。

### 3. 收口 `workflows.py` 路由职责

- `api/app/api/routes/workflows.py` 从约 316 行降到约 142 行。
- 路由层现在主要保留：
  - HTTP contract
  - 404 / 422 等错误映射
  - definition validation
- workflow detail / versions / runs 三类读取接口统一委托 `workflow_views.py`，create / update 内的 snapshot / blueprint / publish 写入编排统一委托 `workflow_mutations.py`，避免继续在 route 里堆序列化、聚合 SQL 和持久化细节。

### 4. 保持提交衔接的一致方向

- 这次改动与上一提交 `split workflow schema submodels` 保持同一条治理主线：先拆 schema 聚合热点，再拆 route 的读写热点。
- 当前 workflow 主线的集中职责已分别从 schema、route 读取和 route 写入三侧得到一轮收口，后续剩余更自然的热点是 `workflow.py` 里的 cross-node validator，以及 publish governance / sensitive access 与 workflow 编辑器结构化配置继续下沉时的 service 边界。

## 影响范围

- `api/app/api/routes/workflows.py`
- `api/app/services/workflow_mutations.py`
- `api/app/services/workflow_views.py`
- `api/tests/test_workflow_routes.py`
- `docs/dev/runtime-foundation.md`
- `docs/dev/user-preferences.md`

## 验证

在 `api/` 目录执行：

```powershell
.\.venv\Scripts\uv.exe run ruff check app/api/routes/workflows.py app/services/workflow_views.py app/services/workflow_mutations.py tests/test_workflow_routes.py
.\.venv\Scripts\uv.exe run pytest -q tests/test_workflow_routes.py tests/test_workflow_publish_routes.py
.\.venv\Scripts\uv.exe run pytest -q
```

结果：

- `ruff check`：通过
- `pytest -q tests/test_workflow_routes.py tests/test_workflow_publish_routes.py`：通过，`54 passed`
- `pytest -q`：通过，`228 passed`

## 当前结论

- 最新提交 `6a42c318` 需要衔接，而且当前拆分是自然延续，而不是另起新方向。
- 基础框架已经足够支撑继续做功能性开发、插件扩展和兼容性建设；但仍处在“内核继续补齐”的阶段，不是“只剩人工逐页做界面设计”的阶段，因此本轮不触发通知脚本。
- 当前架构对可扩展性、兼容性、可追溯性与稳定性是基本成立的，但 P0 的真实执行隔离、统一敏感访问闭环与 `WAITING_CALLBACK` durable resume 仍是可靠性与安全性真正进入下一阶段的关键。
- 本轮已把 workflow route 的读取与写入编排都收口到独立 service，说明基础框架不仅“能继续开发”，而且已经具备沿 service 边界持续解耦的空间；但 `workflow.py`、`runs.py`、`agent_runtime_llm_support.py` 等热点仍需按优先级继续治理。

## 下一步

1. 继续拆 `api/app/schemas/workflow.py` 中的 cross-node validator helper，避免新规则重新回流聚合 schema。
2. 回到 P0 主线，优先推进真实 execution adapter、统一敏感访问控制事实层与 `WAITING_CALLBACK` 后台唤醒闭环。
3. 在 workflow 主线上继续补 publish governance、sensitive access policy 与 editor structured form 的协同边界，避免新规则重新压回 `workflow.py` 或 route 层。
