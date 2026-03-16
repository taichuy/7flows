# 2026-03-16 agent runtime LLM phase helper 解耦与现状衔接

## 背景

本轮先按仓库协作约定复核了以下事实来源：

- `AGENTS.md`
- `docs/dev/user-preferences.md`
- `docs/product-design.md`
- `docs/open-source-commercial-strategy.md`
- `docs/technical-design-supplement.md`
- `docs/dev/runtime-foundation.md`
- 最近一次 Git 提交 `f4016e7 refactor: split compat proxy execution helpers`
- 近期 `docs/history/2026-03-16-*.md` 留痕与当前源码热点

用户本轮要求除了复核项目现状、架构边界和最近提交外，还要基于优先级继续推进一项实际开发，并同步开发记录与当前事实索引。

## 现状判断

### 1. 最近一次提交是否需要衔接

需要衔接，但不一定要继续只做 compat adapter 单线功能堆叠。

- `f4016e7 refactor: split compat proxy execution helpers` 已把 compat transport 的 execution planning 与 constrained-ir contract 绑定从 `plugin_runtime_proxy.py` 中拆开。
- 这说明当前项目的高优先级不是“回头重写底座”，而是继续把会阻塞后续功能开发的热点 service 收口成稳定边界。
- 因此本轮延续的不是 compat adapter 的单点功能，而是同一条“先减热点、再放功能”的工程主线。

### 2. 基础框架是否已经足够支撑后续开发

结论：**已经足够支撑持续功能开发，不需要回退到重搭框架。**

- 后端仍保持 `RuntimeService` / `AgentRuntime` 单一 orchestration owner。
- `runs / node_runs / run_events / run_artifacts / tool_call_records / ai_call_records` 事实层稳定，前后端主要面板都接了真实数据。
- 当前还没进入“只剩人工逐项界面设计和验收”的阶段，因此本轮仍不触发通知脚本 `node "e:\code\taichuCode\ai-presson-wen\aionui\notice\kill-port-8050.js"`。

### 3. 当前最值得继续治理的热点

在 compat proxy 热点收口后，`api/app/services/agent_runtime_llm_support.py` 成为新的典型结构阻塞点：

- 上一版 565 行，混合了承接 plan、assistant evidence distill、finalize、streaming delta、usage 累计和降级逻辑。
- 这部分已经直接关系到 `llm_agent` 后续补 provider 特性、assistant 策略和 finalize fallback，不宜继续堆回单文件。
- 该热点已经不只是“代码长”，而是会影响后续功能迭代的边界清晰度和测试可维护性。

## 本轮决策

本轮优先做 **`agent_runtime_llm_support.py` phase helper 拆层**，而不是再插入新的功能分支。

原因：

1. 它直接回应了“部分文件是否太长需要解耦”的问题。
2. 它延续了最近两轮已经形成的结构治理方向。
3. 它能在不改变外部行为的前提下，为后续 `llm_agent`、publish、tool gateway 相关功能继续扩展腾出边界。

## 本轮实现

### 1. 把单文件 phase 逻辑拆成三个 helper

- `api/app/services/agent_runtime_llm_plan.py`
  - 承接 plan 构建与 checkpoint plan 恢复。
- `api/app/services/agent_runtime_llm_assistant.py`
  - 承接 assistant 触发判断、evidence distill 和 synthetic fallback。
- `api/app/services/agent_runtime_llm_finalize.py`
  - 承接 finalize、streaming delta、usage 累计和同步降级逻辑。

### 2. 保留一个轻量 facade 作为宿主边界

- `api/app/services/agent_runtime_llm_support.py`
  - 现在只保留共享的 LLM call/config helper、assistant config helper 和 tool result serialization。
  - `AgentRuntime` 继续只依赖一个 facade import，不需要改变 orchestrator 结构。

### 3. 行为保持不变但结构更适合继续扩展

- `main_plan`、`assistant_distill`、`main_finalize` 的原有测试行为保持不变。
- streaming delta 与 usage 累计仍沿现有逻辑落库，不新增第二套事件链或第二套 runtime owner。
- 后续若继续补 provider-specific streaming 或 finalize fallback，只需要在 phase helper 内继续演进，而不必再回到单个大 mixin 中穿插修改。

## 影响范围

- `llm_agent` phase-specific 逻辑边界更清晰。
- 后续 `AgentRuntime` 功能扩展不必继续膨胀 facade。
- 项目整体架构判断不变：当前已经具备继续推进主业务完整度的基础，不需要回头补“基础框架是否存在”这种底座问题。

## 验证

在 `api/` 目录执行：

```powershell
.\.venv\Scripts\uv.exe run ruff check app/services/agent_runtime_llm_support.py app/services/agent_runtime_llm_plan.py app/services/agent_runtime_llm_assistant.py app/services/agent_runtime_llm_finalize.py
.\.venv\Scripts\uv.exe run pytest tests/test_runtime_service_agent_runtime.py tests/test_agent_runtime_llm_integration.py tests/test_agent_runtime_llm_streaming.py -q
.\.venv\Scripts\uv.exe run pytest -q
```

结果：

- changed-files `ruff check`：通过
- agent runtime / llm 相关局部回归：`21 passed`
- 后端全量测试：`282 passed`

说明：

- 本轮如果把既有未改动测试文件一起纳入 `ruff check`，会命中仓库历史债务（未使用 import、超长断言行等）；这些不是本轮新增问题，因此最终验证按 changed files 口径记录。

## 结论

- 最近一次提交不需要“补救式接盘”，但它明确了当前应继续优先治理结构热点的方向；本轮已顺着这一方向继续推进。
- 当前项目已经具备继续做功能、插件扩展、兼容性和稳定性建设的基础框架，后续重点在于沿优先级持续补完能力，而不是回退到底座阶段。
- `agent_runtime_llm_support.py` 的拆层属于低风险、高收益的结构性收口，为后续主业务推进让出了更稳定的 service 边界。

## 下一步建议

1. **P0：继续把 graded execution 兑现成真实隔离执行体**
   - 优先补真实 `sandbox / microvm` tool adapter，而不是让 execution capability 长期停留在 trace / payload / guard 层。
2. **P1：继续治理 compat plugin lifecycle / catalog / store hydration**
   - 在已有 compat transport helper 边界上继续拆生命周期与 workspace-scoped hydration。
3. **P1：继续治理 run detail / diagnostics presenter 边界**
   - 后端优先 `run_views.py` / `run_trace_views.py`，前端优先 execution node card 与 workflow editor graph hook。
