# Runtime Foundation

## 文档定位

- 本文只保留当前仍成立、且对后续开发有直接指导作用的运行时事实、结构热点和优先级。
- 带日期的阶段性开发记录统一放在 `docs/history/`；已废弃文档统一放在 `docs/expired/`，避免与当前索引混放影响检索。
- 2026-03-14 之前的旧版长文已归档到 `docs/expired/2026-03-14-runtime-foundation-history-expired.md`，压缩过程说明放在 `docs/history/2026-03-14-runtime-foundation-compression.md`。
- 根目录 `README.md` 已在 2026-03-14 按当前代码事实、产品边界与开发路径重新整理，作为新的仓库入口说明。
- 若目标设计与当前实现冲突，优先以 `docs/dev/` 和代码事实为准，再决定修实现还是补文档。

## 当前判断

- 项目已经具备“可编排、可调试、可发布、可追溯”的后端基础骨架，不再是只有底座的空框架。
- 当前仍未进入“只剩界面润色或人工全链路验收”的阶段，后续开发应继续围绕主业务闭环推进。
- 面向 AI / 自动化 的追溯仍必须以 `runs / node_runs / run_events / run_artifacts / tool_call_records / ai_call_records` 为事实源，前端面板只负责摘要、导航和排障入口。
- 当前开发收尾标准已进一步收紧：默认以充分测试、失败即修复、交付前零 warning / 零 error 作为稳定基线，避免把不稳定状态带入下一轮开发。
- 当前产品基线已进一步明确：7Flows 同时服务人类用户与 AI 用户，后续工作台、发布接口与运行态接口演进时，应保持人机交互、人与 AI 协作、AI 独立操作三类场景的结果语义一致。
- `sensitivity_level` 驱动的统一敏感访问控制、人工审核与通知闭环已确定为架构初期事项；当前代码已有 ToolGateway、waiting/resume 与 callback ticket 原语，但尚未落成独立事实层与 API。
- 节点执行架构已明确采用“统一工作流执行器 + 分级执行类”的方向，不做所有节点默认重沙箱化；当前代码仍以 worker 内联执行为主，`sandbox_code` 和 execution adapter registry 尚未正式落地。

## 当前代码事实

### 1. 持久化与迁移

- Alembic 已替代 `create_all`；迁移已覆盖运行时、workflow version、compiled blueprint、published endpoint、API key、cache、credential 等核心事实层，当前版本到 `20260314_0020_published_invocation_cache_links.py`。
- `api/docker/entrypoint.sh` 支持 `SEVENFLOWS_MIGRATION_ENABLED=true` 时启动前自动迁移；默认只让 `api` 服务自动迁移，避免 `worker` 并发升级数据库。
- `credentials` 已入库，后续 provider / tool 凭据管理不再需要继续停留在纯占位状态。

### 2. Runtime 执行骨架

- `RuntimeService` 已采用 compiled blueprint 执行链，run 会显式绑定 `workflow_version` 与 `compiled_blueprint_id`。
- `RuntimeService` 当前仍是唯一 orchestration 主控；`AgentRuntime`、`ToolGateway`、callback ticket 和未来 sandbox adapter 都应继续作为被调度层，而不是拥有第二套流程控制语义。
- 当前执行器已支持拓扑排序、条件/路由分支、join、mapping、节点重试、waiting/resume、callback ticket、artifact 引用和统一事件落库。
- 现有 `waiting/resume + callback ticket` 原语已经足够承接未来审批闭环，但当前仍缺统一的 `SensitiveAccessRequest / ApprovalTicket / NotificationDispatch` 模型与拦截挂点。
- 2026-03-14 已连续推进四轮 runtime 结构治理：先把 run load / resume / callback orchestration 从 `runtime.py` 拆到 `runtime_run_support.py`，再把 graph support 拆成 `runtime_branch_support.py`、`runtime_mapping_support.py` 与收口后的 `runtime_graph_support.py`，随后把节点失败 / waiting / 成功收尾与 run 完成输出从 `runtime.py` 收口到 `runtime_execution_progress_support.py`，本轮继续把节点准备与输入拼装拆到 `runtime_node_preparation_support.py`、把节点类型分发 / tool dispatch / credential resolve 拆到 `runtime_node_dispatch_support.py`，`RuntimeService` 主文件和节点执行 support 的职责边界都进一步收紧。
- 当前节点运行路径仍以 `llm_agent -> AgentRuntime`、`tool -> ToolGateway` 与其余节点 worker 内联执行为主；`execution class`、`sandbox_code` 正式执行链和统一 execution adapter registry 还没有落地，不能在文档或 UI 中假装已完成。
- `loop` 节点仍未在 MVP 执行器中开放执行；循环能力仍需通过后续 runtime 演进补齐，不能假装已完成。
- `run_events` 仍是调试、回放、SSE 和 AI 追溯的统一事件源，不应为不同界面另起事实层。

### 3. Agent Runtime 与上下文分层

- `AgentRuntime` 已把 `llm_agent` 演进为可恢复的 phase pipeline，主 phases 为 `prepare -> main_plan -> tool_execute -> assistant_distill -> main_finalize -> emit_output`。
- `assistant` 仍是节点内可关闭的 evidence pipeline，只负责证据提炼，不负责流程推进。
- `ContextService` 已把上下文拆成 global / working / evidence / artifact refs；`RuntimeArtifactStore` 承接大体量原始结果；`ToolGateway` 统一工具调用、摘要与 artifact 持久化。
- OpenAI 流式调用已开启 `stream_options.include_usage`，`agent_runtime_llm_support.py` 会累计 usage，后续成本分析已有稳定事实可承接。

### 4. Workflow 定义、发布与开放接口

- 工作流创建/更新已执行最小结构校验，并自动生成 immutable version snapshot 与 compiled blueprint。
- 发布治理已落到独立事实层：binding lifecycle、API keys、cache entries、invocation activity、invocation detail 都有对应 route/service/migration。
- 发布网关已从单体中拆出 `binding resolver`、`cache orchestrator`、`invocation recorder`、`response builder`、`protocol surface` 与 `binding invoker`；publish invocation audit 也已进一步拆成 mixin orchestration、facet/summary aggregation、timeline helpers 三层，发布治理的结构边界比前几轮更清晰。
- 2026-03-14 晚间继续把 published route surface 从单文件拆成 `published_gateway_native_routes.py`、`published_gateway_openai_routes.py`、`published_gateway_anthropic_routes.py` 与共享 `published_gateway_shared.py`；`api/app/api/routes/published_gateway.py` 已收口为聚合入口。
- 已开放 native / OpenAI / Anthropic 的 published surface，含 sync、async、alias/path 入口，以及基于 runtime delta / 最终结果映射的最小 SSE。

### 5. 面向工作台与诊断的接口

- Run API 已覆盖创建、详情、events、trace、trace export、resume、callback ingress、execution view、evidence view。
- 当前还没有 approval-specific route / notification delivery API；后续若补统一敏感访问控制，应优先复用现有 run detail、resume 与 callback 事实层扩展，而不是另起一套状态体系。
- Workflow library、system overview、plugin adapters、runtime activity、credentials API 已具备，为编辑器、诊断面板和发布治理继续承接提供稳定后端入口。
- `workflow editor` inspector 已把 `runtimePolicy` 的 retry / join 从纯 JSON 文本补成结构化表单；join 候选来源会按当前画布实际入边收敛，复杂场景仍可回退到高级 JSON。
- 2026-03-14 晚间继续把节点 `inputSchema / outputSchema` 从通用 `config` JSON 里拆成独立 contract section，并把 `llm_agent.config.toolPolicy` 显式化到结构化表单；workflow editor 正在沿同一条配置收口链持续推进，而不是停留在一次性 demo。
- 当前前端里的 `sandboxEnabled` 更接近占位开关；后续应优先收口到统一的 `runtimePolicy.execution.class / profile`，避免继续把执行边界散落成多个局部布尔开关。
- 前端与后端的诊断/治理界面应继续消费这些事实接口，而不是直接拼装数据库内部结构。

## 当前结构热点

- `api/app/services/runtime.py`：387 行，主文件继续维持“执行入口 + `_continue_execution` orchestration 主链”定位，没有把节点准备、节点分发或节点收尾重新回流进来。
- `api/app/services/runtime_node_preparation_support.py`：264 行，承接 join 判定后的 node run 准备、node input 拼装与 skipped / blocked node run 构造。
- `api/app/services/runtime_node_dispatch_support.py`：249 行，承接节点类型分发、tool dispatch、凭据解析与 branch / router 选择逻辑。
- `api/app/services/runtime_node_execution_support.py`：183 行，已收口为重试循环、失败输出、最终输出解析和下游激活 support，不再是主要结构热点。
- `api/app/services/runtime_run_support.py`：403 行，run load / resume / callback 已独立成层，后续应保持 helper 化演进，避免 callback orchestration 再次回流主文件或重新膨胀成新热点。
- `api/app/services/runtime_graph_support.py`：292 行，已从总装热点收口为 graph orchestration 组合层；`runtime_branch_support.py`（262 行）与 `runtime_mapping_support.py`（176 行）分别承接 branch/selector 与 mapping/merge 逻辑，边界比上一轮更清晰。
- `web/components/run-diagnostics-panel.tsx`：152 行，本轮已收口为 orchestrator；原先的 summary / filter / trace result 已拆到 `web/components/run-diagnostics-panel/` 目录下，不再是主要结构热点。
- `web/components/run-diagnostics-panel/trace-results-section.tsx`：183 行，当前承接 trace summary、cursor 翻页与 event list，是 run diagnostics 下一阶段更适合继续细拆的稳定区块。
- `web/components/run-diagnostics-execution-sections.tsx`：477 行，execution / evidence 详情层仍偏重，后续适合继续按 payload、metrics、artifact、evidence drilldown 拆层。
- `api/app/api/routes/published_gateway.py`：10 行，当前仅保留 `/v1` 聚合入口；native / OpenAI / Anthropic surface 已分别拆到独立 route 文件，route 层最显著的单文件热点已解除。
- `api/app/services/published_protocol_streaming.py`：459 行，仍集中承接 native / OpenAI / Anthropic 三类 SSE 映射，是发布层下一阶段更值得继续拆层的后端热点。
- `api/app/services/published_gateway.py`：338 行，虽然 service 主体已明显比前期收敛，但 native / OpenAI / Anthropic surface orchestration 仍集中在同一服务里，后续可继续按 surface/helper 分层。
- `web/components/workflow-editor-workbench.tsx`：221 行，已收口为 orchestrator；graph state / node-edge mutation 已拆到 `use-workflow-editor-graph.ts`（360 行），run overlay 已拆到 `use-workflow-run-overlay.ts`（81 行），工作台主文件不再同时承担画布状态、运行拉取和保存编排三类职责。
- `web/components/workflow-node-config-form/runtime-policy-form.tsx`：311 行，当前承接 retry / join 的结构化配置与入边来源约束，已和新的 `node-io-schema-form.tsx`、`llm-agent-tool-policy-form.tsx` 一起形成 workflow editor inspector 的稳定 section 组合层。
- `web/components/workflow-node-config-form/llm-agent-node-config-form.tsx`：293 行，tool policy 已拆到 `llm-agent-tool-policy-form.tsx`（103 行），主表单职责比之前更清晰；后续若继续增长，可再按 assistant / contextAccess 分层。
- `web/components/workflow-editor-workbench/use-workflow-editor-graph.ts`：360 行，graph mutation 仍集中但边界清晰；如果后续继续补 publish section、variables 或 schema builder，适合把节点 contract / publish mutation 再拆成 helper hook。
- `api/app/services/published_invocation_audit.py` 已收口到 197 行，但 publish governance 仍由 `published_invocation_audit_aggregation.py`（340 行）和 `published_invocation_audit_timeline.py`（206 行）承接；后续应继续防止查询、facet、timeline 再次回流单文件。
- 当前项目整体判断不变：基础框架足够继续推主业务完整度，但还没到“只剩人工界面设计 / 全链路人工验收”的阶段。

## 本轮压缩说明

- 旧版 `runtime-foundation` 经多轮直接追加，已从“当前事实索引”膨胀为“历史流水账”，不再适合作为后续开发第一参考。
- 2026-03-14 起，详细历史已归档到 `docs/expired/2026-03-14-runtime-foundation-history-expired.md`，压缩过程说明归档到 `docs/history/2026-03-14-runtime-foundation-compression.md`；主文档只保留当前仍成立的代码事实、结构热点和当前优先级。
- 后续若再超过可维护体量，应继续按“当前代码事实优先、历史另行归档、下一步规划保留”的原则压缩。

## 下一步规划

1. **P0：定义并落地分级执行架构**
   - 先把 `NodeType` 与 `execution class` 分离建模，补齐 `runtimePolicy.execution`、Execution Adapter Registry、tool/plugin 默认执行级别与运行追踪字段；保持 `RuntimeService` 作为唯一主控，不做所有节点默认重沙箱化。
2. **P0：定义并落地统一敏感访问控制闭环**
   - 围绕 `sensitivity_level / requester_type / action_type` 补齐 `SensitiveAccessRequest`、`ApprovalTicket`、通知投递与审计事件事实层，并优先把拦截点挂到 ToolGateway、credential resolve、context read 和 publish export 入口。
3. **P0：继续补节点配置与 workflow editor 完整度**
   - `runtimePolicy`、节点 `input/output schema`、`llm_agent.toolPolicy` 已补成独立 section；下一步优先把 `runtimePolicy.execution.class / profile` 收成稳定表单，再继续整理 workflow `publish` config 和敏感访问策略配置落点。
4. **P1：补齐 `WAITING_CALLBACK` 的后台唤醒闭环**
   - 继续把 callback ticket、scheduler 和 resume orchestration 衔接成更完整的 durable execution 主链，为后续审批与通知恢复共用同一条 waiting/resume 能力。
5. **P1：继续治理 run diagnostics 详情层**
   - 下一阶段可优先拆 `web/components/run-diagnostics-execution-sections.tsx` 与 `trace-results-section.tsx`，并为 approval timeline、security decision summary 预留详情视图落点。
6. **P1：继续治理 published service / streaming 热点**
   - route 层已拆开，下一阶段可进一步收紧 `published_gateway.py` 与 `published_protocol_streaming.py` 的 surface orchestration 和 SSE 映射职责，同时考虑敏感导出控制的统一挂点。
