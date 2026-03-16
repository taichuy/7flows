# 2026-03-16 Workflow Validation Field/Path Issues

## 背景

- 最近两轮已经把 workflow definition preflight、workspace starter create/update/save-as、workflow create/update 正式保存链路收口为结构化 `validation issues`。
- 但 issue 仍主要停留在 `category + message` 层，前端虽然不再只是吃扁平 `422` 字符串，却还需要人工从整段文案里反推到底该改 `definition` 的哪里。
- 本轮在复核项目现状后，结论仍然稳定：当前基础框架已经足够支撑持续功能开发、兼容层扩展与治理能力推进，最高优先级不是回头重造 runtime / editor 骨架，而是继续沿统一 validation / governance 主链补“可定位、可排障、可持续扩展”的细节闭环。

## 目标

- 给 workflow / workspace starter 共用的 validation issue 增加 `path` / `field` 元数据。
- 优先覆盖当前最常见、最影响保存体验的几类问题：`schema`、`node_support`、`tool_reference`、`publish_version`。
- 让 editor 与 workspace starter 摘要优先显示定位信息，而不是只显示长句子报错。

## 实现

### 后端

- `api/app/services/workflow_definitions.py`
  - 扩展 `WorkflowDefinitionValidationIssue`，新增 `path`、`field`。
  - Pydantic schema 错误现在会保留结构化 `loc`，并额外从 message 中抽取像 `inputSchema.type`、`outputSchema.required` 这样的 contract 子路径，组合成 `nodes.1.inputSchema.type` 这类真实定位点。
  - unavailable node、tool binding drift、LLM agent `toolPolicy.allowedToolIds` 缺失引用现在也会带上明确 path。
- `api/app/services/workflow_publish_version_references.py`
  - publish version 引用错误改为返回结构化 issue，显式给出 `publish.{index}.workflowVersion`。
- `api/app/api/routes/workflows.py`
- `api/app/api/routes/workspace_starters.py`
  - 两条路由的 issue renderer 同步透传 `path` / `field`，避免 workflow 与 workspace starter 再次出现返回体漂移。
- `api/app/schemas/workflow.py`
  - API schema 补齐 `WorkflowDefinitionPreflightIssue.path/field`，让前后端契约保持一致。

### 前端

- `web/lib/get-workflows.ts`
  - workflow validation issue 类型补齐 `path` / `field`。
- `web/components/workflow-editor-workbench.tsx`
  - 保存失败摘要优先展示 `path` / `field`，例如直接看到 `nodes.1.inputSchema.type`，而不是只看长句子。
- `web/components/workspace-starter-library.tsx`
  - workspace starter validation 摘要同样优先展示 path 级定位样本，避免模板治理仍停留在“知道有几类问题，但不知道改哪里”。

## 项目现状判断

### 是否需要衔接最近提交

- 需要，而且这次衔接非常顺。
- 上一提交解决的是“正式保存也要和 preflight 一样返回结构化 issues”；本轮继续解决的是“结构化 issue 还要告诉用户 definition 的哪个字段出错”。
- 两轮改动沿的是同一条 validation 主链，没有引入新的事实模型或分叉协议。

### 基础框架是否已写好

- 是，而且已经足以支撑持续功能开发。
- 当前仓库已经有稳定的 workflow definition、compiled blueprint、runtime、published surface、run diagnostics、workspace starter、sensitive access 和 compat adapter 基础，不再是“只有骨架”的阶段。
- 真正的短板主要在高优先级业务闭环与 operator 体验细节，而不是缺少新的底座抽象。

### 架构是否支撑后续功能、扩展性、兼容性、可靠性与安全性

- **功能性开发**：支撑。`7Flows IR + runtime + publish + trace + validation/governance` 主链已经形成，并且本轮继续证明这条主链可以增量补强而不是推倒重来。
- **插件扩展性 / 兼容性**：基本支撑。compat adapter、tool catalog、execution capability guard 已有明确边界，但 lifecycle / hydration / store governance 还值得继续拆层。
- **可靠性 / 稳定性**：继续变好。workflow / starter 的保存反馈已从“知道失败”推进到“知道 definition 哪个 path 失败”；但 `WAITING_CALLBACK`、published callback drilldown、scheduler 运营视图仍是更高优先级的运行时闭环。
- **安全性**：方向正确但未完整交付。sensitive access、capability guard、`sandbox_code` fail-closed 已经开始具备真实边界；独立 `SandboxBackendRegistration / SandboxExecution` 协议仍是后续目标设计。

### 长文件热点是否还需要继续解耦

- 仍需要，但不构成当前主业务阻塞。
- 目前最值得继续关注的热点仍包括：
  - `api/app/services/workspace_starter_templates.py`
  - `api/app/services/runtime_node_dispatch_support.py`
  - `api/app/api/routes/workspace_starters.py`
  - `api/app/services/run_views.py`
  - `web/components/workflow-editor-workbench.tsx`
  - `web/components/workspace-starter-library.tsx`
- 这些文件都已经开始拆层，但在功能持续追加时仍容易重新长回去，后续应优先沿 facade / presenter / section / helper 方向继续分解。

## 影响范围

- `api/app/services/workflow_definitions.py`
- `api/app/services/workflow_publish_version_references.py`
- `api/app/api/routes/workflows.py`
- `api/app/api/routes/workspace_starters.py`
- `api/app/schemas/workflow.py`
- `api/tests/test_workflow_routes.py`
- `web/lib/get-workflows.ts`
- `web/components/workflow-editor-workbench.tsx`
- `web/components/workspace-starter-library.tsx`
- `docs/dev/runtime-foundation.md`

## 验证

- `api/.venv/Scripts/uv.exe run pytest tests/test_workflow_routes.py -q`
  - `42 passed`
- `web/pnpm exec tsc --noEmit`
  - 通过

## 结论

- 项目当前基础框架已经满足继续推进主要功能业务与产品设计目标，不需要回头重写底座。
- 当前更高价值的开发策略仍是：沿统一 validation / governance / diagnostics / runtime 主链，持续把“诚实性 + 可定位 + 可追溯 + 可扩展”补齐。
- 本轮把 validation issue 推进到 `field/path` 级后，workflow editor 与 workspace starter 已具备更真实的保存排障基础，后续再补表单高亮、starter portability、publish binding identity 或 sensitive access policy guard 会更自然。

## 下一步

1. 基于现有 `path` 元数据，把 workflow editor / workspace starter 表单做到真正的字段聚焦、高亮和跳转，而不是只在消息里展示 path。
2. 继续补 `starter portability`、`publish binding identity`、sensitive access policy 这些仍停留在 issue 摘要层的治理规则，让更多主业务入口共享同一套 validation surface。
3. 按 `runtime-foundation` 既定优先级，继续推进 graded execution、`WAITING_CALLBACK` durable resume、published callback drilldown 与 run diagnostics/operator 视图收口。
