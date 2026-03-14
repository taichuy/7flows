# 2026-03-15 workflow editor publish draft 表单落地

## 背景

- `b36d058 feat: add tool gateway execution traces` 继续巩固了 runtime / tool / agent 三条执行主链的 execution trace 边界，说明后端执行骨架已经足够承接继续向上层产品功能推进。
- 但当前 workflow editor 里，`definition.publish` 仍只是在保存时被动透传；用户无法在编辑器内直接维护 publish draft，导致“可发布”虽然有后端事实层和独立治理页支撑，却缺少工作流定义阶段的前置入口。
- `docs/dev/runtime-foundation.md` 也已把“继续补 workflow publish 配置、明确 advanced JSON 与 structured form 边界”列为工作台完整度的近期重点，因此本轮优先承接这个缺口。

## 目标

1. 在 workflow editor inspector 中补上 workflow 级 `publish` 结构化配置入口，而不是只允许用户离开编辑器再到独立 publish 页面治理。
2. 保持工作流定义仍以单一 `definition` 保存，避免为 publish draft 另造一套前端状态协议。
3. 顺手把 inspector 继续按职责拆分，避免 workflow 级配置继续堆回节点 selection 面板。

## 实现

### 1. workflow graph state 开始显式维护 `publish` draft

- 在 `web/components/workflow-editor-workbench/use-workflow-editor-graph.ts` 中新增 `workflowPublish` draft 状态。
- `currentDefinition` 现在从 `nodes / edges + workflowPublish + persistedDefinition.variables` 共同组装，而不再只依赖 `persistedDefinition` 被动透传 `publish`。
- 新增 `updateWorkflowPublish()`，让 workflow 级 publish 改动也进入统一 dirty-check 和保存链路。

### 2. inspector 拆出独立 publish 表单组件

- 新增 `web/components/workflow-editor-publish-form.tsx`，专门承接 workflow 级 publish draft 编辑。
- `web/components/workflow-editor-inspector.tsx` 现在只做 selection details、publish draft 与 hints 三块拼装，不再把 workflow 级发布配置继续混进节点 section。

### 3. 结构化 publish draft 覆盖首批关键字段

- 当前表单已支持维护：
  - `id / name / alias / path`
  - `protocol / authMode / workflowVersion / streaming`
  - `inputSchema / outputSchema`
  - `rateLimit`
  - `cache.enabled / ttl / maxEntries / varyBy`
- 同时保留 “draft form 负责定义，正式发布与 API key 治理仍走独立 publish 页面” 的边界，避免 UI 误导为“只改 definition 就等于已发布”。

## 影响范围

- `web/components/workflow-editor-publish-form.tsx`
- `web/components/workflow-editor-inspector.tsx`
- `web/components/workflow-editor-workbench.tsx`
- `web/components/workflow-editor-workbench/use-workflow-editor-graph.ts`
- `README.md`
- `docs/dev/runtime-foundation.md`

## 验证

在 `web/` 目录执行：

```powershell
pnpm lint
pnpm exec tsc --noEmit
$env:NODE_ENV='production'; pnpm build
```

结果：

- `pnpm lint` 通过
- `pnpm exec tsc --noEmit` 通过
- `NODE_ENV=production` 下 `pnpm build` 通过

补充说明：

- 默认环境里存在非标准 `NODE_ENV`，会让 `pnpm build` 触发 Next.js 的构建噪音；本轮已明确用标准 `production` 环境复核实际构建结果。

## 当前结论

- 基础框架已经足够继续向产品主业务推进，不需要再停留在“只做底层骨架”的阶段。
- 上一次提交的 execution trace 工作仍然是正确方向，且没有阻塞本轮继续把 workflow editor 向“可发布工作流定义”补齐。
- 当前前端边界更诚实：workflow editor 现在可以定义 publish draft，但正式发布、生命周期治理、API key 管理和调用审计仍明确留在独立 publish 页面。

## 下一步

1. 给 workflow editor 继续补敏感访问策略入口，让 publish / execution / security 三类治理入口在定义阶段对齐。
2. 继续拆 `web/components/run-diagnostics-execution-sections.tsx`，把 execution / evidence drilldown 从大详情组件中分层抽出。
3. 继续拆 `api/app/schemas/workflow.py` 的 publish schema / validators，避免 IR schema 与发布校验继续堆在单文件中。
