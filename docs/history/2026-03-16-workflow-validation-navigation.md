# 2026-03-16 Workflow Validation Navigation

## 背景

- 2026-03-16 前一轮提交 `d29ec42 feat: add workflow validation field paths` 已把 workflow save / preflight 的 `validation issue` 扩展为带 `field` / `path` 元数据。
- 但 workflow editor 前端仍主要把这些问题当成纯文本摘要展示，用户看到错误后还需要自己在 Inspector、publish draft 和 variables 区域来回搜索。
- `docs/dev/runtime-foundation.md` 已把“基于 `path` 的表单高亮 / 聚焦”列为 workflow editor 完整度的 P1 后续项，因此这一轮适合直接承接上一轮提交继续闭环。

## 目标

- 把前后端已经对齐好的 `validation issue path` 从“可返回元数据”推进到“可在编辑器中定位问题”。
- 让 workflow editor 对 contract schema、tool reference、tool execution capability、publish version 这几类真实 preflight 问题提供统一入口，而不是继续散落在消息摘要里。
- 用最小改动先打通“定位到对应节点 / publish endpoint / variable 卡片”的主链，不额外引入复杂状态机或重型表单框架。

## 实现

### 1. 前端校验 issue 统一补齐可导航元数据

- 给 `web/lib/workflow-contract-schema-validation.ts`、`web/lib/workflow-tool-reference-validation.ts`、`web/lib/workflow-tool-execution-validation.ts`、`web/lib/workflow-publish-version-validation.ts` 补齐前端本地 issue 的 `path` / `field`。
- 新增 `web/lib/workflow-validation-navigation.ts`，统一把 `nodes.{index}.*`、`publish.{index}.*`、`variables.{index}.*` 这类路径解析成编辑器可消费的 focus target。

### 2. Workflow editor 侧栏补齐 validation navigator

- `web/components/workflow-editor-workbench.tsx` 现在会把本地 validation issue 与后端 preflight 返回的 issue 合并成统一 navigator 列表。
- 保存失败时会保留 server-side issue，避免后端已经给出结构化 path，但前端下一次渲染又丢失上下文。
- `web/components/workflow-editor-workbench/workflow-editor-sidebar.tsx` 新增 validation issue button 列表，点击即可触发定位。

### 3. Inspector / publish / variables 接入高亮聚焦

- `web/components/workflow-editor-inspector.tsx` 现在会根据 focus target 高亮对应 node config / node contract / runtime policy 区块。
- `web/components/workflow-editor-publish-form.tsx` 与 `web/components/workflow-editor-publish-endpoint-card.tsx` 支持高亮目标 publish endpoint 卡片。
- `web/components/workflow-editor-variable-form.tsx` 支持高亮目标 variable 卡片。
- `web/components/workflow-node-config-form/node-io-schema-form.tsx` 与 `web/components/workflow-node-config-form/runtime-policy-form.tsx` 接入统一 focus ring。
- `web/app/globals.css` 新增 validation focus / navigator 样式，保持现有编辑器视觉语义不变，只增加轻量的定位反馈。

## 影响范围

- workflow editor 的问题定位效率提升，后续继续补 schema builder、敏感访问策略入口、publish binding/starter portability 校验时，可以沿用同一套导航机制。
- 前端与后端围绕 `validation issue path` 的契约闭环更完整，后续不需要再回退成“后端返回 path，前端只显示 message”的半成品状态。
- 当前实现仍是“点击问题 -> 高亮目标区块”的轻量方案，尚未做到字段级自动滚动、输入框级聚焦或复杂 JSON 局部定位；这些可作为下一步继续细化。

## 验证

- `web/pnpm exec tsc --noEmit`
- `web/pnpm lint`

## 未决问题 / 下一步

- 继续把 variable 本地重复名 / 空名等问题也收口成结构化 `path` issue，避免 variables 仍有一部分只停留在纯文本校验。
- 如果后续引入 schema builder，可在现有 focus target 基础上继续向字段级 focus 演进，而不是重写整套导航逻辑。
- `workflow-editor-workbench.tsx` 当前已承担较多 orchestration；若后续 validation navigator 继续扩展，可考虑再下沉成独立 hook / presenter，避免重新长回热点文件。
