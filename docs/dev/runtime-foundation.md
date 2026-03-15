# Runtime Foundation

## 文档定位

- 本文只保留当前仍成立、且对后续开发有直接指导作用的运行时事实、结构热点和优先级。
- 产品切口、开源/商业边界与版本分层的长期基线已独立收敛到 `docs/open-source-commercial-strategy.md`；本文不再承担这部分长线策略文案。
- `docs/.taichuy/` 只用于本地开发设计讨论素材和草稿，默认 git ignore，不作为仓库事实来源；除非用户明确要求，否则不应把其中内容当作当前基线。
- 带日期的阶段性开发记录统一放在 `docs/history/`；已废弃文档统一放在 `docs/expired/`，避免与当前索引混放影响检索。
- 2026-03-14 之前的旧版长文已归档到 `docs/expired/2026-03-14-runtime-foundation-history-expired.md`，压缩过程说明放在 `docs/history/2026-03-14-runtime-foundation-compression.md`。
- 根目录 `README.md` 已在 2026-03-14 按当前代码事实、产品边界与开发路径重新整理，作为新的仓库入口说明。
- 若目标设计与当前实现冲突，优先以 `docs/dev/` 和代码事实为准，再决定修实现还是补文档。

## 当前判断

- 项目已经具备“可编排、可调试、可发布、可追溯”的后端基础骨架，不再是只有底座的空框架。
- 当前仍未进入“只剩界面润色或人工全链路验收”的阶段，后续开发应继续围绕主业务闭环推进，因此本轮不触发人工界面验收通知脚本。
- 基于 `c14c0d3 feat: add workflow editor publish draft form` 的前一轮基础，workflow editor 内的 `definition.publish` 现已补齐“`workflowVersion` 留空即跟随当前保存版本”的默认语义，并接入与后端 schema 对齐的本地校验和组件拆分；publish draft 已不再默认钉死旧版本，前端也能在重复 draft 待修正时保持稳定渲染。
- 面向 AI / 自动化 的追溯仍必须以 `runs / node_runs / run_events / run_artifacts / tool_call_records / ai_call_records` 为事实源，前端面板只负责摘要、导航和排障入口。
- 当前产品基线已进一步明确：7Flows 同时服务人类用户与 AI 用户，后续工作台、发布接口与运行态接口演进时，应保持人机交互、人与 AI 协作、AI 独立操作三类场景的结果语义一致。
- 2026-03-15 文档基线已显式区分“对外 OpenClaw-first 切口”和“对内 IR / runtime 内核”：开源给协作、商业给治理现已作为目标设计写入稳定策略文档，但当前仓库仍主要落在 OSS kernel 和运行时基础建设阶段，不应把 Team / Enterprise 能力误写成已落地事实。
- 2026-03-15 仓库授权已切换为 Apache 2.0 基底 + 附加条件的 `7Flows Community License`：社区协作、自部署和单租户二次开发仍是默认入口，但多租户托管、商业化对立面与前端去标识 / 白标不再属于“默认免费边界”，相关判断必须以根目录 `LICENSE` 为准。
- 2026-03-15 AI 协作体系已从“领域 skill 为主”补成“元流程 skill + 领域 skill”双层结构：新增 `development-closure`、`skill-governance`、`backend-testing`，用于收尾闭环、skill 漂移治理与后端测试补齐；后续 AI 开发不应只读单个 review / refactor skill 就跳过验证、文档同步和 Git 收尾。
- `sensitivity_level` 驱动的统一敏感访问控制、人工审核与通知闭环已确定为架构初期事项；当前代码已有 ToolGateway、waiting/resume 与 callback ticket 原语，但尚未落成独立事实层、策略挂点与 API。
- 2026-03-15 复核结果：后端 `api/.venv/Scripts/uv.exe run pytest -q` 通过（222 passed）；前端 `web/pnpm lint` 与 `web/pnpm exec tsc --noEmit` 通过。后端全量 `ruff check` 复核后仍有历史风格/整理债务尚未在本轮整体清零，因此稳定性基线已继续提升，但还未达到“全仓库零告警”。

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
- Runtime 主链已连续完成 run support、graph support、progress support、node preparation、node dispatch 等分层治理，`runtime.py` 已显著收口到执行入口与 `_continue_execution` orchestration 主链。
- Runtime execution 现已经由 `llm_agent -> AgentRuntime`、`tool -> ToolGateway`、`node -> RuntimeExecutionAdapterRegistry` 三条主链推进：`runtimePolicy.execution` 已能进入 workflow schema、node input 和 execution view，`sandbox_code` 也已接入 host-subprocess MVP 执行链；本轮继续把 ToolGateway execution-aware dispatch、tool/plugin 默认 execution class 映射、`llm_agent.toolPolicy.execution` 与 tool node execution trace 接进主链，并把 `tool.execution.dispatched / tool.execution.fallback` 与 tool result artifact metadata 对齐；但真实 `sandbox` / `microvm` tool adapter 与敏感访问拦截仍待继续落地。
- `loop` 节点仍未在 MVP 执行器中开放执行；循环能力仍需通过后续 runtime 演进补齐，不能假装已完成。
- `run_events` 仍是调试、回放、SSE 和 AI 追溯的统一事件源，不应为不同界面另起事实层。

### 3. Agent Runtime 与上下文分层

- `AgentRuntime` 已把 `llm_agent` 演进为可恢复的 phase pipeline，主 phases 为 `prepare -> main_plan -> tool_execute -> assistant_distill -> main_finalize -> emit_output`。
- `assistant` 仍是节点内可关闭的 evidence pipeline，只负责证据提炼，不负责流程推进。
- `ContextService` 已把上下文拆成 global / working / evidence / artifact refs；`RuntimeArtifactStore` 承接大体量原始结果；`ToolGateway` 统一工具调用、摘要与 artifact 持久化。
- OpenAI 流式调用已开启 `stream_options.include_usage`，`agent_runtime_llm_support.py` 会累计 usage，后续成本分析已有稳定事实可承接。

### 4. Workflow 定义、发布与开放接口

- 工作流创建/更新已执行最小结构校验，并自动生成 immutable version snapshot 与 compiled blueprint。
- `runtimePolicy.execution / retry / join`、节点 `inputSchema / outputSchema`、`llm_agent.config.toolPolicy` 与 workflow `publish` draft 已进入结构化 schema / editor 表达，workflow editor 正在沿统一配置面持续推进，而不是停留在一次性 demo。
- 发布治理已落到独立事实层：binding lifecycle、API keys、cache entries、invocation activity、invocation detail 都有对应 route/service/migration。
- 发布网关已从单体中拆出 binding resolver、cache orchestrator、invocation recorder、response builder、protocol surface 与 binding invoker；native / OpenAI / Anthropic route surface 也已拆到独立 route 文件，发布层边界比前几轮更清晰。
- 已开放 native / OpenAI / Anthropic 的 published surface，含 sync、async、alias/path 入口，以及基于 runtime delta / 最终结果映射的最小 SSE。

### 5. 面向工作台与诊断的接口

- Run API 已覆盖创建、详情、events、trace、trace export、resume、callback ingress、execution view、evidence view。
- Workflow library、system overview、plugin adapters、runtime activity、credentials API 已具备，为编辑器、诊断面板和发布治理继续承接提供稳定后端入口。
- workflow editor inspector 已能以结构化 section 暴露 `runtimePolicy.execution / retry / join`、节点 contract、workflow `publish` draft 与部分 `llm_agent` 高级配置；execution section 已先解析默认执行类，再按“偏离默认时才持久化 JSON”的策略落库。
- run diagnostics 已能消费 execution / evidence 聚合视图，并显示 execution boundary summary，但 execution detail、artifact preview、evidence drilldown 仍有继续拆层空间。
- 当前还没有 approval-specific route / notification delivery API；后续若补统一敏感访问控制，应优先复用现有 run detail、resume 与 callback 事实层扩展，而不是另起一套状态体系。

## 当前结构热点

- `api/app/schemas/workflow.py`：725 行，已同时承载 IR schema、runtime policy、publish schema 与大量跨节点校验；下一阶段应按 node contract / publish / validators 继续拆层，避免继续成为事实与规则的大总表。
- `api/app/services/workflow_library.py`：688 行，library source lane、workspace starter、catalog aggregation 仍聚在单服务中；若继续补来源治理或筛选逻辑，适合按 catalog / source / starter orchestration 分层。
- `api/app/services/plugin_runtime.py`：660 行，同时承载 registry、call proxy、compat health checker 与 catalog client；这对插件扩展有利于起步，但已成为 compat/runtime 侧新的长文件热点。
- `api/app/services/agent_runtime_llm_support.py`：631 行，当前仍集中承接流式调用、usage 累计和 phase 内 LLM 细节；后续若继续补 provider 特性，适合按 stream / completion / usage helper 拆层。
- `api/app/api/routes/runs.py`：628 行，run CRUD、trace 查询、cursor/导出辅助逻辑仍集中在单文件；后续可继续按 run detail / trace / export helper 拆层。
- `api/app/services/runtime.py`：387 行，主文件继续维持“执行入口 + `_continue_execution` orchestration 主链”定位，没有把节点准备、节点分发或节点收尾重新回流进来；当前长度可接受，但必须继续防止回流。
- `api/app/services/runtime_execution_adapters.py`：新增 execution adapter registry、inline fallback 与 `sandbox_code` adapter，是后续继续扩真实执行边界而不是回堆到 `runtime.py` 的关键落点。
- `api/app/services/runtime_sandbox_code.py`：新增 host-subprocess MVP 执行器，当前只支持 Python，负责把 `sandbox_code` 节点先收敛到独立子进程与 artifact/event trace；后续真实 sandbox / microvm 适合继续从这里外扩。
- `api/app/services/runtime_run_support.py`：403 行，run load / resume / callback 已独立成层，后续应保持 helper 化演进，避免 callback orchestration 再次回流主文件或重新膨胀成新热点。
- `api/app/services/published_protocol_streaming.py`：518 行，仍集中承接 native / OpenAI / Anthropic 三类 SSE 映射，是发布层下一阶段更值得继续拆层的后端热点。
- `api/app/services/published_gateway.py`：354 行，service 主体已明显比前期收敛，但 surface orchestration 仍集中在同一服务里，后续可继续按 surface/helper 分层。
- `web/components/run-diagnostics-execution-sections.tsx`：530 行，execution / evidence 详情层仍偏重，后续适合继续按 payload、metrics、artifact、evidence drilldown 拆层。
- `web/components/workspace-starter-library.tsx`：440 行，已经比早期收口，但 library 交互、元数据和治理入口仍较集中；后续若再补 diff / governance，应继续拆 section 与 hook。
- `web/components/workflow-editor-workbench/use-workflow-editor-graph.ts`：已开始同时维护 nodes / edges / workflow publish draft，graph mutation 仍集中但边界清晰；如果后续继续补 variables、schema builder 或更多 workflow-level governance，适合把 publish / variable mutation 再拆成 helper hook。
- `web/components/workflow-editor-publish-form.tsx` 已在 2026-03-15 拆出 publish endpoint card、shared helper 与本地校验层；当前不再是单文件阻塞项，但后续若补 protocol-specific advanced options，可继续沿 section/helper 分层扩展。
- `web/components/workflow-node-config-form/runtime-policy-form.tsx`：333 行，execution section 已拆到 `runtime-policy-execution-section.tsx` 与 `runtime-policy-helpers.ts`，父表单仍应保持 orchestrator 角色，避免 runtime 配置继续回涨为单体。
- `web/components/credential-store-panel.tsx`：本轮已修复前端全量 lint 阻塞点；当前不再是稳定性阻塞项，但后续仍可顺手收口内联样式与局部状态逻辑。
- 当前项目整体判断不变：基础框架足够继续推主业务完整度，但还没到“只剩人工界面设计 / 全链路人工验收”的阶段。

## 本轮压缩说明

- 旧版 `runtime-foundation` 经多轮直接追加，已从“当前事实索引”膨胀为“历史流水账”，不再适合作为后续开发第一参考。
- 2026-03-14 起，详细历史已归档到 `docs/expired/2026-03-14-runtime-foundation-history-expired.md`，压缩过程说明归档到 `docs/history/2026-03-14-runtime-foundation-compression.md`；主文档只保留当前仍成立的代码事实、结构热点和当前优先级。
- 后续若再超过可维护体量，应继续按“当前代码事实优先、历史另行归档、下一步规划保留”的原则压缩。

## 下一步规划

1. **P0：继续把 graded execution 从 execution-aware 扩成真实隔离能力**
   - `RuntimeExecutionAdapterRegistry`、`sandbox_code` host-subprocess MVP，以及 ToolGateway / `llm_agent.toolPolicy.execution` / tool node 的 execution-aware dispatch 已落地；下一步优先补真实 `sandbox` / `microvm` tool adapter、compat plugin execution boundary 对接与 execution trace 摘要聚合，避免 execution policy 长期停留在“有 trace 但少数能力仍 fallback”。
2. **P0：定义并落地统一敏感访问控制闭环**
   - 围绕 `sensitivity_level / requester_type / action_type` 补齐 `SensitiveAccessRequest`、`ApprovalTicket`、通知投递与审计事件事实层，并优先把拦截点挂到 ToolGateway、credential resolve、context read 和 publish export 入口。
3. **P0：补齐 `WAITING_CALLBACK` 的后台唤醒闭环**
   - 继续把 callback ticket、scheduler 和 resume orchestration 衔接成更完整的 durable execution 主链，为后续审批、通知恢复和 timeout/fallback 复用同一条 waiting/resume 能力。
4. **P1：继续治理插件兼容与工作流定义热点**
   - 优先拆 `plugin_runtime.py`、`workflow_library.py` 与 `workflow.py` 的集中职责，避免插件扩展、catalog 治理和 schema 演进继续堆回超长文件。
5. **P1：继续治理 run diagnostics 与 publish streaming 详情层**
   - 下一阶段可优先拆 `web/components/run-diagnostics-execution-sections.tsx` 与 `api/app/services/published_protocol_streaming.py`，并为 approval timeline、security decision summary、protocol-specific SSE helper 预留落点。
6. **P1：继续提高工作流编辑器完整度**
   - 在现有 `runtimePolicy.execution / retry / join`、节点 contract、workflow `publish` draft 与 `llm_agent.toolPolicy` 基础上，继续补敏感访问策略入口、variables/schema builder，以及更清晰的 advanced JSON / structured form 边界。
7. **P2：先把 `organization / workspace / member / role / publish governance` 写成最小领域模型设计稿**
   - 在不提前引入重 IAM 或复杂多组织计费系统的前提下，先收敛 Team / Enterprise 最小治理模型与 API 预留，明确哪些属于 Community kernel、哪些属于商业治理能力，避免后续实现、README 和对外叙事再次混线。
8. **P2：继续收敛 Community License 的执行边界**
   - 围绕 `workspace = tenant`、多租户托管、商业化对立面、前端品牌替换和白标分发等触发条件，继续补文档、术语定义和未来商业授权入口，避免许可证文本有了但执行口径仍模糊。
9. **P3：继续完善 AI 协作 skill 的双层体系**
   - 根据后续实现节奏，继续补强 backend refactor、runtime debugging、发布治理验证等高复用流程，并定期复核 skill 与 `AGENTS.md`、`runtime-foundation.md`、README 索引的一致性，避免 skill 再次漂移。
10. **P3：把 OpenClaw-first README / demo / 首页入口收成可传播资产**
   - 在策略与授权边界稳定后，继续补 README 截图、demo 路径、首页文案和示例 workflow，让“黑盒变透明”的外部入口真正可演示、可传播、可复用。
