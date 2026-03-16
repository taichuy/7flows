# 2026-03-16 架构审查补充结论

## 背景

- 在既有 `2026-03-16-architecture-capacity-review.md` 的基础上，再补做一轮文档、关键代码入口、热点文件和验证链路抽查，用于回答“当前基础框架是否足够继续主业务闭环开发，以及剩余结构/安全缺口在哪里”。
- 本轮重点补核 `RuntimeExecutionAdapterRegistry`、`PluginExecutionDispatchPlanner`、`PublishedEndpointGatewayService`、`run trace` 视图层、workflow editor page/workbench，以及当前长文件热点是否会拖慢后续演进。

## 复核范围

- 文档：`AGENTS.md`、`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/open-source-commercial-strategy.md`、`docs/dev/runtime-foundation.md`、`docs/dev/user-preferences.md`
- 后端抽查：`api/app/services/runtime.py`、`api/app/services/runtime_execution_adapters.py`、`api/app/services/plugin_execution_dispatch.py`、`api/app/services/published_gateway.py`、`api/app/services/run_trace_views.py`
- 前端抽查：`web/app/workflows/[workflowId]/page.tsx`、`web/components/workflow-editor-workbench.tsx`、`web/components/workflow-editor-variable-form.tsx`、`web/lib/get-workflow-publish.ts`
- 验证：`cd api; .\.venv\Scripts\uv.exe run pytest -q`、`cd web; pnpm exec tsc --noEmit`

## 补充结论

### 1. 基础框架已经写到“可以持续做功能”的阶段

- 当前后端主链已经形成 `workflow version -> compiled blueprint -> runtime -> run/node_run/run_events -> published surface -> run diagnostics` 的统一事实流，不需要回头重搭骨架。
- `RuntimeService` 虽然仍是主入口，但 graph/lifecycle/node-preparation/node-dispatch/run-support 已通过 mixin 下沉；`PublishedEndpointGatewayService` 也已经收口成 facade + resolver/invoker/cache/response builder 组合，说明主骨架并未继续失控长成单体服务。
- 前端 workflow 页面已经采用“page 聚合取数 -> workbench shell -> graph/validation/persistence/run overlay hook -> inspector/sidebar/canvas”这一层次，足以继续承接 editor、publish、diagnostics 的持续增强。

### 2. 插件扩展性与兼容性方向是对的，但强隔离语义还未完全兑现

- 当前内部模型仍然围绕 `7Flows IR`、runtime records 和 `run_events` 展开，published protocols 与 Dify compat 都是在外围映射，没有反向主导核心执行链。
- `sandbox_code` 的强隔离缺口已经具备明确边界：没有兼容 backend 时会 fail-closed，而不是静默退回 `inline`。
- 但这条语义还没有完全扩展到高风险 `tool/plugin` 路径：native tool 目前仍固定 `inline`，compat adapter 也会在声明 execution class 不支持时回落到 adapter 首个支持项。因此 execution-aware contract 与 trace 已经具备，真正的 capability-driven 强隔离兑现还需要继续做完。

### 3. 可靠性、稳定性和安全性已经有事实基础，但仍是“可继续加强”而不是“已经完工”

- `SensitiveAccessControlService`、`ApprovalTicket`、`NotificationDispatch`、trace export gating、published invocation detail access 已形成统一治理事实层，说明安全线已经进入主系统而不是外挂能力。
- waiting / resume / callback ticket / artifact store / published invocation audit 也都已经存在，后续重点是 operator 体验和自动唤醒闭环，而不是推倒状态模型重来。
- 本轮真实验证结果为：后端 `300 passed`，前端 `tsc --noEmit` 通过。当前项目具备继续开发的基本稳定性，但这不等于 loop、sandbox backend、组织治理等目标设计已经全部落地。

### 4. 当前需要继续解耦，但还没有到必须停下大改结构的程度

- 后端最值得优先盯防的是 `api/app/services/workspace_starter_templates.py`（约 575 行）、`api/app/services/runtime_node_dispatch_support.py`（约 573 行）、`api/app/services/agent_runtime.py`（约 523 行）、`api/app/services/run_trace_views.py`（约 405 行）。
- 前端最值得优先盯防的是 `web/lib/get-workflow-publish.ts`（约 457 行）、`web/lib/workflow-tool-execution-validation.ts`（约 399 行）、`web/components/workflow-editor-variable-form.tsx`（约 378 行）。
- `web/components/workflow-editor-workbench.tsx` 当前约 219 行，仍基本保持 shell 角色；它不是当前最危险的热点，真正的风险在其依赖的数据聚合与表单校验模块继续吸职责。

### 5. 主业务可以继续向三层闭环推进，但还没到人工逐项界面设计验收阶段

- 用户层：workflow editor、publish governance、run diagnostics、sensitive access inbox 已经具备工作台雏形，能继续做字段级配置完整度与 operator 体验闭环。
- AI 与人协作层：`llm_agent` phase runtime、tool trace、run evidence 和 published waiting drilldown 已经是可持续演进的事实基础，但 product-level skill catalog 与更完整的 approval/callback narrative 还未闭环。
- AI 治理层：统一敏感访问控制是最接近产品设计目标的一条主线，但组织级 role/workspace/governance 还主要停留在目标设计。
- 因此本轮判断仍是：当前项目尚未达到“只需要人工逐项做界面设计”的阶段，不触发通知脚本。

## 优先级建议

1. **P0：把高风险 tool/plugin 的隔离能力补成 capability-driven fail-closed**
   - 先不要再让“execution contract 已有、实际仍回落轻执行”的状态长期存在。
2. **P0：继续补 `WAITING_CALLBACK` 自动唤醒与 operator 续跑闭环**
   - 这是最直接影响流程完整度与真实可交付性的运行时短板。
3. **P0：继续扩统一敏感访问控制闭环**
   - 把 policy explanation、diagnostics、approval timeline、publish/run detail 串成同一条 operator 主线。
4. **P1：持续治理 service / hook / data aggregation 热点**
   - 优先盯 `runtime_node_dispatch_support.py`、`agent_runtime.py`、`run_trace_views.py`、`get-workflow-publish.ts`、`workflow-editor-variable-form.tsx`。
5. **P1：继续提高 editor / publish / skill catalog 的产品完整度**
   - 保持“人可配置、AI 可追溯、保存/运行链路诚实阻断”的方向，不要回退到粗放 JSON 配置或假完成状态。

## 验证结果

- 后端：`cd api; .\.venv\Scripts\uv.exe run pytest -q` -> `300 passed`
- 前端：`cd web; pnpm exec tsc --noEmit` -> 通过（零输出）

## 影响

- `docs/dev/runtime-foundation.md` 已同步补充“高风险 tool/plugin 仍未全面 fail-closed”的当前事实，作为 P0 优先级输入。
- 本轮仍以“继续主链开发 + 热点解耦”为策略，不建议回头重搭基础框架。
