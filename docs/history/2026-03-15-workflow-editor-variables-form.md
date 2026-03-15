# 2026-03-15 workflow editor variables form

## 背景

- 当前 workflow schema 已经稳定包含 `variables` 字段，`docs/product-design.md` 也把“工作流 = 节点 + 连线 + 变量 + 发布方式”列为基础模型。
- 但前端 editor 此前只会在 `definition` 中被动保留 `variables`，没有结构化编辑入口，导致全局输入、公共约束和后续发布 schema 仍容易散落到节点局部 config 或直接落回高级 JSON。
- 在最近几轮已经补齐 `runtimePolicy`、节点 contract、publish draft 与 tool policy 的前提下，workflow-level variables 已经成为继续提高编辑器完整度的明显缺口。

## 目标

- 给 workflow editor 增加最小可用的结构化 `variables` 编辑入口。
- 让 `definition.variables` 成为 editor 的显式状态，而不是只在保存时被动透传。
- 保持改动集中在前端 editor 壳层，不引入额外后端协议分叉。

## 实现

- 在 `web/components/workflow-editor-workbench/use-workflow-editor-graph.ts` 中新增 `workflowVariables` state，并把它接入 `currentDefinition` 生成链路与 workflow 切换时的 reset 逻辑。
- 在 `web/components/workflow-editor-inspector.tsx` 中新增独立 `WorkflowEditorVariableForm` 面板，和 publish form 一样作为 workflow-level section 挂在 inspector 下方，而不是混进节点 config。
- 新增 `web/components/workflow-editor-variable-form.tsx`：
  - 支持新增、删除变量
  - 支持编辑 `name / type / description / default`
  - 对重复变量名和空变量名给出本地提示
  - 对 `boolean / number / integer / string / JSON` 默认值做最小解析
- `workflow-editor` 现继续沿“节点级配置”和“workflow 级配置”分层推进，避免把更多全局语义继续堆回节点高级 JSON。

## 影响范围

- `web/components/workflow-editor-workbench/use-workflow-editor-graph.ts`
- `web/components/workflow-editor-inspector.tsx`
- `web/components/workflow-editor-workbench.tsx`
- `web/components/workflow-editor-variable-form.tsx`
- `docs/dev/runtime-foundation.md`

## 验证

- `cd web && pnpm lint`
- `cd web && pnpm exec tsc --noEmit`

## 结果判断

- workflow editor 现在已经可以显式维护 workflow-level variables，不再只能依赖 definition JSON 手工补。
- 这说明基础框架已经足够继续承接主业务完整度提升：schema、editor state 和保存链路都能沿当前边界自然演进，不需要重做基础框架。
- 当前仍未达到“只剩人工逐项界面设计 / 全链路人工验收”的阶段，因此这轮不触发通知脚本。

## 未决问题 / 下一步

1. 继续补 workflow 变量与节点输入映射、publish schema 之间的更强联动，而不是只做 editor 侧录入。
2. 给 editor 增加敏感访问策略入口，让 workflow-level governance 不再只停留在后端 API。
3. 视复杂度继续把 `use-workflow-editor-graph.ts` 的 workflow-level mutation 拆成独立 helper hook，避免 variables / publish / schema 治理继续回涨成单点热点。
