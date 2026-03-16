# 2026-03-16 Workflow Preflight Issue Categories

## 背景

- `feat: add workflow definition preflight route` 已把 workflow save 链路收口到后端权威 preflight，但失败时仍主要返回单条 `detail` 字符串。
- 随着 planned node、contract schema、tool catalog reference、tool execution capability、publish version reference 等 guard 持续叠加，editor 继续只靠一段文本提示，会越来越难把问题稳定映射回具体修正入口。
- 当前项目基础框架已经足够支撑继续功能开发，问题不在于“骨架没写好”，而在于要继续把 workflow/editor/runtime 之间的验证边界收口成可扩展的真实主链。

## 目标

- 让 workflow preflight 在失败时返回最小结构化 issue 列表，而不是只有纯文本。
- 保持后端作为 validation source of truth，同时减少前端针对错误文案做脆弱解析。
- 为后续 sensitive access policy、starter portability、publish binding identity 等新 guard 预留稳定的 issue category 扩展点。

## 实现

- 在 `api/app/services/workflow_definitions.py` 中新增 `WorkflowDefinitionValidationIssue`，并让 `WorkflowDefinitionValidationError` 携带 `issues`：
  - `schema`
  - `node_support`
  - `tool_reference`
  - `tool_execution`
  - `publish_version`
- `validate_workflow_definition()` 现会把 Pydantic/schema 失败映射成 `schema` issue。
- `validate_persistable_workflow_definition()` 在 planned node、tool reference、tool execution、publish version 四类 server-side guard 失败时，都会附带对应分类的 issue 列表。
- `api/app/api/routes/workflows.py` 的 `POST /api/workflows/{workflow_id}/validate-definition` 失败时，现返回：
  - `detail.message`
  - `detail.issues[]`
- `web/lib/get-workflows.ts` 新增 `WorkflowDefinitionPreflightError`，前端不再只把 preflight 失败当成普通字符串异常。
- `web/components/workflow-editor-workbench.tsx` 现会按 issue category 聚合摘要，把同类问题压缩展示，避免 save message 被长串原始文本淹没。

## 影响范围

- `api/app/services/workflow_definitions.py`
- `api/app/api/routes/workflows.py`
- `api/app/schemas/workflow.py`
- `api/tests/test_workflow_routes.py`
- `web/lib/get-workflows.ts`
- `web/components/workflow-editor-workbench.tsx`
- `docs/dev/runtime-foundation.md`

## 项目现状判断

### 基础框架是否已写好

- 是。当前后端 runtime、published surface、editor、diagnostics、sensitive access 都已经进入真实主链，不是空框架。
- 但还没有到“只剩人工逐项界面设计”的阶段，因此本轮仍以继续补真实闭环为主，不触发人工界面验收通知脚本。

### 架构是否支撑后续功能、扩展、兼容、稳定和安全

- 总体是支撑的：`7Flows IR` 仍是内部事实模型，runtime orchestration owner 仍保持唯一，workflow editor/save 链路也继续往“前端快检 + 后端权威验证”收口。
- 当前主要风险不是方向错，而是如果继续让 preflight 错误停留在纯文本层，会削弱后续 guard 扩展时的可维护性和 UI 诚实性。

### 是否存在需要继续解耦的大文件

- 是，且这次没有偏题去大拆：
  - `api/app/services/runtime_node_dispatch_support.py`
  - `api/app/services/run_views.py`
  - `api/app/services/tool_gateway.py`
  - `api/app/api/routes/workspace_starters.py`
  - `web/components/workflow-editor-workbench/use-workflow-editor-graph.ts`
- 这些热点仍建议按 `runtime-foundation` 的优先级继续治理，但本轮先补 validation 主链的结构化接口，更贴近最近提交的衔接点。

## 验证

- `api/.venv/Scripts/uv.exe run pytest tests/test_workflow_routes.py -q`
  - `42 passed`
- `web/pnpm exec tsc --noEmit`
  - 通过

## 结论

- 项目当前可以继续稳定推进，不需要回头重写基础框架。
- 本轮最合适的衔接点是把 workflow preflight 从“后端权威但错误过于扁平”推进成“后端权威且可分类消费”。
- 这项改动直接服务后续 editor 完整度、规则扩展性和前后端一致性，属于对现有主线的补真，而不是另开新支线。

## 下一步

1. 把同一套 preflight issue categories 复用到 `workspace starter` create/update 前端入口，而不是只在 workflow save 生效。
2. 为 issue category 继续补 `field/path` 级定位信息，减少用户只能看摘要后再手动排查 JSON 的成本。
3. 继续按 `runtime-foundation` 计划推进 sensitive access policy editor、starter portability 和 publish binding identity guard，并沿同一 issue category 机制输出。
