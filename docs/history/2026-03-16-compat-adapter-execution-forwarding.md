# 2026-03-16 compat adapter execution forwarding 与项目现状衔接

## 背景

本轮先按仓库协作约定重新建立上下文，复核了以下事实来源：

- `AGENTS.md`
- `docs/dev/user-preferences.md`
- `docs/product-design.md`
- `docs/open-source-commercial-strategy.md`
- `docs/technical-design-supplement.md`
- `docs/dev/runtime-foundation.md`
- 当前仓库结构、长文件热点，以及最近一次 Git 提交 `84f8068 fix: honor llm agent tool execution overrides`

复核后确认：

- 基础框架已经写到“可以持续推进功能开发”的阶段，后端 runtime / publish / diagnostics / sensitive access / workflow editor 都不是空壳。
- 当前还没有进入“只剩人工逐项界面设计/验收”的阶段，因此本轮不触发通知脚本 `node "e:\code\taichuCode\ai-presson-wen\aionui\notice\kill-port-8050.js"`。
- 最近提交修复了 `llm_agent` 单次 tool call 对 `toolPolicy.execution` 的覆盖语义，但 compat adapter `/invoke` 请求仍没有收到这份 execution contract，导致这条主线只在 7Flows 内部 trace / artifact 中变真，尚未继续衔接到兼容层桥接边界。

## 目标

把上一次提交留下的 execution policy 主线继续往前推一小步：

1. 让 compat adapter `/invoke` 请求收到标准化 `execution` payload，而不是只拿到 `traceId` 和 `executionContract`。
2. 保持 `7Flows IR -> ToolGateway -> PluginCallProxy -> compat adapter` 这条边界一致，不引入第二套 execution DSL。
3. 用回归测试证明“per-call execution override 不只写进 trace，也能继续透传到 compat adapter 调用请求”。

## 本轮实现

### 1. 把 execution contract 接进 compat adapter 请求对象

- 在 `api/app/services/plugin_runtime_types.py` 为 `PluginCallRequest` 新增 `execution` 字段。
- 这份字段复用统一的 runtime payload 结构，不额外发明 adapter 专属 schema。

### 2. ToolGateway 透传统一 execution payload

- `api/app/services/tool_gateway.py` 现在会在调用 `PluginCallProxy.invoke()` 时，把 `ResolvedExecutionPolicy.as_runtime_payload()` 一并传入 `PluginCallRequest.execution`。
- 这样 `tool node` 与 `llm_agent` 内部 tool call 共享同一条 execution forwarding 主链。

### 3. PluginCallProxy 把 execution 真正发到 adapter `/invoke`

- `api/app/services/plugin_runtime_proxy.py` 现在会把 `request.execution` 写进 compat adapter `/invoke` payload。
- 保留现有 `executionContract` 不变；`executionContract` 继续描述工具输入契约，`execution` 则描述当前这次调用请求的执行提示。

### 4. 补齐两层回归测试

- `api/tests/test_plugin_runtime.py`
  - 补断言：compat adapter 默认调用会收到空 `execution` payload。
  - 新增单测：显式 execution payload 会被 `PluginCallProxy` 原样转发到 compat adapter。
- `api/tests/test_runtime_service_agent_runtime.py`
  - 新增端到端回归：`llm_agent` 的 per-call execution override 经 `ToolGateway -> PluginCallProxy` 后，会带着 `class/source/profile/timeoutMs/networkPolicy/filesystemPolicy` 进入 compat adapter 请求，同时 runtime trace 继续保留 `tool.execution.dispatched/fallback` 事实。

## 当前结论

### 1. 上一次 Git 提交是否需要衔接

需要，而且这次衔接是顺着同一条主线继续补真，不是推翻重来。

- 上一次提交已经把 `llm_agent` 单次 tool call override 从“配置可写”补成“runtime trace 真识别”。
- 本轮继续把这份 execution 语义推进到 compat adapter 请求边界，避免 execution policy 只在 7Flows 内部自说自话。

### 2. 基础框架是否已经设计写好

结论仍是：**是，已经足够支撑继续做主业务功能开发。**

原因：

- `RuntimeService` 仍保持唯一主控，runtime / agent runtime / tool gateway / publish gateway 没有失控分叉。
- `runs / node_runs / run_events / run_artifacts / tool_call_records / ai_call_records` 已是稳定事实层。
- workflow editor、run diagnostics、published gateway、sensitive access inbox 都已经接上真实链路。

### 3. 架构是否满足功能推进、扩展性、兼容性、可靠性、安全性

当前判断：**方向正确，可继续推进，但仍有几个 P0/P1 缺口不能误判成“已完成”。**

- 功能性开发：满足度较高，主干可持续推进。
- 插件扩展性：满足度中高；compat plugin、native tool、workflow library catalog 已分层，但 compat lifecycle/store hydration 仍需继续拆稳。
- 兼容性：满足度中高；当前严格限定在 Dify plugin 兼容层，没有被外部 DSL 反客为主。
- 可靠性与稳定性：满足度中高；waiting/resume、callback ticket、artifact/evidence、trace export、approval timeline 已形成真实主链，但 operator 聚合面和批量治理还需继续收口。
- 安全性：满足度中高；敏感访问控制、credential masking、审批票据与通知 worker 已入链，但真实 email/slack/feishu adapter 与更细的 operator 解释仍属 P0。
- execution 隔离兑现：仍是最重要的 P0 缺口；本轮只是把 compat adapter 请求拿到统一 execution contract，真实 `sandbox` / `microvm` adapter 仍未完成。

### 4. 仍值得继续解耦的长文件热点

本轮复核后，仍优先建议关注这些增长中的热点：

1. `api/app/services/runtime_node_dispatch_support.py`
2. `api/app/services/agent_runtime_llm_support.py`
3. `api/app/services/workspace_starter_templates.py`
4. `api/app/api/routes/workspace_starters.py`
5. `api/app/services/run_views.py`
6. `web/lib/get-workflow-publish.ts`
7. `web/components/workflow-editor-workbench/use-workflow-editor-graph.ts`

它们不一定立刻阻断功能，但都已进入“继续堆功能会明显变脆”的区间。

## 验证

在 `api/` 目录执行：

```powershell
.\.venv\Scripts\uv.exe run pytest tests/test_plugin_runtime.py -q
.\.venv\Scripts\uv.exe run pytest tests/test_runtime_service_agent_runtime.py -q
.\.venv\Scripts\uv.exe run ruff check app/services/plugin_runtime_types.py app/services/plugin_runtime_proxy.py app/services/tool_gateway.py tests/test_plugin_runtime.py tests/test_runtime_service_agent_runtime.py
```

结果：

- `tests/test_plugin_runtime.py -q`：`12 passed`
- `tests/test_runtime_service_agent_runtime.py -q`：`10 passed`
- 合并回归 `pytest tests/test_plugin_runtime.py tests/test_runtime_service_agent_runtime.py -q`：`22 passed`
- `ruff check`：通过

## 下一步建议

1. **P0：让 compat adapter 开始兑现 forwarded execution payload**
   - 至少先把 `sandbox / microvm` 请求在 adapter 侧区分成真实执行模式或明确拒绝，而不是长期只做被动透传。
2. **P0：继续补真实 tool execution adapter**
   - 当前 runtime node 与 compat adapter 都已有 execution contract，但真实 `sandbox` / `microvm` tool adapter 仍缺失。
3. **P0：继续扩统一 Sensitive Access Control 的 operator 面**
   - 重点补 email/slack/feishu adapter、批量治理动作与 run/published/inbox 聚合解释。
4. **P1：继续拆解结构热点文件**
   - 优先从 `agent_runtime_llm_support.py`、`runtime_node_dispatch_support.py`、`run_views.py` 开始，避免高频主链继续膨胀。
