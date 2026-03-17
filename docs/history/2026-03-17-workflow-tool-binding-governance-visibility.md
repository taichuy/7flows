# 2026-03-17 workflow tool binding governance visibility

## 背景

- `docs/dev/runtime-foundation.md` 的 `P0 sandbox / protocol` 主线已经把工具治理摘要逐步补到首页 plugin catalog、workflow editor、publish detail、starter 创建与 workspace starter library；但首页 `Tool node binding` 仍停留在“能改绑 compat tool”这一级。
- 这会留下一个作者侧治理断层：
  - 已存在的 workflow 在首页就能改绑工具，但作者看不到当前绑定工具的默认执行边界；
  - 如果某个已绑定工具已经脱离当前 catalog，也要等保存失败或进入编辑器后才知道；
  - 工具下拉列表没有按治理优先级排序，高风险 / 强隔离工具不够显眼。

## 目标

1. 让首页 `Tool node binding` 入口也能直接解释当前绑定工具的治理状态，而不是只提供“改个 toolId”的表面能力。
2. 让作者在改绑前就看到候选工具的默认执行边界与支持的 execution classes。
3. 继续复用已有 `ToolGovernanceSummary` 与治理 helper，不新增第二套 API 或展示模型。

## 实现

### 1. 绑定总览补治理摘要

- `web/components/workflow-tool-binding-panel.tsx` 现在会在 workflow overview 里直接汇总：
  - `Governed bindings`
  - `Strong isolation`
  - `Catalog gaps`
- 这样作者在首页切换 workflow 时，就能先判断当前 binding 面是否已经带入高风险工具或目录漂移。

### 2. 每个 tool node 卡片补当前绑定治理事实

- 对已绑定且仍在当前 catalog 中的工具，卡片内直接复用 `ToolGovernanceSummary` 展示：
  - `sensitivity_level`
  - `default_execution_class`
  - `supported_execution_classes`
  - 是否由敏感级别驱动默认强隔离
- 如果当前绑定工具已经不在 catalog 中，会直接显示 `catalog gap` 错误提示，避免作者继续在失真状态下操作。

### 3. 绑定表单补候选工具治理预览

- `web/components/workflow-tool-binding-form.tsx` 现在会：
  - 按 `compareToolsByGovernance` 对候选工具排序；
  - 在下拉框下直接展示当前选中工具的 `Selected tool governance` 摘要；
  - 当选中工具已不在 catalog 中时，提前提示先同步目录或改绑到可用定义。
- 这样首页绑定页不再只是“保存后出结果”，而是开始具备保存前的最小治理解释。

## 影响评估

### 对主链闭环的帮助

- **用户层**：已有 workflow 的作者不需要先进编辑器，首页就能判断工具绑定是否会带来更高隔离成本。
- **人与 AI 协作层**：绑定页与 editor / starter / publish detail 开始共享同一份工具治理事实，减少入口切换时的信息漂移。
- **AI 治理层**：`sensitivity -> default execution -> supported execution classes -> catalog gap` 这条链路继续前移到现有 workflow 的运维/改绑入口，而不只是新建和保存前校验。

### 架构影响

- 继续复用 `ToolGovernanceSummary` 与 `compareToolsByGovernance`，没有新增新的 API、持久化字段或第二套治理 contract。
- 首页绑定面从“只写 toolId”提升到“解释为什么这个绑定需要更强隔离”，但仍保持在现有 workflow authoring 入口内，没有引入额外页面或分支模型。

## 验证

- `web/pnpm exec tsc --noEmit`
- `web/pnpm lint`
  - 结果：通过（仅有 Next.js 关于 `next lint` 弃用提示）

## 下一步

1. 继续把同一份工具治理摘要补到剩余 workflow library / workflow source 入口，避免已有 workflow 与 starter/workspace 模板在作者心智上再次分叉。
2. 回到 `P0 sandbox / protocol` 主线，继续推进 profile / dependency governance 的真实隔离兑现，避免前端治理展示已经充分，但 runtime capability 仍主要停在 execution class 一层。
3. 若首页 binding 后续开始承接更多治理动作，可继续补“改绑后回到 editor 精确定位相关 node / issue”的跳转链，而不是只停留在当前页提示。
