# 2026-03-16 Workflow Contract Schema Validation

## 背景

- 用户要求先阅读 `AGENTS.md`、`docs/dev/user-preferences.md`、`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/dev/runtime-foundation.md` 与最近 Git 提交，复核项目现状、架构边界和下一步优先级，再按优先级继续开发并补文档留痕。
- 最近三次提交 `7900dd3 feat: surface planned workflow node support status`、`09695bc feat: block editor save for unsupported nodes`、`2e74709 feat: guard workflow persistence for planned nodes` 已经把“planned 节点不可假装进入执行主链”的诚实性边界，从 node catalog 一路补到 editor 和后端持久化。
- 继续顺着这条链往前看，当前 `workflow` 保存链路里，node / publish contract 的 `inputSchema`、`outputSchema` 仍基本只要求“是对象”，缺少更细粒度的结构校验；这会让明显错误的 contract 直到后续 publish / runtime 消费时才暴露。

## 现状判断

- 当前项目基础框架已经写到可以持续推进主业务完整度，不需要因为“底座不稳”而回退重来：runtime、published surface、trace / replay、workflow editor、planned-node capability guard、sensitive access、callback waiting/resume 都已具备可持续演进的主链。
- 当前架构继续满足功能性开发、插件扩展性、兼容性与可靠性建设的基本要求：内部仍以 `7Flows IR + runtime + published surface + run events` 为主事实源，没有退化成 OpenClaw 专属壳层或 Dify DSL 镜像。
- 但从可靠性与稳定性看，workflow contract 如果继续只在前端文本框层做 JSON 解析而不在后端做结构约束，会让“保存成功但后续 publish/runtime 隐性失败”的口子长期存在，因此这轮优先补这条保存链路。

## 目标

1. 在后端保存 workflow definition 时，对 node / publish contract 做最小但真实的结构校验。
2. 保持当前 contract 仍是轻量 JSON Schema 风格对象，不额外引入重依赖或第二套 DSL。
3. 顺手把 contract 校验逻辑从聚合 schema 文件中拆出，继续降低 workflow schema 热点。

## 实现

### 1. 新增独立 contract validator helper

- 新增 `api/app/schemas/workflow_contract_validation.py`。
- 当前 helper 不尝试实现完整 JSON Schema 规范，而是对当前项目真正会消费的结构做最小守卫：
  - `type` 必须是标准 JSON Schema primitive 类型或其非空列表；
  - `properties` 必须是对象，且子字段 schema 递归可校验；
  - `required` 必须是唯一的非空字符串列表；
  - `items`、`additionalProperties`、`allOf` / `anyOf` / `oneOf`、`not` 会做基础递归校验；
  - `enum` 至少要求是列表。

### 2. Node contract 接到 workflow schema 主链

- `api/app/schemas/workflow.py` 里的 `WorkflowNodeDefinition` 现在会对 `inputSchema` / `outputSchema` 调用 `validate_contract_schema()`。
- 结果是：明显错误的 node contract 不会再被当成普通 dict 直接写进 workflow version。

### 3. Publish contract 接到 published endpoint schema 主链

- `api/app/schemas/workflow_published_endpoint.py` 里的 `WorkflowPublishedEndpointDefinition` 现在会在 alias/path normalize 之后继续校验 `inputSchema` / `outputSchema`。
- 这样 workflow publish draft 在保存时就能暴露 contract 结构错误，而不是留到 published binding sync 或外部调用阶段再失败。

### 4. 衔接 workflow schema 的继续拆层

- `api/app/schemas/__init__.py` 同步补上新的 helper 模块索引。
- 这轮虽然不是大规模重构，但继续把 workflow 规则按“node config / graph / contract”分出更清楚的边界，降低未来再把校验堆回单文件的风险。

## 影响范围

- `api/app/schemas/workflow_contract_validation.py`
- `api/app/schemas/workflow.py`
- `api/app/schemas/workflow_published_endpoint.py`
- `api/app/schemas/__init__.py`
- `api/tests/test_workflow_routes.py`
- `docs/dev/runtime-foundation.md`

## 验证

在 `api/` 目录执行：

```powershell
.\.venv\Scripts\uv.exe run pytest -q tests/test_workflow_routes.py
.\.venv\Scripts\uv.exe run ruff check app/schemas/workflow.py app/schemas/workflow_published_endpoint.py app/schemas/workflow_contract_validation.py app/schemas/__init__.py tests/test_workflow_routes.py
.\.venv\Scripts\uv.exe run pytest -q
```

在 `web/` 目录执行：

```powershell
pnpm lint
pnpm exec tsc --noEmit
```

结果：

- `pytest -q tests/test_workflow_routes.py`：通过，`34 passed`
- `ruff check ...`：通过
- `pytest -q`：通过，`263 passed`
- `pnpm lint`：通过
- `pnpm exec tsc --noEmit`：通过

## 结论与下一步

- 这轮改动是对最近一条 capability guard 主线的直接承接：上一轮补的是“planned 节点不能持久化”，这一轮补的是“contract 不能只靠前端文本框和延后消费时暴露错误”。
- 当前项目仍未达到“只剩人工逐项界面设计/验收”的阶段，因此本轮不触发通知脚本。
- 下一步优先顺序：
  1. 继续把 workflow editor 的 schema builder 与 advanced JSON 边界补清楚，让前端结构化编辑能直接复用这套后端 contract 规则。
  2. 继续补更细粒度的 binding 校验，尤其是 tool binding / publish draft 与真实 catalog、版本事实的进一步对齐。
  3. 回到 P0 主线，继续推进真实 `sandbox` / `microvm` adapter、统一敏感访问控制闭环和 `WAITING_CALLBACK` 的 operator / inbox 落点。
