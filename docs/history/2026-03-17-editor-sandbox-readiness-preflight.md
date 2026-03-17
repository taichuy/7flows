# 2026-03-17 workflow editor sandbox readiness preflight

## 背景

- `docs/dev/runtime-foundation.md` 已把 sandbox readiness summary 补到了 system overview 与首页，但 workflow editor 本地 preflight 仍只校验 adapter 可见性与 execution class 支持情况。
- 这会留下作者侧的真实断层：builder 在编辑器里声明 `sandbox` / `microvm` 时，往往要等到保存时的 server-side validation，甚至运行时 blocked，才知道当前环境其实没有对应隔离链路。
- 对“沙箱隔离以及安全可靠可信这个链路场景”来说，这意味着 readiness 事实还没有真正进入作者工作面，前端与 runtime 的安全契约仍有一跳缺口。

## 目标

- 把 `system overview.sandbox_readiness` 复用到 workflow editor 本地 tool execution validation。
- 让作者在保存前就能看到“adapter 支持 ≠ sandbox readiness ready”的区别。
- 继续复用既有 validation / persistence 主链，不额外新增第二套 editor 专用诊断模型。

## 本轮实现

### 1. workflow 页面引入 sandbox readiness 数据源

- 更新 `web/app/workflows/[workflowId]/page.tsx`
- workflow editor 页面现在会并行读取 `getSystemOverview()`，并把 `sandbox_readiness` 透传给 `WorkflowEditorWorkbench`。

### 2. editor validation 主链接入 sandbox readiness

- 更新 `web/components/workflow-editor-workbench.tsx`
- 更新 `web/components/workflow-editor-workbench/use-workflow-editor-validation.ts`
- `useWorkflowEditorValidation()` 现在会把 `sandboxReadiness` 继续传给 `buildWorkflowToolExecutionValidationIssues()`。
- 保存阻断文案也同步从“对齐 adapter 绑定与 execution class”升级成“对齐 adapter 绑定、execution class 与 sandbox readiness”。

### 3. tool execution capability helper 补 readiness gate

- 更新 `web/lib/workflow-tool-execution-validation.ts`
- 更新 `web/lib/workflow-tool-execution-validation-helpers.ts`
- 更新 `web/lib/workflow-tool-execution-validation-types.ts`
- 当前本地校验语义变为：
  - native tool：继续诚实提示只支持 `inline`
  - compat tool：先校验 adapter 是否存在且支持请求的 execution class
  - 若请求的是 `sandbox` / `microvm`：进一步校验 `sandbox_readiness.execution_classes`
  - readiness 不可用时，直接返回结构化 validation issue，并带上 readiness reason

## 影响评估

### 架构链条

- **扩展性增强**：前端不再自己推导 sandbox 状态，而是直接复用 system overview 的 readiness 聚合事实；后续 backend capability 继续扩展时，只需要沿同一条事实源演进。
- **兼容性增强**：作者侧现在能清楚区分“adapter 支持执行类型”和“当前 sandbox 链路真的 ready”这两层不同语义，减少对 compat adapter 能力的误读。
- **可靠性 / 稳定性增强**：把强隔离缺口前移到编辑阶段暴露，减少保存后或运行时才发现环境不支持的滞后反馈。
- **安全性增强**：`sandbox` / `microvm` 的显式声明不再只在 runtime fail-closed，也开始在 editor preflight 上诚实暴露 readiness gap，更符合安全承诺前置的方向。

### 对产品闭环的帮助

- 这轮推进的是 **用户层 + AI 与人协作层 + AI 治理层** 之间的主链衔接，不是纯样式修补。
- **人类作者 / operator**：在编辑 workflow 时就能判断当前环境是否真的适合声明强隔离 execution class。
- **人与 AI 协作**：AI 帮助生成或调整 workflow definition 时，编辑器可以更早反馈 sandbox readiness gap，减少“生成了安全声明但环境并未兑现”的错配。
- **AI 治理层**：sandbox readiness 事实从首页概览继续下沉到了作者入口，安全可靠可信链路不再只靠运行后诊断。

## 验证

- `cd web; pnpm exec tsc --noEmit`
  - 结果：通过
- `cd web; pnpm lint`
  - 结果：通过

## 未完成与下一步

1. 把同一条 readiness explanation 继续下沉到 publish / run diagnostics drilldown，避免作者面、operator 面和 runtime 事实再次分叉。
2. 继续压缩 `web/lib/workflow-tool-execution-validation.ts` 与 helper 的聚合复杂度，避免 editor validation 热点再次膨胀。
3. 继续推进 native tool 的统一 sandbox backend contract，而不是长期停留在前端/运行时双重 fail-closed 提示。
