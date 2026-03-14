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

## 当前代码事实

### 1. 持久化与迁移

- Alembic 已替代 `create_all`；迁移已覆盖运行时、workflow version、compiled blueprint、published endpoint、API key、cache、credential 等核心事实层，当前版本到 `20260314_0020_published_invocation_cache_links.py`。
- `api/docker/entrypoint.sh` 支持 `SEVENFLOWS_MIGRATION_ENABLED=true` 时启动前自动迁移；默认只让 `api` 服务自动迁移，避免 `worker` 并发升级数据库。
- `credentials` 已入库，后续 provider / tool 凭据管理不再需要继续停留在纯占位状态。

### 2. Runtime 执行骨架

- `RuntimeService` 已采用 compiled blueprint 执行链，run 会显式绑定 `workflow_version` 与 `compiled_blueprint_id`。
- 当前执行器已支持拓扑排序、条件/路由分支、join、mapping、节点重试、waiting/resume、callback ticket、artifact 引用和统一事件落库。
- 2026-03-14 已连续推进三轮 runtime 结构治理：先把 run load / resume / callback orchestration 从 `runtime.py` 拆到 `runtime_run_support.py`，再把 graph support 拆成 `runtime_branch_support.py`、`runtime_mapping_support.py` 与收口后的 `runtime_graph_support.py`，本轮继续把节点失败 / waiting / 成功收尾与 run 完成输出从 `runtime.py` 收口到 `runtime_execution_progress_support.py`，`RuntimeService` 主文件进一步回到“执行入口 + 执行主链 orchestration”职责。
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
- 已开放 native / OpenAI / Anthropic 的 published surface，含 sync、async、alias/path 入口，以及基于 runtime delta / 最终结果映射的最小 SSE。

### 5. 面向工作台与诊断的接口

- Run API 已覆盖创建、详情、events、trace、trace export、resume、callback ingress、execution view、evidence view。
- Workflow library、system overview、plugin adapters、runtime activity、credentials API 已具备，为编辑器、诊断面板和发布治理继续承接提供稳定后端入口。
- 前端与后端的诊断/治理界面应继续消费这些事实接口，而不是直接拼装数据库内部结构。

## 当前结构热点

- `api/app/services/runtime.py`：382 行，节点失败 / waiting / 成功收尾与 run output finalization 已移到 `runtime_execution_progress_support.py`（218 行），主文件热点继续下降，但 `_continue_execution` 仍承接节点遍历与 orchestration 主链。
- `api/app/services/runtime_node_execution_support.py`：684 行，当前成为 runtime 结构治理中最明显的后端热点之一，后续应继续按节点准备、重试循环、节点类型执行与事件拼装边界拆分。
- `api/app/services/runtime_run_support.py`：403 行，run load / resume / callback 已独立成层，后续应保持 helper 化演进，避免 callback orchestration 再次回流主文件或重新膨胀成新热点。
- `api/app/services/runtime_graph_support.py`：292 行，已从总装热点收口为 graph orchestration 组合层；`runtime_branch_support.py`（262 行）与 `runtime_mapping_support.py`（176 行）分别承接 branch/selector 与 mapping/merge 逻辑，边界比上一轮更清晰。
- `web/components/run-diagnostics-panel.tsx`：688 行，调试面板仍需按摘要、时间线、钻取入口继续拆层。
- `api/app/services/published_invocation_audit.py` 已收口到 197 行，但 publish governance 仍由 `published_invocation_audit_aggregation.py`（340 行）和 `published_invocation_audit_timeline.py`（206 行）承接；后续应继续防止查询、facet、timeline 再次回流单文件。
- 当前项目整体判断不变：基础框架足够继续推主业务完整度，但还没到“只剩人工界面设计 / 全链路人工验收”的阶段。

## 本轮压缩说明

- 旧版 `runtime-foundation` 经多轮直接追加，已从“当前事实索引”膨胀为“历史流水账”，不再适合作为后续开发第一参考。
- 2026-03-14 起，详细历史已归档到 `docs/expired/2026-03-14-runtime-foundation-history-expired.md`，压缩过程说明归档到 `docs/history/2026-03-14-runtime-foundation-compression.md`；主文档只保留当前仍成立的代码事实、结构热点和当前优先级。
- 后续若再超过可维护体量，应继续按“当前代码事实优先、历史另行归档、下一步规划保留”的原则压缩。

## 下一步规划

1. **P0：继续治理 `api/app/services/runtime_node_execution_support.py`**
   - 现在 `runtime.py` 的 waiting / output finalization 已收口，下一步优先把节点准备、重试循环、节点类型执行与事件拼装继续拆出 helper / support，避免新的热点长期停留在单文件。
2. **P1：继续治理 `web/components/run-diagnostics-panel.tsx`**
   - 进一步拆 summary / sections / detail drilldown，保持调试面板聚合摘要优先。
3. **P1：继续补节点配置完整度**
   - 把 provider / model / tool / publish 配置继续做成结构化配置段，而不是留在大表单里。
4. **P1：继续收紧 publish governance 聚合边界**
   - 保持 `published_invocation_audit.py` 只做 orchestration，新增查询或图表统计时优先落到 aggregation / timeline helpers，而不是回流 mixin。
