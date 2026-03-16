# 2026-03-16 Workflow Tool Execution Capability Guard

## 背景

- 用户要求先阅读 `AGENTS.md`、`docs/dev/user-preferences.md`、`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/open-source-commercial-strategy.md`、`docs/dev/runtime-foundation.md`，结合最近 Git 提交和 `docs/history/` 判断项目现状、是否需要衔接上一轮开发，并在此基础上按优先级继续推进。
- 最近几轮工作流编辑器主线已经连续把“planned node / contract schema / tool catalog / publish version”这些真实约束前移到 save-time：
  - `2e74709 feat: guard workflow persistence for planned nodes`
  - `c1de162 feat: validate workflow contract schemas`
  - `4e7df43 feat: preflight workflow contract validation in editor`
  - `1b5dea5 feat: add sensitive access inbox bulk governance`
  - `ced7627 docs: align sandbox protocol direction`
- 当前项目并不缺“能继续写业务”的基础框架；真正需要继续衔接的是把 execution-aware 这条主线做得更诚实，避免编辑器允许用户显式声明 `adapterId`、`microvm`、`sandbox` 等执行意图，却只能在运行时才发现当前工具执行目标根本不支持。

## 现状判断

### 1. 基础框架是否已经具备持续开发条件

- 结论：**具备，而且已经进入“围绕真实主链持续补齐约束与治理”的阶段。**
- 后端已有 `workflow -> workflow_version -> compiled_blueprint -> run / node_run / run_events` 主骨架，前端已有 workflow editor、workspace starters、run diagnostics、publish panel，不再是空壳项目。
- 当前更高价值的工作，不是回退重搭架构，而是继续让“定义层、持久化层、runtime 层”在关键约束上保持一致。

### 2. 是否需要衔接上一次正式开发留痕

- 结论：**需要，而且这轮是直接延续同一条保存前 guard 主线。**
- 之前已经补了 node support status、contract schema、tool catalog reference、publish version reference 的前后端一致性。
- 这轮继续补的是：**tool execution capability honesty**，也就是“工具目录存在 ≠ 当前 adapter 绑定和 execution class 就真的可用”。

### 3. 架构是否满足功能推进、扩展性、兼容性、可靠性与安全性

- 结论：**总体满足，当前更需要继续补 capability truth，而不是重做内核。**
- `7Flows IR`、单一 workflow executor、published surface、compat adapter、敏感访问治理、run trace 事实层都还站得住。
- 当前最值得继续推进的高优先级点仍是：
  1. graded execution 从 execution-aware 走向真实隔离能力；
  2. 强隔离路径 capability honest / fail-closed 的保存前与运行前表达；
  3. workflow editor/save-time guard 继续前移 runtime 才会暴露的问题。

### 4. 代码热点是否需要继续解耦

- 结论：**需要，但应沿主业务链拆，而不是脱离业务价值做纯重构。**
- 本轮没有继续把热点堆回 `workflow_definitions.py`，而是新增 `api/app/services/workflow_tool_execution_validation.py` 与 `web/lib/workflow-tool-execution-validation.ts`，把“工具执行能力校验”独立成新 helper，避免旧的 tool catalog reference guard 继续膨胀成新单体。

## 本轮目标

1. 为 workflow / workspace starter 的持久化链路补上 tool execution capability guard。
2. 为 workflow editor 补上同一套 execution capability preflight。
3. 让“显式声明但当前目标不支持”的 adapter 绑定 / execution class 在保存前就被阻断，而不是拖到 runtime fallback 或 422 才暴露。

## 实现

### 1. 后端：新增独立的 tool execution capability validator

- 新增 `api/app/services/workflow_tool_execution_validation.py`，独立处理以下问题：
  - `tool` 节点显式绑定的 `adapterId` 是否仍属于当前 workspace 可见且启用的 adapter；
  - `tool` 节点 `runtimePolicy.execution.class` 是否真被当前工具执行目标支持；
  - `llm_agent.toolPolicy.execution` + `allowedToolIds` 的显式执行要求是否被当前工具目标支持；
  - `llm_agent.mockPlan.toolCalls[].execution` 与显式 `adapterId` 是否与当前 adapter 能力一致。
- `api/app/services/workflow_definitions.py` 新增 `build_workflow_adapter_reference_list()`，让 workflow 保存链路在 tool catalog 之外，也能拿到按 workspace 过滤后的 adapter 事实。

### 2. 后端：workflow / starter 统一复用同一套 guard

- `/api/workflows` create/update 现在会把 workspace-visible adapter snapshot 一起传给 `validate_persistable_workflow_definition()`。
- `api/app/services/workspace_starter_templates.py` 里的 create/update/refresh/rebase 也复用同一套 adapter guard。
- 这样不会再出现“workflow 主链挡住了，但 starter 还能沉淀一份 execution capability 不诚实的 definition”。

### 3. 前端：editor preflight 补 execution capability issues

- 新增 `web/lib/workflow-tool-execution-validation.ts`，与后端 guard 保持同一方向：
  - 显式 adapter 绑定失效；
  - 显式 execution class 与当前 adapter 能力不匹配；
  - native tool 却显式请求非 `inline` 执行类。
- `web/app/workflows/[workflowId]/page.tsx` 现在额外拉取 `pluginRegistry.adapters`。
- `web/components/workflow-editor-workbench.tsx` 会把 execution capability issues 接入保存阻断汇总。
- `web/components/workflow-editor-workbench/workflow-editor-hero.tsx` 与 `web/components/workflow-editor-inspector.tsx` 也同步展示了新的 honest guard 提示。

## 影响范围

- `api/app/services/workflow_tool_execution_validation.py`
- `api/app/services/workflow_definitions.py`
- `api/app/api/routes/workflows.py`
- `api/app/services/workspace_starter_templates.py`
- `api/tests/test_workflow_routes.py`
- `api/tests/test_workspace_starter_routes.py`
- `web/lib/workflow-tool-execution-validation.ts`
- `web/lib/get-plugin-registry.ts`
- `web/app/workflows/[workflowId]/page.tsx`
- `web/components/workflow-editor-workbench.tsx`
- `web/components/workflow-editor-workbench/workflow-editor-hero.tsx`
- `web/components/workflow-editor-inspector.tsx`
- `docs/dev/runtime-foundation.md`

## 验证

### 后端定向

在 `api/` 目录执行：

```powershell
.\.venv\Scripts\uv.exe run pytest -q tests/test_workflow_routes.py tests/test_workspace_starter_routes.py
```

结果：

- `60 passed`

### 后端全量

在 `api/` 目录执行：

```powershell
.\.venv\Scripts\uv.exe run pytest -q
```

结果：

- `295 passed`

### 前端

在 `web/` 目录执行：

```powershell
pnpm exec tsc --noEmit
pnpm lint
```

结果：

- `pnpm exec tsc --noEmit`：通过
- `pnpm lint`：通过

### Diff 检查

在仓库根目录执行：

```powershell
git diff --check
```

结果：

- 仅有现有 LF/CRLF warning，无空白错误。

## 结论

- 本轮没有去重做 runtime 架构，而是继续沿“editor -> persistence -> runtime”主链，把 **tool execution capability honesty** 前移成真实 guard。
- 这说明当前项目的基础框架已经足够支撑持续推进产品完整度；下一步不该回到“大改架构”，而应该继续把强隔离能力、敏感访问治理和编辑器能力补成完整闭环。
- 当前仍未进入“只剩人工逐项界面设计 / 人工验收”的阶段，因此本轮**不触发** `node "e:\code\taichuCode\ai-presson-wen\aionui\notice\kill-port-8050.js"`。

## 下一步建议

1. **P0：继续把 execution capability 从 honest guard 推到真实隔离执行体**
   - 优先把 `sandbox` / `microvm` 的 backend registration / execution protocol 落到代码，而不是长期停留在 host-side guard + honest fallback。
2. **P0：继续统一强隔离 fail-closed 语义**
   - 把高风险 tool/plugin、`sandbox_code` 和未来显式强隔离路径，继续收口到同一条 capability-driven blocked / unavailable 主链。
3. **P1：继续提升 workflow editor 的结构化完整度**
   - 在现有 planned node / contract / tool reference / execution capability / publish version guard 之上，继续补 schema builder、publish binding identity 和 starter portability 规则。
