# 2026-03-17 Skill Reference Execution Trace

## 背景

- `SkillDoc`、REST catalog、`skills.get_reference` MCP contract、`llm_agent.skillIds` 注入链和 phase-aware lazy fetch 已经落地。
- 但在本轮之前，runtime 虽然会发出 `agent.skill.references.loaded` 事件，operator 侧仍很难回答三个关键问题：
  - 哪些 reference body 真的被注入进了某个 phase；
  - 这些正文来自固定 `skill_binding`，还是来自 query-driven 的 `retrieval_query_match`；
  - 如果后续要继续排障或补更深材料，应走哪个 retrieval handle。
- 这会让 Skill Catalog 这条能力链停留在“AI 看得到、operator 看不清”的状态，不利于人 / AI 协作层继续闭环。

## 目标

- 把 skill reference 注入从 runtime raw event 补成 execution diagnostics 中稳定可见的事实层。
- 保持当前 `SkillDoc` / `skills.get_reference` 设计不变，不引入第二套 DSL 或新的 runtime 控制语义。
- 为下一步“主 AI 显式发起 reference retrieval”预留更清晰的 trace 语义。

## 本轮实现

### 1. 丰富 runtime 事件的 reference metadata

- `api/app/services/agent_runtime.py`
  - `agent.skill.references.loaded` 不再只回写 `skill_id / reference_id`。
  - 现在会稳定携带：
    - `skill_name`
    - `reference_name`
    - `load_source`（`skill_binding` / `retrieval_query_match`）
    - `retrieval_http_path`
    - `retrieval_mcp_method`
    - `retrieval_mcp_params`
- 事件语义也从“推荐了哪个 reference”收口为“实际被注入正文的 reference 是哪些”。只有真正进入 prompt body 的 reference 才会计入该事件，避免把预算耗尽后只剩 retrieval handle 的 reference 误报成已注入正文。

### 2. 把 skill reference load 收口进 execution view

- `api/app/schemas/run_views.py`
  - 新增 `SkillReferenceLoadItem` / `SkillReferenceLoadReferenceItem`。
  - `RunExecutionSummary` 新增：
    - `skill_reference_load_count`
    - `skill_reference_phase_counts`
    - `skill_reference_source_counts`
  - `RunExecutionNodeItem` 新增：
    - `skill_reference_load_count`
    - `skill_reference_loads[]`
- `api/app/services/run_execution_views.py`
  - 新增 `summarize_skill_reference_loads()`，把 raw event 解析成 execution summary 与 node-level structured facts。
  - summary 统计按“reference 条数”聚合，而不是按 event 批次数聚合，便于 operator 快速判断一次 run 实际注入了多少技能材料。

### 3. 在前端 diagnostics 中直接展示

- `web/lib/get-run-views.ts`
  - 补 execution view 的 skill reference types。
- `web/components/run-diagnostics-execution/execution-overview.tsx`
  - overview 新增 `Skill refs loaded` summary card。
  - 新增按 phase / source 聚合的 metrics。
- `web/components/run-diagnostics-execution/execution-node-card.tsx`
  - node card 顶部新增 `skill refs` 数量 chip。
- `web/components/run-diagnostics-execution/execution-node-card-sections.tsx`
  - 新增 `Skill references` section，直接展示：
    - 注入发生在哪个 phase
    - 每条 reference 的 `skill_name / reference_name`
    - `load_source`
    - 后续排障或继续 retrieval 可复用的 `http / MCP` handle

## 影响范围

- `llm_agent` 的技能注入从“只在 prompt 内可感知”推进到“execution diagnostics 可追踪”。
- operator 可以更直接地区分：
  - 固定绑定的 reference
  - query-driven 临时匹配的 reference
- 这让 Skill Catalog 主链不再只是注入层能力，也更接近可调试、可追溯的产品能力。

## 验证

- `api/.venv/Scripts/uv.exe run pytest -q tests/test_agent_runtime_llm_integration.py tests/test_run_view_routes.py`
- `api/.venv/Scripts/uv.exe run pytest -q`
- `api/.venv/Scripts/uv.exe run ruff check api/app/services/agent_runtime.py api/app/services/run_execution_views.py api/app/schemas/run_views.py api/tests/test_agent_runtime_llm_integration.py api/tests/test_run_view_routes.py`
- `web/pnpm exec tsc --noEmit`
- `web/pnpm lint`
- `git diff --check`

验证结果：全部通过。

## 未决与下一步

1. 当前仍是 runtime 按 phase / query 进行 lazy fetch，主 AI 还不能显式发起单个 `skills.get_reference` 请求。
2. 本轮已把“实际注入了哪些正文”补成 operator trace，下一步应继续补：
   - 更细粒度的 fetch reason
   - multi-fetch trace
   - 主 AI 显式请求 reference 的最小语义
3. published invocation detail 目前还没有同级别的 skill reference drilldown；若后续 OpenClaw-first demo 要强调“为什么 AI 会这样回答”，这块应继续向 published/operator 侧扩展。
