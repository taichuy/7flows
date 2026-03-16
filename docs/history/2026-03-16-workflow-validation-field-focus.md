# 2026-03-16 Workflow Validation Field Focus

## 背景

- 最近几轮已经把 workflow save / preflight / workspace starter 的 validation 统一成 `issues[] + path/field`，并接到 editor sidebar navigator。
- 但 editor 里的定位仍主要停留在 card / section 级：点击 publish / variables 相关 issue 只能高亮整张卡片，用户仍要自己在表单里继续找具体字段。
- 本轮项目复核结论仍成立：基础框架已经能支撑持续的功能性补真，当前优先级应继续沿既有主链补齐“可修复性”和一致性，而不是回头重搭骨架。

## 目标

- 让 `publish.{index}.*` 与 `variables.{index}.*` 的 validation issue 能携带字段级 focus 信息。
- 当用户从 sidebar navigator 点击问题时，inspector 内对应表单不仅切到目标卡片，还能自动滚动并聚焦到具体 input / select / textarea。
- 保持最小增量，不为 editor 再造一套独立的 focus/store 机制。

## 实现

### 导航目标

- `web/lib/workflow-validation-navigation.ts`
  - 为 `publish` / `variables` 的 focus target 新增 `fieldPath`。
  - 直接从 `publish.{index}.field`、`variables.{index}.field` 的 path 中提取剩余字段路径，复用现有 navigator 结果。

### Inspector 透传

- `web/components/workflow-editor-workbench.tsx`
  - 继续复用现有 `validationFocusTarget` 状态。
  - 在传给 inspector 时，新增 publish / variables 的字段路径透传。
- `web/components/workflow-editor-inspector.tsx`
  - 为 publish form / variable form 新增字段级 highlight props，不改 node inspector 现有边界。

### 表单聚焦

- `web/components/workflow-editor-variable-form.tsx`
  - 使用 `ref + data-validation-field` 做轻量定位。
  - 当命中变量 issue 时，自动滚动并聚焦到 `name / type / description / default` 对应字段。
- `web/components/workflow-editor-publish-form.tsx`
  - 继续把 endpoint 级 focus 下传到 endpoint card。
- `web/components/workflow-editor-publish-endpoint-card.tsx`
  - 为 `name / id / alias / path / protocol / authMode / workflowVersion / streaming / inputSchema / outputSchema / rateLimit / cache` 等当前会被 issue 命中的主要字段打上 `data-validation-field`。
  - 命中时自动滚动并聚焦到对应字段，而不只是给整张 endpoint 卡片加 focus ring。

## 影响范围

- `web/lib/workflow-validation-navigation.ts`
- `web/components/workflow-editor-workbench.tsx`
- `web/components/workflow-editor-inspector.tsx`
- `web/components/workflow-editor-variable-form.tsx`
- `web/components/workflow-editor-publish-form.tsx`
- `web/components/workflow-editor-publish-endpoint-card.tsx`
- `docs/dev/runtime-foundation.md`

## 项目现状判断

### 是否需要衔接最近提交

- 需要，而且这次是直接顺延。
- 上一轮已经把 variable / publish 的 `field/path` 元数据接到了 navigator 和保存主链；本轮把同一份元数据真正用于表单字段聚焦，属于同一条 editor validation 主线的自然续写。

### 基础框架是否已写好

- 是。当前 editor、preflight、正式保存、workspace starter 和 runtime 事实层已经形成可持续迭代的真实主链。
- 这次补的不是骨架，而是把已有 metadata 继续收成更好用的修复体验。

### 架构是否支撑后续功能推进

- 支撑。实现没有新增第二套 validation DSL，也没有让表单自己各玩一套路径协议，而是继续围绕统一的 `issues.path/field`、navigator target 和 inspector props 演进。
- 这符合“`7Flows IR` 单一事实模型 + 前端快检 + 后端权威验证 + UI 导航辅助”的架构方向。

### 仍需继续解耦的热点

- `web/components/workflow-editor-workbench.tsx` 依然偏长，但当前更多是 orchestration 壳层，不是立刻阻塞功能推进的 God component。
- 下一步若继续推进 node config 的字段级 focus，更适合在 inspector 子组件内继续拆小，而不是回头把整个 workbench 重写。

## 验证

- `web/pnpm exec tsc --noEmit`
  - 通过
- `web/pnpm lint`
  - 通过

## 结论

- 当前项目可以继续稳定推进，不需要回头重构基础框架。
- 这轮补的是 editor validation 导航的“最后一跳”，优先级高且风险低，直接提升了 workflow publish / variables 的可修复性。
- 人工逐项界面设计 / 验收阶段尚未到来，因此本轮不触发通知脚本。

## 下一步

1. 把 node config / node contract / runtime policy 也继续推进到字段级聚焦，补齐 editor validation 的剩余断点。
2. 按既定主线继续补 `starter portability`、`publish binding identity` 与 sensitive access policy guard。
3. 继续控制 `workflow-editor-workbench.tsx` 只做 orchestration，不让字段级逻辑回流主壳层。
