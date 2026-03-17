# 2026-03-17 编辑器补齐 tool governance 可见性

## 背景

- `P1` 的工作流编辑器主线已经补上 tool catalog reference guard、tool execution capability guard 和 sandbox readiness preflight。
- 但作者在节点配置面板里仍然需要先跳去 plugin registry，或等保存前 validation 报错，才能知道某个 tool 的 `sensitivity_level`、默认执行级别和强隔离要求。
- 这会让 `llm_agent.toolPolicy.execution` 与 `allowedToolIds` 的治理动作停留在“校验能挡住”，还没有推进到“作者在配置时就看清楚”。

## 目标

- 把 tool governance 事实从 plugin registry / preflight validation 下沉到 workflow editor 的结构化配置面板。
- 让作者在 `tool` 节点绑定与 `llm_agent.toolPolicy` 白名单配置时，直接看到高敏 tool 的默认隔离约束。
- 顺手把这部分显示逻辑沉淀成共享 helper，避免后续继续把判断散落在单个表单组件里。

## 实现

### 1. 新增共享治理 presenter

- 新增 `web/lib/tool-governance.ts`，统一收口：
  - `sensitivity_level`
  - `default_execution_class`
  - `supported_execution_classes`
  - strongest execution class
  - “是否由 sensitivity 驱动收口到强隔离”的摘要判断
- 同时提供 `compareToolsByGovernance`，让编辑器中的工具选择按治理强度排序，而不是纯目录顺序堆叠。

### 2. Tool 节点表单补治理摘要

- `web/components/workflow-node-config-form/tool-node-config-form.tsx` 现在在选中 tool 后会直接展示：
  - `sensitivity Lx`
  - `default sandbox/microvm/...`
  - supported execution classes
  - 一段结构化 governance summary
- 这样作者在单个 tool binding 场景下，不需要离开当前表单就能判断该节点默认需要什么执行边界。

### 3. LLM Agent 的 toolPolicy 白名单补治理视图

- `web/components/workflow-node-config-form/llm-agent-tool-policy-form.tsx` 现在会：
  - 先按治理强度排序可调用工具
  - 汇总当前 callable tool 中，多少个默认执行级别已收口到 `sandbox / microvm`
  - 为每个可选 tool 显示 sensitivity / default execution / supported execution classes / summary
- 这让 `toolPolicy.execution` 与 `allowedToolIds` 的组合不再只是“保存前校验”，而是变成“配置时即看到高敏工具边界”的 authoring 反馈。

## 影响范围

- **扩展性**：治理展示逻辑抽到共享 helper，后续可复用于 publish/editor/run diagnostics，而不是继续复制判断。
- **兼容性**：只消费现有 tool catalog 字段，没有引入第二套 schema 或新的 runtime contract。
- **可靠性 / 稳定性**：减少作者误把高敏 tool 与低隔离 execution override 混配的概率，把错误从 runtime/保存前前移到配置阶段。
- **安全性**：高敏 tool 的默认强隔离要求现在对作者更可见，降低“明明有治理规则，但 UI 不显式提示”的认知落差。

## 验证

- `web/pnpm exec tsc --noEmit`
- `web/pnpm lint`

## 下一步

1. 继续把 `sensitive access policy` 做成 editor 内可编辑的结构化入口，而不只是在 runtime/request detail 中展示结果。
2. 继续治理 `workflow-tool-execution-validation.ts`、`workflow-editor-variable-form.tsx` 等聚合热点，避免 editor 逻辑重新堆回单体文件。
3. 如后续进入 publish / run detail 交叉场景，可复用 `tool-governance.ts` 把同一份 governance 文案延伸到 published surface 和 diagnostics。 
