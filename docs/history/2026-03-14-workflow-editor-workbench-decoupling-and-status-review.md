# 2026-03-14 Workflow Editor Workbench Decoupling And Status Review

## 背景

- 用户要求先通读 `AGENTS.md`、`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/dev/runtime-foundation.md` 与 `docs/dev/user-preferences.md`，再判断项目现状、最近一次 Git 提交是否需要衔接、基础框架是否足够支撑后续功能性开发，以及哪些长文件需要继续解耦。
- 最近一次 Git 提交 `aa469e5 refactor: split published gateway routes` 已完成 published gateway route 层拆分，因此下一步应回到 `docs/dev/runtime-foundation.md` 的 P0 主线，继续治理 workflow editor 完整度与前端结构热点。

## 现状判断

### 1. 最近一次 Git 提交是否需要衔接

- 需要衔接。
- 上一次提交已经把发布路由层从单文件热点拆到 native / OpenAI / Anthropic 独立 route，说明发布面 route 层的整理已进入“service / streaming 继续治理”的下一阶段。
- 与此同时，`runtime-foundation` 中剩余的 P0 主线仍然是 workflow editor 完整度与状态编排收口，因此本轮优先转向 `web/components/workflow-editor-workbench.tsx`。

### 2. 基础框架是否已经足够支撑功能性开发

- 是，当前项目已经不是“只有设计稿”的阶段。
- 后端已有迁移、workflow definition/version、compiled blueprint、runtime、run/node_run/run_event、artifact、published surface、API key、credential、plugin registry、callback ticket 等主链能力。
- 前端已有工作台首页、workflow library、workflow editor、run diagnostics、publish governance、workspace starters、plugin registry、credential store 等工作台骨架。
- 结论是：可以继续沿产品设计目标推进主要业务完整度，但仍未到“只剩人工界面设计”的阶段。

### 3. 架构是否满足扩展性、兼容性、可靠性、稳定性与安全性

- **扩展性 / 兼容性**：总体满足。内部仍以 `7Flows IR` 为核心，Dify / OpenAI / Anthropic 仍是旁挂映射层，没有反向主导内部模型。
- **可靠性 / 稳定性**：主链可持续推进，但 durable execution 仍有缺口，`WAITING_CALLBACK` 还需后台唤醒与完整 callback bus / scheduler 收口。
- **安全性**：方向正确。沙盒、凭据、发布 API key、artifact 引用与授权上下文都已有落点，但沙盒执行与发布治理仍需持续硬化。
- **人工验收阶段判断**：当前还没达到“只剩人工界面设计”的完整度，因此本轮不触发 `node "e:\code\taichuCode\ai-presson-wen\aionui\notice\kill-port-8050.js"`。

## 本轮实现

### 1. 继续解耦 workflow editor workbench

- 新增 `web/components/workflow-editor-workbench/use-workflow-editor-graph.ts`，承接 graph state、节点/连线增删改、JSON config 应用与 runtimePolicy 编辑。
- 新增 `web/components/workflow-editor-workbench/use-workflow-run-overlay.ts`，承接 recent runs、selected run、run detail/trace 拉取和 overlay 刷新。
- `web/components/workflow-editor-workbench.tsx` 从 580 行收口到 237 行，只保留 orchestrator、保存动作和三栏布局组合。
- `web/components/workflow-editor-workbench/shared.ts` 补充 `WorkflowEditorMessageTone`，让 workbench / sidebar 在消息语义上共用同一类型。

### 2. 结构收益

- 编辑器主文件不再同时持有 graph mutation、run overlay 副作用和保存编排三类职责。
- 当前拆分方式符合组件重构约束：优先抽离稳定 hook，而不是继续在 JSX 中堆叠状态与副作用。
- 这一步没有改动 workflow editor 的事实模型、节点 schema 或运行行为，属于结构治理，能为下一轮补配置 section 留出更清晰边界。

## 影响范围

- `web/components/workflow-editor-workbench.tsx`
- `web/components/workflow-editor-workbench/use-workflow-editor-graph.ts`
- `web/components/workflow-editor-workbench/use-workflow-run-overlay.ts`
- `web/components/workflow-editor-workbench/shared.ts`
- `web/components/workflow-editor-workbench/workflow-editor-sidebar.tsx`
- `docs/dev/runtime-foundation.md`

## 验证

- `cd web; pnpm exec tsc --noEmit`
- 结果：通过。
- `cd web; pnpm lint`
- 结果：未通过，但失败点来自未改动文件 `web/components/credential-store-panel.tsx` 中既有的 `react/no-unescaped-entities` 报错，不是本轮 workbench 拆分引入的新问题。

## 结论

- 最近一次 Git 提交需要衔接，本轮已按优先级完成衔接：在 published gateway route 拆分之后，继续收口 workflow editor 的主文件热点。
- 当前基础框架已经满足继续推进产品设计目标、插件扩展性与兼容层演进，但仍需继续补 durable callback、publish service / streaming 治理、run diagnostics 详情层与结构化编辑器配置。

## 下一步规划

1. **P0：继续补 workflow editor 结构化配置段**
   - 优先把 provider / model / publish 相关配置整理成稳定 section，避免再次回到大 JSON 文本驱动。
2. **P1：补齐 `WAITING_CALLBACK` 后台唤醒闭环**
   - 继续把 callback ticket、scheduler 和 resume orchestration 衔接成 durable execution 主链。
3. **P1：继续治理 run diagnostics 详情层**
   - 优先拆 `web/components/run-diagnostics-execution-sections.tsx` 的 payload / metrics / artifact / evidence drilldown。
4. **P1：继续治理 published service / streaming 热点**
   - route 层已拆开，下一阶段继续收紧 `api/app/services/published_gateway.py` 与 `api/app/services/published_protocol_streaming.py` 的 surface orchestration。
