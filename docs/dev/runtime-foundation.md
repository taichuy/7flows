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
- `sensitivity_level` 驱动的统一敏感访问控制、人工审核与通知闭环已确定为架构初期事项；在 `SensitiveResourceRecord / SensitiveAccessRequestRecord / ApprovalTicketRecord / NotificationDispatchRecord` 事实层与 `/api/sensitive-access/*` API 基础上，当前已经把同一套控制接到 runtime `credential resolve`、`mcp_query / authorized_context` 的 context read、`ToolGateway` 的 tool invoke、Run API 的 `trace export`，以及 published endpoint invocation detail / published cache inventory 的人工详情入口：当 node/agent 解析 `credential://...`、读取命中 `workflow_context` 资源的上游 artifact、调用命中 `local_capability` 资源的工具，尝试导出一个已经触达敏感资源的 run trace，或查看关联高敏 run 的 published invocation 详情 / cache inventory 时，运行态都会创建/复用访问请求，并在命中审批时复用同一套 `ApprovalTicket` / `NotificationDispatch` 事实层。对 `L2` context read，当前会返回结构化 masked payload；对 credential path 的 `allow_masked`，当前也已改为先返回 `credential+masked://...` handle，再由 `AgentRuntime` / `ToolGateway` 在最后一跳恢复真实密钥，不再在通用 runtime resolve 层默认直出明文。当前仍缺 publish export 的真实拦截挂点，以及更完整的通知 worker / inbox 落地。
- 2026-03-15 run diagnostics 与 workflow overlay 的 trace export 按钮已补成真正的 fetch/download 交互，而不是只依赖浏览器新开链接；当导出命中 `RunTraceExportAccessService` 的审批或拒绝分支时，前端现在会直接展示统一的 `SensitiveAccessBlockedCard`，避免人类排障入口对后端安全治理“有拦截、无落点”。
- 2026-03-15 `RunResumeScheduler` 已补成 transaction-aware after-commit dispatch：runtime `waiting resume`、敏感访问审批通过后的 resume，以及 callback ticket cleanup 的 resume 调度现在都会先跟随同一事务提交，再在 `after_commit` 后派发，避免 worker / Celery 先读到未提交的 waiting-state 变更。手动 `/api/runs/callback-tickets/cleanup` 也已默认接上这条 cleanup -> immediate resume 闭环，并保留 `schedule_resumes=false` 的显式退出口。
- 2026-03-15 最新复核结果：后端基础框架仍足够继续推进主业务闭环，且本轮已把 credential `allow_masked` 从“事实等同 allow”收成最小可用的 masked-handle 语义；changed-files `ruff check`、`git diff --check`、`api/.venv/Scripts/uv.exe run pytest -q .\tests\test_credential_store.py .\tests\test_runtime_credential_integration.py`（`43 passed`）与 `api/.venv/Scripts/uv.exe run pytest -q`（`246 passed`）均已通过。当前稳定性基线继续提升，但项目仍未进入“只剩人工逐项界面设计 / 人工验收”的阶段。
- 2026-03-15 最新前端补强结果：workflow editor 现已把 `definition.variables` 接入 `use-workflow-editor-graph` 的 workflow-level state，并在 inspector 中新增结构化 variables 表单，允许直接维护全局变量的 `name / type / default / description`，不再只能在 definition JSON 里被动保留。`web/pnpm lint` 与 `web/pnpm exec tsc --noEmit` 已通过；当前编辑器完整度继续提升，但敏感访问策略入口和更完整的 schema builder 仍待补齐。
- 2026-03-15 最新 publish 治理补强结果：前端已不再把 published invocation detail / cache inventory 命中的 `403/409 sensitive access blocked` 响应误当成“空数据”；`web/lib/sensitive-access.ts` 统一承接受控响应解析，publish 面板会直接展示 resource / access request / approval ticket / notification 摘要，避免上轮后端已经完成敏感访问主链、前端却仍然把阻塞态渲染成“暂无条目”。`web/pnpm lint` 与 `web/pnpm exec tsc --noEmit` 已通过；published 侧 access-blocked UI 已有最小落点，但 approval inbox、通知投递闭环和 publish export 入口仍待继续补齐。
- 2026-03-15 最新结构治理结果：`api/app/api/routes/runs.py` 已从约 664 行降到约 211 行，run trace 的 cursor/filter/summary/export 序列化已下沉到新建的 `api/app/services/run_trace_views.py`（约 389 行）；`ruff check app/api/routes/runs.py app/services/run_trace_views.py`、`pytest -q tests/test_run_routes.py`（`20 passed`）与 `pytest -q`（`243 passed`）已通过。当前 run route 已更接近纯 HTTP contract，后续继续补 trace export 治理或 run diagnostics presenter 时不必再从单体 route 起手。
- 2026-03-15 最新发布层结构治理结果：最近一次提交 `af4fd9a refactor: split run trace route helpers` 不需要紧急补救式衔接，但其“继续消化热点、而非回头补框架”的方向仍应延续。本轮已把 `api/app/services/published_protocol_streaming.py` 从约 518 行拆成 facade + `published_protocol_streaming_common.py` / `published_protocol_streaming_native.py` / `published_protocol_streaming_openai.py` / `published_protocol_streaming_anthropic.py`，changed-files `ruff check`、`pytest -q tests/test_published_protocol_streaming.py`（`6 passed`）与 `pytest -q`（`243 passed`）已通过。当前 published streaming 已不再是单文件阻塞点，但 publish export 敏感治理、protocol-specific SSE policy 与前端 diagnostics 重层仍待继续推进。
- 2026-03-15 最新 P0 补强结果：最近一次提交 `39de386 feat: surface run trace export blocked states` 主要补的是 run diagnostics / overlay 的前端安全阻断落点，不需要紧急返工式衔接；本轮继续顺着 runtime 主链，把 `RunCallbackTicketCleanupService` 补成“过期 callback ticket -> 记录 `run.callback.ticket.expired` -> 写入 `scheduled_resume` checkpoint -> 追加 `run.resume.scheduled` 事件 -> 通过 `callback_ticket_monitor` 排队即时 resume”的后台闭环，`runtime.cleanup_callback_tickets` Celery 任务也已接上这条路径。`api/.venv/Scripts/uv.exe run ruff check app/services/run_callback_ticket_cleanup.py app/tasks/runtime.py tests/test_run_callback_ticket_routes.py` 与 `api/.venv/Scripts/uv.exe run pytest -q`（`247 passed`）已通过。当前 `WAITING_CALLBACK` 不再只停留在“清理过期 ticket 但 run 永远挂起”的半闭环，但 operator 手动 cleanup 与更细的 late-callback / repeated-waiting 语义仍待继续收口。

## 当前代码事实

### 1. 持久化与迁移

- Alembic 已替代 `create_all`；迁移已覆盖运行时、workflow version、compiled blueprint、published endpoint、API key、cache、credential 与敏感访问控制等核心事实层，当前版本到 `20260315_0021_sensitive_access_control.py`。
- `api/docker/entrypoint.sh` 支持 `SEVENFLOWS_MIGRATION_ENABLED=true` 时启动前自动迁移；默认只让 `api` 服务自动迁移，避免 `worker` 并发升级数据库。
- `credentials` 已入库，后续 provider / tool 凭据管理不再需要继续停留在纯占位状态。

### 2. Runtime 执行骨架

- `RuntimeService` 已采用 compiled blueprint 执行链，run 会显式绑定 `workflow_version` 与 `compiled_blueprint_id`。
- `RuntimeService` 当前仍是唯一 orchestration 主控；`AgentRuntime`、`ToolGateway`、callback ticket 和未来 sandbox adapter 都应继续作为被调度层，而不是拥有第二套流程控制语义。
- 当前执行器已支持拓扑排序、条件/路由分支、join、mapping、节点重试、waiting/resume、callback ticket、artifact 引用和统一事件落库。
- 现有 `waiting/resume + callback ticket` 原语已经足够承接审批闭环；统一的 `SensitiveAccessRequest / ApprovalTicket / NotificationDispatch` 模型与 API 已接到 credential resolve、context read、tool invoke、run trace export 与部分 published 详情治理。2026-03-15 本轮继续把 `WAITING_CALLBACK` 主链补成更 durable 的形态：过期 ticket cleanup 会把 repeated expiry 转成 checkpoint 内的 `callback_waiting_lifecycle` 摘要与 resume backoff（首轮 `0s`、重复过期后递增到 `5s / 15s / 30s / 60s`），late callback 也会落成统一 `run.callback.ticket.late` 事件与 node checkpoint 摘要，execution view 前端已能直接看到 wait cycle、expired count、late callback 与最近一次 backoff。当前剩余缺口主要转向 publish export、通知 worker / inbox，以及 callback 最大重试/终止策略的进一步收口。
- Runtime 主链已连续完成 run support、graph support、progress support、node preparation、node dispatch 等分层治理，`runtime.py` 已显著收口到执行入口与 `_continue_execution` orchestration 主链。
- Runtime execution 现已经由 `llm_agent -> AgentRuntime`、`tool -> ToolGateway`、`node -> RuntimeExecutionAdapterRegistry` 三条主链推进：`runtimePolicy.execution` 已能进入 workflow schema、node input 和 execution view，`sandbox_code` 也已接入 host-subprocess MVP 执行链；ToolGateway execution-aware dispatch、tool/plugin 默认 execution class 映射、`llm_agent.toolPolicy.execution` 与 tool node execution trace 也都已接进主链。当前新增的 credential masked-handle 语义继续沿这三条主链演进：runtime resolve 先给 handle，真正调用 LLM / tool 时再恢复明文。后续重点仍是补真实 `sandbox` / `microvm` tool adapter。
- `loop` 节点仍未在 MVP 执行器中开放执行；循环能力仍需通过后续 runtime 演进补齐，不能假装已完成。
- `run_events` 仍是调试、回放、SSE 和 AI 追溯的统一事件源，不应为不同界面另起事实层。

### 3. Agent Runtime 与上下文分层

- `AgentRuntime` 已把 `llm_agent` 演进为可恢复的 phase pipeline，主 phases 为 `prepare -> main_plan -> tool_execute -> assistant_distill -> main_finalize -> emit_output`。
- `assistant` 仍是节点内可关闭的 evidence pipeline，只负责证据提炼，不负责流程推进。
- `ContextService` 已把上下文拆成 global / working / evidence / artifact refs；`RuntimeArtifactStore` 承接大体量原始结果；`ToolGateway` 统一工具调用、摘要与 artifact 持久化。
- OpenAI 流式调用已开启 `stream_options.include_usage`，`agent_runtime_llm_support.py` 会累计 usage，后续成本分析已有稳定事实可承接。

### 4. Workflow 定义、发布与开放接口

- 工作流创建/更新已执行最小结构校验，并自动生成 immutable version snapshot 与 compiled blueprint。
- `runtimePolicy.execution / retry / join`、节点 `inputSchema / outputSchema`、workflow `variables`、`llm_agent.config.toolPolicy` 与 workflow `publish` draft 已进入结构化 schema / editor 表达，workflow editor 正在沿统一配置面持续推进，而不是停留在一次性 demo。
- 发布治理已落到独立事实层：binding lifecycle、API keys、cache entries、invocation activity、invocation detail 都有对应 route/service/migration；published invocation detail 与 cache inventory 的人工查看入口也已接上统一敏感访问控制主链。
- 发布网关已从单体中拆出 binding resolver、cache orchestrator、invocation recorder、response builder、protocol surface 与 binding invoker；native / OpenAI / Anthropic route surface 也已拆到独立 route 文件，发布层边界比前几轮更清晰。
- 已开放 native / OpenAI / Anthropic 的 published surface，含 sync、async、alias/path 入口，以及基于 runtime delta / 最终结果映射的最小 SSE。

### 5. 面向工作台与诊断的接口

- Run API 已覆盖创建、详情、events、trace、trace export、resume、callback ingress、execution view、evidence view；其中 execution view 现已直接带出 callback waiting lifecycle 摘要，供工作台和 AI 排障复用同一事实源。
- Workflow library、system overview、plugin adapters、runtime activity、credentials API 已具备；`sensitive-access` 资源注册、访问请求、审批票据与通知投递查询/决策 API 已接到 runtime 与 trace export 主链，为后续 approval inbox、published surface export 治理和通知 worker 预留稳定事实入口。
- workflow editor inspector 已能以结构化 section 暴露 `runtimePolicy.execution / retry / join`、节点 contract、workflow `publish` draft 与部分 `llm_agent` 高级配置；execution section 已先解析默认执行类，再按“偏离默认时才持久化 JSON”的策略落库。
- run diagnostics 已能消费 execution / evidence 聚合视图，并显示 execution boundary summary，但 execution detail、artifact preview、evidence drilldown 仍有继续拆层空间。
- 当前还没有 approval-specific route / notification delivery API；后续若补统一敏感访问控制，应优先复用现有 run detail、resume 与 callback 事实层扩展，而不是另起一套状态体系。

## 当前结构热点

- `api/app/schemas/workflow.py`：已在 2026-03-15 继续降到约 177 行；`api/app/schemas/workflow_graph_validation.py`（约 289 行）承接 graph-level 校验，`api/app/schemas/workflow_node_validation.py`（约 218 行）承接节点级嵌入式 config validator。当前 workflow schema 主文件已基本收口为 IR 文档声明、edge field mapping 与 graph hook；后续若继续补 node contract / config 规则，应沿 helper 模块演进，而不是回流主文件。
- `api/app/api/routes/workflows.py`：已在 2026-03-15 从约 316 行降到约 142 行；`api/app/services/workflow_views.py`（约 175 行）承接 workflow detail/version/run summary 的查询与序列化，`api/app/services/workflow_mutations.py`（约 94 行）承接 create/update 的 workflow version snapshot、compiled blueprint 与 publish binding 编排。当前 route 已更接近“HTTP contract + validation”定位，后续应把 publish governance、sensitive access 与 editor 联动规则继续放在 service / schema 边界演进，而不是再堆回路由层。
- `api/app/services/workflow_library.py` 已在 2026-03-15 拆到约 220 行，当前主要保留 snapshot、workspace starter 读取和 tool visibility orchestration；新增 `api/app/services/workflow_library_catalog.py`（约 474 行）承接 builtin starter、node catalog、source lane 与 blueprint 默认值拼装，当前不再是稳定性阻塞项，但若继续补 ecosystem starter / source governance，可继续沿 source/helper 分层演进。
- `api/app/services/plugin_runtime.py` 已在 2026-03-15 拆成 facade + `plugin_runtime_proxy.py` / `plugin_runtime_adapter_clients.py` / `plugin_runtime_registry.py` / `plugin_runtime_types.py`；主入口已降到 48 行，compat/runtime 侧不再被单文件耦合阻塞。后续若继续补 adapter lifecycle、workspace scoping 或健康探测聚合，应沿现有模块边界扩展，而不是把职责重新堆回 facade。
- `api/app/services/agent_runtime_llm_support.py`：631 行，当前仍集中承接流式调用、usage 累计和 phase 内 LLM 细节；后续若继续补 provider 特性，适合按 stream / completion / usage helper 拆层。
- `api/app/api/routes/runs.py`：已在 2026-03-15 降到约 211 行，当前主要保留 run CRUD / resume / callback / trace HTTP contract；新增 `api/app/services/run_trace_views.py`（约 389 行）统一承接 trace filter、cursor、summary 与 export 序列化。后续若继续补 run detail presenter 或 trace export 治理，优先沿 `run_trace_views.py` / `run_views.py` helper 化演进，而不是把细节重新堆回 route。
- `api/app/api/routes/published_endpoint_cache.py`：当前 route 继续保持薄层；本轮新增 `api/app/services/published_cache_inventory_access.py` 统一承接 published cache inventory 的 active entry -> run -> sensitive resource 聚合、binding 级资源映射与审批复用。后续若继续补 publish export 或 cache drilldown，优先复用这层，而不是在 published route 间复制同一套 run-sensitive 判断。
- `api/app/services/runtime.py`：387 行，主文件继续维持“执行入口 + `_continue_execution` orchestration 主链”定位，没有把节点准备、节点分发或节点收尾重新回流进来；当前长度可接受，但必须继续防止回流。
- `api/app/services/runtime_execution_adapters.py`：新增 execution adapter registry、inline fallback 与 `sandbox_code` adapter，是后续继续扩真实执行边界而不是回堆到 `runtime.py` 的关键落点。
- `api/app/services/runtime_sandbox_code.py`：新增 host-subprocess MVP 执行器，当前只支持 Python，负责把 `sandbox_code` 节点先收敛到独立子进程与 artifact/event trace；后续真实 sandbox / microvm 适合继续从这里外扩。
- `api/app/services/runtime_run_support.py`：403 行，run load / resume / callback 已独立成层，后续应保持 helper 化演进，避免 callback orchestration 再次回流主文件或重新膨胀成新热点。
- `api/app/services/runtime_node_dispatch_support.py`：当前主要承接 direct tool node 的 credential gating、sensitive context read gating 与 generic waiting result suspend；tool invoke 的敏感访问挂点已下沉到 `ToolGateway`，credential `allow_masked` 的明文恢复也不再停留在这里，避免 tool node 与 llm_agent 各自再造审批/解密分支。后续若继续补更多 node-type special case，优先把 tool/context 两支再拆到 helper，而不是让 dispatch support 演进成新的 God file。
- `api/app/services/tool_gateway.py`：约 401 行，当前同时负责 execution trace、结果标准化，以及命中 `local_capability` 资源时的 sensitive access guard；本轮进一步承接 credential masked handle 的最后一跳明文恢复，结构仍可接受，但若继续补 publish/export 级策略、更多 source matcher 或 notification hook，优先抽 helper，而不是把 gateway 继续堆成第二个 orchestration 热点。
- `api/app/services/sensitive_access_control.py`：已在 2026-03-15 拆到约 323 行，主文件聚焦 resource create / access request / approval mutation 与 resume orchestration；新增 `api/app/services/sensitive_access_queries.py`（约 237 行）承接资源/请求/票据查询、runtime scope 校验与 credential/context/tool matcher，`api/app/services/sensitive_access_policy.py`（约 41 行）承接默认策略矩阵，`api/app/services/sensitive_access_types.py`（约 25 行）承接 error / decision / bundle 类型。后续若继续补 notification worker、更多 source matcher 或 policy plug-in，应继续沿 helper 边界扩展，而不是重新堆回主 service。
- `api/app/services/published_invocation_detail_access.py` 与 `api/app/services/run_sensitive_access_summary.py`：本轮新增的 published 详情治理辅助层，分别负责“把 published invocation detail 映射到统一 sensitive access 主链”和“汇总一个 run 已命中的最高敏级资源”。后续若继续扩 published cache inventory / publish export / 更多人类排障详情入口，优先复用这层，而不是把 run-sensitive surface 判断散落回 route 或 publish service。
- `api/app/services/published_protocol_streaming.py` 已在 2026-03-15 降到约 14 行 facade；公共 helper 已下沉到 `api/app/services/published_protocol_streaming_common.py`（约 136 行），native / OpenAI / Anthropic 三条协议流分别下沉到 `published_protocol_streaming_native.py`（约 188 行）、`published_protocol_streaming_openai.py`（约 146 行）和 `published_protocol_streaming_anthropic.py`（约 85 行）。当前 publish streaming 已不再是单文件热点，但后续若继续补 publish export、protocol-specific policy 或 approval timeline，仍应沿这组 helper 模块演进，而不是把细节重新堆回 facade。
- `api/app/services/published_gateway.py`：354 行，service 主体已明显比前期收敛，但 surface orchestration 仍集中在同一服务里，后续可继续按 surface/helper 分层。
- `web/components/run-diagnostics-execution-sections.tsx`：约 531 行，execution / evidence 详情层仍偏重，后续适合继续按 payload、metrics、artifact、evidence drilldown 拆层。
- `web/components/workspace-starter-library.tsx`：440 行，已经比早期收口，但 library 交互、元数据和治理入口仍较集中；后续若再补 diff / governance，应继续拆 section 与 hook。
- `web/components/workflow-editor-workbench/use-workflow-editor-graph.ts`：现已同时维护 nodes / edges / workflow variables / workflow publish draft，graph mutation 仍集中但边界清晰；如果后续继续补 schema builder、sensitive access policy 或更多 workflow-level governance，适合把 publish / variable mutation 再拆成 helper hook。
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
2. **P0：继续扩统一敏感访问控制闭环**
   - `SensitiveAccessRequest`、`ApprovalTicket`、`NotificationDispatch`、`/api/sensitive-access/*`、runtime `credential resolve`、`mcp_query / authorized_context` 的 context read 拦截、`ToolGateway` 的 tool invoke gating、Run API `trace export` 的敏感导出控制、published endpoint invocation detail / cache inventory 的人工详情查看控制，以及 publish 面板对 access-blocked 状态的最小 UI 落点都已落地；credential path 的 `allow_masked` 也已补成真正的 masked/handle 语义。下一步优先把同一套控制继续挂到 publish export 入口，并补真实通知 worker / inbox，避免统一治理仍停留在 credential/context/tool/export/details 几条局部主链。
3. **P0：继续收口 `WAITING_CALLBACK` 的 durable resume 语义**
   - callback ticket cleanup 与手动 cleanup 已能把“过期 ticket -> scheduled resume”一致接回主链，且 resume 调度已改成 after-commit 派发；2026-03-15 已补第一版 repeated expiry backoff、late callback 事件/摘要，以及 execution view 的 callback lifecycle 展示。下一步优先补最大重试/终止策略、published waiting surface 复用和 callback source 聚合，避免外部 callback 型节点仍在边界场景里长期反复等待但缺少明确停机语义。
4. **P1：继续治理插件兼容与工作流定义热点**
  - `plugin_runtime.py` facade、`workflow_library.py`、`workflows.py`、`runs.py` trace/export helper 与 workflow schema 主文件都已分别完成一轮主热点拆层；下一步优先继续治理 compat plugin 的 lifecycle / catalog / store hydration、`run_trace_views.py` / `run_views.py` 的 run detail presenter 边界，以及 `agent_runtime_llm_support.py` 的 phase-specific LLM helper，同时保持新的 `workflow_node_validation.py` 不回流到主 schema，为 publish governance / sensitive access policy 预留稳定 service 边界。
5. **P1：继续治理 run diagnostics 与 publish streaming 详情层**
   - `api/app/services/published_protocol_streaming.py` 已在 2026-03-15 完成 facade + protocol helper 拆层，run diagnostics / workflow overlay 的 trace export 阻断 UI 也已补齐；下一阶段可优先拆 `web/components/run-diagnostics-execution-sections.tsx`，并继续补 publish export、approval timeline、security decision summary 与 protocol-specific SSE policy helper。
6. **P1：继续提高工作流编辑器完整度**
   - 在现有 `runtimePolicy.execution / retry / join`、节点 contract、workflow `variables`、workflow `publish` draft 与 `llm_agent.toolPolicy` 基础上，继续补敏感访问策略入口、schema builder，以及更清晰的 advanced JSON / structured form 边界。
7. **P2：先把 `organization / workspace / member / role / publish governance` 写成最小领域模型设计稿**
   - 在不提前引入重 IAM 或复杂多组织计费系统的前提下，先收敛 Team / Enterprise 最小治理模型与 API 预留，明确哪些属于 Community kernel、哪些属于商业治理能力，避免后续实现、README 和对外叙事再次混线。
8. **P2：继续收敛 Community License 的执行边界**
   - 围绕 `workspace = tenant`、多租户托管、商业化对立面、前端品牌替换和白标分发等触发条件，继续补文档、术语定义和未来商业授权入口，避免许可证文本有了但执行口径仍模糊。
9. **P3：继续完善 AI 协作 skill 的双层体系**
   - 根据后续实现节奏，继续补强 backend refactor、runtime debugging、发布治理验证等高复用流程，并定期复核 skill 与 `AGENTS.md`、`runtime-foundation.md`、README 索引的一致性，避免 skill 再次漂移。
10. **P3：把 OpenClaw-first README / demo / 首页入口收成可传播资产**
   - 在策略与授权边界稳定后，继续补 README 截图、demo 路径、首页文案和示例 workflow，让“黑盒变透明”的外部入口真正可演示、可传播、可复用。
