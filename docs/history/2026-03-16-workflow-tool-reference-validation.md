# 2026-03-16 Workflow Tool Reference Validation

## 背景

- 用户要求先按 `AGENTS.md` 指定顺序阅读 `docs/dev/user-preferences.md`、`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/dev/runtime-foundation.md`，结合最近 Git 提交和当前实现，判断项目是否已经具备持续功能开发条件，并基于优先级继续开发、补记录。
- 最近几次提交已经沿着同一条 editor 持久化主线连续推进：
  - `7900dd3 feat: surface planned workflow node support status`
  - `09695bc feat: block editor save for unsupported nodes`
  - `2e74709 feat: guard workflow persistence for planned nodes`
  - `c1de162 feat: validate workflow contract schemas`
  - `4e7df43 feat: preflight workflow contract validation in editor`
- 这意味着当前主线不是“缺基础框架”，而是“继续收口 definition 保存前后的事实一致性”，把 planned node、contract schema、tool catalog 等真实约束从 runtime-time failure 前移到 editor/save-time feedback。

## 项目现状判断

### 1. 基础框架是否已经写好

- 结论：**是，已经达到可持续功能开发阶段。**
- 后端主链已经具备 `workflow -> workflow_version -> compiled_blueprint -> run / node_run / run_events` 的可追溯骨架，published surface、published cache、API key、activity/detail、callback waiting/resume 与敏感访问治理也已进入真实接口层。
- 前端主链已经具备 workflow editor、workspace starter、run diagnostics、publish panel 和 tool catalog 接入，不再是只有 demo 面板的空壳。

### 2. 最近一次提交是否需要衔接

- 结论：**需要直接衔接，而且优先级高。**
- 上一次提交把 contract schema preflight 补到了 editor，但 `tool` 节点与 `llm_agent.toolPolicy` 仍可能引用已经漂移或缺失的 tool catalog 项。
- 如果继续放任这类定义被保存，问题会拖到后端 `422`、workspace starter refresh/rebase，甚至 runtime invoke 阶段才暴露，破坏“editor -> definition -> persistence -> runtime”一条主链的事实一致性。

### 3. 架构是否仍满足功能开发、扩展性、兼容性、可靠性与安全性

- 结论：**总体满足，当前主要任务不是重搭架构，而是继续收口关键主链。**
- `7Flows IR`、runtime 单一 orchestration owner、published gateway、plugin compat、sensitive access、callback durable runtime 等主边界仍成立，没有退化成 Dify DSL 或 OpenClaw 专属壳层。
- 当前真正要继续补的是：执行隔离分级真正落地、敏感访问治理闭环、callback operator 入口，以及 editor/persistence/runtime 之间的前后端一致性。

### 4. 代码热点是否仍需要继续解耦

- 结论：**部分热点仍长，但多数已进入“边拆边推进主业务”的合理阶段。**
- 后端较明显热点仍包括：`api/app/api/routes/workspace_starters.py`、`api/app/services/runtime_node_dispatch_support.py`、`api/app/services/agent_runtime_llm_support.py`、`api/app/services/agent_runtime.py`、`api/app/services/run_views.py`。
- 前端热点仍包括：`web/lib/get-workflow-publish.ts`、`web/components/workflow-editor-workbench/use-workflow-editor-graph.ts`、`web/components/workspace-starter-library.tsx`、`web/components/workflow-editor-publish-endpoint-card.tsx`。
- 当前更合理的策略仍是继续沿主业务链拆解，而不是先做脱离业务价值的大范围“为拆而拆”。

## 本轮目标

1. 把 tool catalog 引用校验补到 workflow / workspace starter 的持久化 guard。
2. 把同一套 tool catalog reference 规则补到 workflow editor preflight。
3. 让最近几次围绕 planned node、contract schema 的一致性工作，继续收成真正的 editor-save-runtime 同步体验。

## 实现

### 1. 后端：把 persistable workflow guard 扩到真实 tool catalog 引用

- `api/app/services/workflow_definitions.py` 新增当前 workspace tool catalog index 构建与 tool reference 收集逻辑。
- `validate_persistable_workflow_definition()` 现在除了 planned node guard，还会继续校验：
  - `tool` 节点 `config.tool.toolId` / `config.toolId` 是否仍存在于当前 tool catalog。
  - `tool` 节点 `config.tool.ecosystem` 是否与当前目录事实一致。
  - `llm_agent.toolPolicy.allowedToolIds` 是否仍指向当前可见的 tool catalog 项。
- 一旦目录漂移，workflow save / workspace starter 沉淀会直接返回结构化 `422`，而不是拖到 runtime 调用时才炸。

### 2. 后端：workspace starter 全入口复用同一套 guard

- `api/app/services/workspace_starter_templates.py` 与 `api/app/api/routes/workspace_starters.py` 已把新 guard 贯通到：
  - create
  - update
  - refresh
  - rebase
  - bulk refresh
  - bulk rebase
- 这样不会再出现“workflow 主链已阻断，但 starter refresh / rebase 仍能把失效 tool binding 带回模板库”的情况。

### 3. 前端：editor save / starter save 增加 tool catalog preflight

- 新增 `web/lib/workflow-tool-reference-validation.ts`，与后端 guard 共享同一判断口径：
  - tool node binding 缺失目录项
  - tool node ecosystem 与目录事实不一致
  - llm_agent toolPolicy 指向失效 tool catalog 项
- `web/components/workflow-editor-workbench.tsx` 现在会把这组 issue 接入现有 save blocking message。
- `web/components/workflow-editor-workbench/workflow-editor-hero.tsx` 已同步展示 `tool reference issues` pill，并把保存阻断文案更新为“planned / contract / tool catalog drift”统一策略。
- `web/components/workflow-editor-inspector.tsx` 的规则提示也已同步，避免界面说明落后于真实行为。

## 影响范围

- `api/app/services/workflow_definitions.py`
- `api/app/api/routes/workflows.py`
- `api/app/services/workspace_starter_templates.py`
- `api/app/api/routes/workspace_starters.py`
- `api/tests/test_workflow_routes.py`
- `api/tests/test_workspace_starter_routes.py`
- `web/lib/workflow-tool-reference-validation.ts`
- `web/components/workflow-editor-workbench.tsx`
- `web/components/workflow-editor-workbench/workflow-editor-hero.tsx`
- `web/components/workflow-editor-inspector.tsx`
- `docs/dev/runtime-foundation.md`

## 验证

### 后端

在 `api/` 目录执行：

```powershell
.\.venv\Scripts\uv.exe run pytest -q tests/test_workflow_routes.py tests/test_workspace_starter_routes.py
.\.venv\Scripts\uv.exe run pytest -q
```

结果：

- 局部测试：`54 passed`
- 全量测试：`266 passed`

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

- 无空白错误；仅有现有行尾转换提示（LF/CRLF warning），不影响本轮行为正确性。

## 结论与下一步

- 当前项目基础框架已经足够支撑继续达成产品设计目标，不需要回退重搭；真正应继续推进的是关键主链的一致性、治理密度和可恢复性。
- 本轮改动直接衔接最近几次 editor/save-time 一致性提交：planned node、contract schema 之后，tool catalog drift 现在也被收口到前后端统一 guard。
- 当前仍未进入“只剩人工逐项界面设计/验收”的阶段，因此本轮**不触发** `node "e:\code\taichuCode\ai-presson-wen\aionui\notice\kill-port-8050.js"` 通知脚本。
- 下一步建议按优先级继续：
  1. **P0**：继续推进真实 `sandbox` / `microvm` tool adapter 与 execution trace 摘要聚合，避免 execution-aware 长期停留在“有策略、少隔离”。
  2. **P0**：继续把统一敏感访问控制挂到 publish export、通知 worker / inbox 与 operator 控制面，补齐治理闭环。
  3. **P0**：继续补 `WAITING_CALLBACK` 的 published drilldown、通知与 operator 入口，完善 durable resume 排障面。
  4. **P1**：继续把 workflow editor 的 publish version / binding reference、schema builder、advanced JSON 边界做细，进一步减少 save-time 之后才暴露的问题。
