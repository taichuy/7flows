# 2026-03-17 tool governance catalog / publish visibility

## 背景

- `docs/dev/runtime-foundation.md` 的 `P0` 已明确把下一步收敛到：继续把高风险 tool 的治理解释补到更多作者与 operator 入口，而不是只让保存前校验或 runtime 阻断承担全部提示责任。
- 2026-03-17 当天早些时候，workflow editor 已补上 tool governance 可见性，但首页 plugin catalog 与 workflow publish invocation detail 还缺少同一份解释：
  - plugin catalog 只能看到 schema / runtime binding，看不到 `sensitivity_level -> default execution class` 的治理结果；
  - publish detail 在 callback waiting / approval pending 场景下，operator 能看到阻断结果，却很难回到“这个 tool 默认为什么需要 sandbox / microvm”的原因。

## 目标

1. 继续沿同一条 `tool governance` 主线，把 catalog 与 publish detail 接上统一的执行 / 敏感级别解释。
2. 避免把展示逻辑继续散落在多个页面里，减少前端对同一治理事实的文案漂移。
3. 在不新增后端接口的前提下，优先复用已有 `pluginRegistry.tools` 和 publish detail callback ticket 事实。

## 实现

### 1. 抽共享 `ToolGovernanceSummary`

- 新增 `web/components/tool-governance-summary.tsx`。
- 统一复用 `web/lib/tool-governance.ts` 已有的治理推导：
  - `sensitivityLevel`
  - `defaultExecutionClass`
  - `strongestExecutionClass`
  - `governedBySensitivity`
  - `supportedExecutionClasses`
  - `summary`
- 让 catalog / publish detail 后续都消费同一份呈现层，而不是再手写一版 badge + summary 拼接。

### 2. 首页 plugin catalog 接入治理排序与摘要

- `web/components/plugin-registry-panel.tsx` 现在会先按 `compareToolsByGovernance` 排序工具目录。
- 每个 tool card 额外展示共享 `ToolGovernanceSummary`，直接暴露：
  - 敏感级别
  - 默认执行级别
  - 最高可用执行边界
  - 是否由敏感等级驱动收口
  - supported execution classes
- 这样首页 catalog 不再只是“目录同步结果可见”，也开始承担作者判断高风险 tool 隔离要求的入口。

### 3. publish invocation detail 接入 tool governance context

- `web/app/workflows/[workflowId]/page.tsx` 把 `pluginRegistry.tools` 继续下传到 publish panel。
- `WorkflowPublishPanel -> WorkflowPublishBindingCard -> WorkflowPublishActivityPanel -> WorkflowPublishActivityDetails -> WorkflowPublishInvocationDetailPanel` 补齐 tool catalog props 透传。
- `web/components/workflow-publish-invocation-detail-panel.tsx` 现在会：
  - 从 callback tickets 提取关联 `tool_id`
  - 回查当前 tool catalog
  - 在 detail 中新增 `Tool governance context` section
  - 对已匹配的 tool 展示共享治理摘要
  - 对当前 catalog 中找不到的 tool id 给出 `missing catalog entry` 提示

## 影响评估

### 架构链条

- **扩展性增强**：统一展示组件把 editor / catalog / publish detail 的治理文案收敛到同一条前端 helper + presenter 主链，后续继续扩到 workflow library 或 run diagnostics 时不需要再复制判断。
- **兼容性增强**：全程复用现有 `pluginRegistry.tools` 与 publish detail callback ticket，不引入新的接口格式或第二套治理模型。
- **可靠性 / 稳定性增强**：作者与 operator 现在更早看到“为何默认强隔离”的原因，降低只看到阻断、不知道治理来源的排障成本。
- **安全性增强**：高风险 tool 的默认执行边界不再只体现在保存前报错或 runtime fail-closed；catalog 和 publish detail 也会主动提醒其敏感级别与隔离要求。

### 对产品闭环的帮助

- 这轮属于 **人与 AI 协作层 + AI 治理层** 的继续补闭环，不是脱离主线的局部美化。
- **人使用场景**：workflow 作者在首页 plugin catalog 就能判断哪些 tool 天然更高风险。
- **人与 AI 协作场景**：workflow operator 在 publish invocation detail 里能把 callback waiting / approval pending 与具体 tool 的治理原因对应起来。
- **AI 治理层**：`sensitivity -> execution` 不再只存在于后端 contract 和 editor 保存前校验，也开始进入更完整的人类观察面。

## 验证

- `web/pnpm exec tsc --noEmit`
- `web/pnpm lint`
  - 结果：通过（仅有 Next.js 关于 `next lint` 弃用提示）

## 下一步

1. 继续把同一份 tool governance 摘要补到 workflow library / starter authoring 入口，让“首页 catalog / editor / publish detail”三处之外的工作流来源也保持一致。
2. 若 publish detail 后续补到更完整的 tool call detail，可继续把治理摘要从 callback ticket 场景扩展到所有真实 tool call，而不只限于 waiting callback。
3. 继续按 `runtime-foundation` 的 P0 主线推进 profile / dependency governance 与真实隔离兑现，避免治理展示先行但 runtime 能力解释仍停在 execution class 一层。
