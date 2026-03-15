# 2026-03-16 Server-side Workflow Capability Guard

## 背景

- `09695bc feat: block editor save for unsupported nodes` 已经把 workflow editor 的 capability validation 接到了前端保存入口：当 definition 含 `planned / unknown` 节点时，编辑器会阻断“保存 workflow”和“保存为 workspace starter”。
- 但上一轮改动仍然只停留在前端层：如果有人绕过 editor，直接请求 `/api/workflows` 或 workspace starter 的持久化入口，后端仍会接受这些 definition。
- 这会让“节点路线图占位”和“当前可持久化事实”再次分叉，继续留下 `loop`、`sandbox_code` 这类 planned 节点被写入 workflow version / workspace starter 的绕过口子。

## 目标

- 把 node `support_status` 的诚实性边界从前端补到后端持久化链路。
- 让 workflow 与 workspace starter 共享同一套 “planned 节点不可持久化” 语义，而不是只依赖 editor UI。
- 对历史数据保留 diff / 诊断能力，但阻断新的持久化动作继续沉淀不在执行主链的 definition。

## 实现

### 1. 在 workflow definition 层增加 persistable guard

- 在 `api/app/services/workflow_definitions.py` 中新增：
  - `_node_support_index()`：从 `workflow_library_catalog` 复用当前 node catalog 的 `support_status`；
  - `collect_unavailable_persisted_workflow_nodes()`：扫描 definition 中不应进入持久化链路的节点；
  - `validate_persistable_workflow_definition()`：在 schema 校验通过后，进一步拒绝 `support_status != available` 的节点定义。
- 这样后端不会再另起一套 planned-node 名单，而是直接复用当前 catalog 事实。

### 2. workflow create / update 改成严格持久化校验

- `api/app/api/routes/workflows.py` 现在在 create / update 时统一调用 `validate_persistable_workflow_definition()`。
- 结果是：就算绕过 editor，后端也会拒绝把 `loop`、`sandbox_code` 等 planned 节点写入 workflow 主定义和新版本快照。

### 3. workspace starter 的显式与隐式持久化入口一起兜住

- `api/app/services/workspace_starter_templates.py` 的 create / update / refresh / rebase 现在都会复用严格持久化校验。
- `api/app/api/routes/workspace_starters.py` 额外补了两类入口处理：
  - 单个 `refresh` / `rebase`：命中 planned 节点时返回 `422`；
  - bulk `refresh` / `rebase`：命中 planned 节点时按 `source_workflow_invalid` 跳过，而不是直接抛 500。

### 4. 补充回归测试

- `api/tests/test_workflow_routes.py`
  - 新增 workflow create / update 拒绝 planned `loop` 节点的测试。
- `api/tests/test_workspace_starter_routes.py`
  - 新增 workspace starter create / update 拒绝 planned 节点；
  - 新增 starter refresh / rebase 对 invalid source workflow 返回 `422`；
  - 新增 bulk refresh / rebase 对 invalid source workflow 走 skip summary，而不是中断整个批量请求。

## 影响范围

- workflow 与 workspace starter 的“可持久化事实边界”现在前后端一致，不再依赖单一 UI 入口守住诚实性。
- 历史上如果数据库里已经存在 planned 节点 definition，仍可以继续做 source diff / 诊断；但新的 refresh / rebase / update 不会再把这类定义继续沉淀下去。
- 这轮改动没有把 planned 节点伪装成已可运行，仍然维持当前 MVP 对 `loop` / `sandbox_code` 的诚实表达。

## 验证

- `cd api; .\.venv\Scripts\uv.exe run pytest -q tests/test_workflow_routes.py tests/test_workspace_starter_routes.py`
- `cd api; .\.venv\Scripts\uv.exe run ruff check app/api/routes/workflows.py app/api/routes/workspace_starters.py app/schemas/workspace_starter.py app/services/workflow_definitions.py app/services/workspace_starter_templates.py tests/test_workflow_routes.py tests/test_workspace_starter_routes.py`
- `cd api; .\.venv\Scripts\uv.exe run pytest -q`

## 结论与下一步

- 这是对 `feat: block editor save for unsupported nodes` 的直接衔接：上一轮解决了前端入口，这一轮把后端绕过口补齐。
- 下一步优先顺序：
  1. 把 editor / route 的 capability guard 继续细化到 binding / contract / publish draft 的 server-side 校验，而不是只按 node `support_status` 阻断。
  2. 继续推进 `loop` 的真实 runtime 语义和 `sandbox / microvm` adapter，尽快减少 catalog 中长期停留为 planned 的核心节点。
  3. 在 publish / import / future API surfaces 上复用这套 persistable guard，避免后续新入口再次引入“可见但可绕过”的能力漂移。
