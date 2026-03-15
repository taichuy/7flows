# 2026-03-15 Workflow graph validator 拆分与最近提交衔接

## 背景

- 用户要求先复核 `AGENTS.md`、产品/技术基线、`docs/dev/runtime-foundation.md` 与最近 Git 提交，再判断基础框架是否足够继续推进主业务，并按优先级继续开发、记录和更新文档。
- 当前 `main` 最新提交是 `cfc17c5 refactor: split workflow route read-write services`，它承接了上一提交 `6a42c31 refactor: split workflow schema submodels` 的 workflow 结构治理主线。
- 复核后确认：`api/app/schemas/workflow.py` 仍约 577 行，`WorkflowDefinitionDocument.validate_graph()` 内聚合了 publish 唯一性、context access、MCP query、join policy 和 branch edge condition 的跨节点校验，已经成为 workflow 主线新的集中热点。

## 目标

1. 继续顺着最近两次 workflow 主线提交，把 `workflow.py` 里的跨节点 graph validation 抽出独立模块。
2. 保持 workflow definition 的校验行为、错误信息和 API contract 不变。
3. 让 `workflow.py` 更接近“schema 声明 + 局部字段校验”，为后续 node contract、publish governance 和 sensitive access 继续分层留出空间。

## 实现

### 1. 新增 `workflow_graph_validation.py`

- 新增 `api/app/schemas/workflow_graph_validation.py`，承接：
  - node / edge / variable / publish 的唯一性校验
  - trigger / output 节点存在性约束
  - `contextAccess` 引用、`mcp_query` source/artifact 授权校验
  - edge source/target 引用校验与 incoming/outgoing index 构建
  - `runtimePolicy.join` 的 cross-edge 约束
  - condition/router 分支 edge 条件校验
- 新模块定位是 workflow schema 的 graph-level validation helper，而不是第二套 workflow DSL 或新的领域中心。

### 2. 收口 `workflow.py` 的职责

- `api/app/schemas/workflow.py` 中的 `WorkflowDefinitionDocument.validate_graph()` 改为单点调用 `validate_workflow_graph(...)`。
- `workflow.py` 主文件从约 577 行降到约 376 行，保留：
  - 节点/边/变量/publish 的 Pydantic 模型定义
  - node config、branch expression、edge condition expression 等局部字段校验
- 这样 workflow schema 主文件不再承担大段 cross-node graph traversal，降低后续继续补规则时重新堆回单体文件的风险。

### 3. 与最近提交保持同一条治理主线

- `6a42c31` 先拆了 workflow runtime policy / published endpoint 子模型。
- `cfc17c5` 再把 workflow route 的 read/write 编排拆到 service 层。
- 本轮继续把 graph-level validator 从主 schema 中抽出，说明最近三次提交属于同一条“workflow 主线减压”连续治理，而不是另起新方向。

## 影响范围

- `api/app/schemas/workflow.py`
- `api/app/schemas/workflow_graph_validation.py`
- `docs/dev/runtime-foundation.md`

## 验证

在 `api/` 目录执行：

```powershell
.\.venv\Scripts\uv.exe run ruff check app/schemas/workflow.py app/schemas/workflow_graph_validation.py tests/test_workflow_routes.py
.\.venv\Scripts\uv.exe run pytest -q tests/test_workflow_routes.py
.\.venv\Scripts\uv.exe run pytest -q
```

结果：

- `ruff check`：通过
- `pytest -q tests/test_workflow_routes.py`：通过，`30 passed`
- `pytest -q`：通过，`228 passed`

## 当前结论

- 最近一次提交 `cfc17c5` 需要衔接，而且当前拆分是自然延续：它继续把 workflow 主线里剩余的大段职责往更稳定的边界下沉。
- 基础框架已经足够继续支持功能性开发、插件扩展、兼容层演进和运行可靠性建设；但真实执行隔离、统一敏感访问控制与 `WAITING_CALLBACK` durable resume 仍是可靠性/安全性进入下一阶段的关键缺口。
- 当前项目仍未达到“只剩人工界面设计和逐项界面验收”的阶段，因此本轮不触发通知脚本。

## 下一步

1. 继续治理 `workflow.py` 剩余的 node contract / embedded config validator，避免新规则重新回流主 schema。
2. 回到 P0 主线，优先推进真实 execution adapter、统一敏感访问控制事实层与 `WAITING_CALLBACK` 后台唤醒闭环。
3. 继续拆 `api/app/api/routes/runs.py`、`api/app/services/agent_runtime_llm_support.py`、`web/components/run-diagnostics-execution-sections.tsx` 等仍偏长的热点文件，给调试、发布和 AI 节点细节层腾出更清晰的边界。
