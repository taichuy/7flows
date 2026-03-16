# 2026-03-16 Workflow Editor Workbench Decoupling

## 背景

- 最近几轮 workflow editor 持续补强了 node support、contract preflight、tool reference / execution guard、publish version 与 variable validation navigation。
- 这些能力真实落地后，`web/components/workflow-editor-workbench.tsx` 开始同时承担 validation 聚合、save / starter persistence、run overlay 编排和 inspector 透传，主壳层长度已接近 550 行。
- 本轮项目现状复核结论是：基础框架已足够承接持续功能开发，不需要回头重搭；更高优先级是顺着现有主链继续清理热点，避免 editor orchestration 再次膨胀成单体组件。

## 目标

- 把 workflow editor 主壳层里的 validation 聚合与 persistence 行为拆出到专用 hook。
- 保持现有用户行为、提示文案、preflight / starter 保存语义不变。
- 让 `workflow-editor-workbench.tsx` 回到 orchestration shell 定位，为后续 schema builder、sensitive access policy 与更多 workflow-level governance 继续预留清晰边界。

## 实现

### 1. Validation 聚合下沉

- 新增 `web/components/workflow-editor-workbench/use-workflow-editor-validation.ts`
- 统一承接：
  - unsupported node 聚合
  - contract / tool reference / tool execution / publish version / variables validation 汇总
  - validation navigator items 生成
  - save / starter 共用的 blocked message 组装
- 保留 `summarizePreflightIssues` 与 `summarizeWorkspaceStarterValidationIssues`，供保存链路复用，避免摘要逻辑散落回主组件。

### 2. Persistence 行为下沉

- 新增 `web/components/workflow-editor-workbench/use-workflow-editor-persistence.ts`
- 统一承接：
  - `保存 workflow`
  - `保存为 workspace starter`
  - validation navigator 点击后的 focus / message 行为
  - save / starter 的 transition 状态控制
- 继续复用现有 `validateWorkflowDefinition`、`updateWorkflow`、`createWorkspaceStarterTemplate` 与 starter payload builder，不新造第二套保存协议。

### 3. Workbench 回收为壳层

- `web/components/workflow-editor-workbench.tsx`
  - 主文件从约 545 行降到约 219 行。
  - 现在主要保留 graph / run overlay / validation / persistence 四段 orchestration，以及 hero / sidebar / canvas / inspector 组装。
  - 组件不再内联维护大段 validation summary 与 persistence 分支，后续更容易继续沿 hook 边界演进。

## 影响范围

- `web/components/workflow-editor-workbench.tsx`
- `web/components/workflow-editor-workbench/use-workflow-editor-validation.ts`
- `web/components/workflow-editor-workbench/use-workflow-editor-persistence.ts`
- `docs/dev/runtime-foundation.md`

## 项目现状判断

### 是否需要衔接上一轮提交

- 需要，而且本轮是直接顺延。
- 上一轮提交 `97b567e feat: focus workflow validation fields in editor` 已把 validation navigator 的“字段级聚焦”补到 publish / variables 表单；本轮继续把这些 validation / persistence 逻辑从主 workbench 壳层下沉，属于同一条 editor 治理主线，而不是另起炉灶。

### 基础框架是否已经写好

- 是。
- 当前后端 runtime、published surface、sensitive access 与前端 workflow editor 主链都已形成真实闭环；本轮工作不是“补骨架”，而是控制复杂度，确保后续功能还能继续稳定叠加。

### 架构是否满足后续开发、扩展性、兼容性与稳定性

- 基本满足，且这轮改动是正向增强：
  - 没有引入第二套 DSL 或第二套保存协议。
  - 没有把 validation 规则复制到多个组件里分叉演进。
  - 继续围绕 `issues.path/field`、前端快检、后端权威 preflight 和统一 persistence surface 演进。
- 对后续插件扩展、兼容层接入与应用可靠性而言，更重要的是保持 editor 壳层不重新长成 God component；本轮拆分正是在清理这个风险。

### 是否还有需要继续解耦的文件

- 有，但已经从“主壳层阻塞”转为“可控热点”：
  - `web/components/workflow-editor-workbench/use-workflow-editor-graph.ts` 仍承接 nodes / edges / variables / publish draft 的 mutation，是 workflow editor 下一轮最值得继续拆解的热点。
  - `web/components/workspace-starter-library.tsx`、`web/components/run-diagnostics-execution/execution-node-card.tsx` 也仍偏长，但没有当前 editor 主壳层这么直接阻塞持续开发。

## 验证

- `web/pnpm lint`
  - 通过
- `web/pnpm exec tsc --noEmit`
  - 通过

## 结论

- 项目当前不需要回头重构基础框架，主业务完整度仍可继续推进。
- 本轮优先级选择为“解耦已形成共性热点的 editor orchestration 壳层”，收益高、风险低、且直接服务后续 workflow editor 持续补真。
- 还未达到“需要人工逐项做界面设计与验收”的阶段，因此本轮不触发通知脚本。

## 下一步

1. 把 `use-workflow-editor-graph.ts` 中 workflow-level mutation 继续拆成 publish / variables helper hook。
2. 在现有 validation navigation 基础上继续补 node config / runtime policy / schema builder 的字段级聚焦。
3. 继续沿现有主链补敏感访问策略入口与更细粒度的 publish / starter portability guard，而不是回头推翻 editor 结构。
