# 2026-03-15 Workflow node validator 拆分与项目现状刷新

## 背景

- 用户要求按仓库协作约定重读 `AGENTS.md`、`docs/dev/user-preferences.md`、`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/dev/runtime-foundation.md`，并回答：
  - 上一次 Git 提交做了什么、是否需要衔接
  - 基础框架是否已经设计并写好
  - 架构是否满足功能推进、插件扩展、兼容性、可靠性、稳定性与安全性要求
  - 哪些代码文件仍然偏长、需要继续解耦
  - 当前主业务是否还能持续推进到产品设计目标
- 当前 `HEAD` 是 `665f657 refactor: split workflow graph validation helpers`，它把 `workflow.py` 里的 cross-node graph validation 抽到 `workflow_graph_validation.py`。
- 复核代码后确认：`workflow.py` 虽已摆脱跨节点图校验，但节点级嵌入式 config validator 仍集中在同一主 schema 文件里；同时，部分较早的状态判断里把 `plugin_runtime.py` 仍视为长热点，已经与当前代码事实不完全一致。

## 目标

1. 顺着最近一次提交继续治理 workflow schema 热点，而不是切换到无关子线。
2. 保持 workflow schema 行为、错误信息与 API contract 不变。
3. 刷新当前项目现状判断，把“当前真正的热点”和“已经拆完的热点”区分清楚。

## 实现

### 1. 新增 `workflow_node_validation.py`

- 新增 `api/app/schemas/workflow_node_validation.py`，承接：
  - `contextAccess` / `query` / `tool` / `toolId` 的节点级约束
  - `assistant` / `toolPolicy` / `mockPlan` 的 `llm_agent` 专属约束
  - branch selector、safe expression 与相关子模型
- 该模块只承接 node-level validator，不引入新的 workflow DSL，也不绕开 `WorkflowDefinitionDocument` 作为单一 IR 入口。

### 2. 收口 `workflow.py`

- `api/app/schemas/workflow.py` 现在只保留：
  - workflow/node/edge/variable 文档模型
  - edge field mapping 校验
  - edge condition expression 校验
  - graph validation hook
- `WorkflowNodeDefinition.validate_embedded_config()` 改为单点调用 `validate_workflow_node_embedded_config(...)`。
- 主 schema 文件从约 376 行进一步降到约 177 行，更接近“声明层 + 挂点层”的稳定角色。

### 3. 刷新当前热点判断

- `plugin_runtime.py` 当前已经只是 facade，真实职责已下沉到 `plugin_runtime_proxy.py`、`plugin_runtime_adapter_clients.py`、`plugin_runtime_registry.py` 与 `plugin_runtime_types.py`；它不再是单文件耦合热点。
- 当前更值得优先继续治理的热点改为：
  - `api/app/services/agent_runtime_llm_support.py`
  - `api/app/api/routes/runs.py`
  - `api/app/services/published_protocol_streaming.py`
  - `api/app/services/runtime_run_support.py`
  - `web/components/run-diagnostics-execution-sections.tsx`

## 当前结论

### 1. 上一次 Git 提交做了什么，是否需要衔接

- 需要衔接，而且本轮改动就是直接承接。
- `665f657` 先把 workflow graph-level 校验从主 schema 抽离；本轮继续把 node-level 嵌入式 config validator 抽离，属于同一条“workflow schema 降压与边界收口”主线。

### 2. 基础框架是否已经写好

- 结论不变：已经具备持续功能开发的基础框架，不需要因为“框架没写好”而回退重来。
- 当前后端主干仍成立：
  - `RuntimeService` 继续保持唯一 orchestration owner
  - `runs / node_runs / run_events / run_artifacts / tool_call_records / ai_call_records` 已作为事实层稳定存在
  - published surface、credential、plugin compat、run diagnostics 都已有真实代码路径

### 3. 架构是否满足功能推进、扩展性、兼容性、可靠性、稳定性和安全性

- **功能推进**：满足。运行时、发布层、编辑器和诊断面板都不是空壳，可以继续沿同一主线累积。
- **插件扩展与兼容性**：方向正确。当前仍坚持 Dify plugin ecosystem adapter 旁挂，而不是把 Dify ChatFlow DSL 搬进核心运行时。
- **可靠性 / 稳定性**：可持续推进，但 P0 缺口仍在：
  - 真实 execution adapter / 隔离边界仍未完全闭环
  - `WAITING_CALLBACK` 的后台唤醒仍需把 callback ticket、scheduler、resume orchestration 真正串起来
- **安全性**：基础边界正确，但统一 `SensitiveAccessRequest / ApprovalTicket / NotificationDispatch` 事实层仍未落地，ToolGateway 的敏感拦截尚未成闭环。

### 4. 哪些文件还需要继续解耦

- 后端：
  - `api/app/services/agent_runtime_llm_support.py`
  - `api/app/api/routes/runs.py`
  - `api/app/services/published_protocol_streaming.py`
  - `api/app/services/runtime_run_support.py`
- 前端：
  - `web/components/run-diagnostics-execution-sections.tsx`
  - `web/components/workspace-starter-library.tsx`
  - `web/components/workflow-editor-workbench/use-workflow-editor-graph.ts`
- `workflow.py` 与 `plugin_runtime.py` 当前都已经不再是最紧迫的单文件耦合热点。

### 5. 主业务是否还可以持续推进到产品设计目标

- 可以，而且当前比“重新设计框架”更适合继续沿主线推进。
- 仍需坚持的边界：
  - 内部以 `7Flows IR` 为事实模型
  - runtime / publish / compat / trace 继续共用同一执行主链
  - 不为了 sandbox、compat 或协议映射再造第二套流程控制语义
- 当前尚未进入“只剩人工逐项界面设计与验收”的阶段，因此本轮不运行通知脚本。

## 验证

在 `api/` 目录执行：

```powershell
.\.venv\Scripts\uv.exe run ruff check app/schemas/workflow.py app/schemas/workflow_node_validation.py
.\.venv\Scripts\uv.exe run pytest -q tests/test_workflow_routes.py
```

结果：

- `ruff check`：通过
- `pytest -q tests/test_workflow_routes.py`：通过，`30 passed`

## 下一步

1. **P0：继续推进真实 execution adapter 与隔离边界**
   - 让 execution policy 从“可见”继续进入“真实执行”。
2. **P0：补齐统一 Sensitive Access Control 闭环**
   - 把敏感访问事实层、审批票据和通知投递从设计态推进到真实挂点。
3. **P0：补齐 `WAITING_CALLBACK` 后台唤醒闭环**
   - 让 callback ticket、scheduler 与 resume orchestration 复用同一条 durable waiting/resume 主链。
4. **P1：继续拆 `runs.py`、`agent_runtime_llm_support.py` 和 `published_protocol_streaming.py`**
   - 提前控制新的核心热点，避免调试、发布与 phase pipeline 继续回涨成单体文件。
