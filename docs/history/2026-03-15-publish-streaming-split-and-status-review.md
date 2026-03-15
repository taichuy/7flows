# 2026-03-15 发布流式层拆分与项目现状复核

## 背景

- 用户要求系统复核当前仓库状态：阅读 `AGENTS.md`、`docs/dev/user-preferences.md`、`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/dev/runtime-foundation.md`，并判断基础框架是否已足够支撑后续功能开发、插件扩展、兼容性、可靠性、安全性与稳定性。
- 用户同时要求检查最近一次 Git 提交是否需要直接衔接，并在确认优先级后继续推进一项开发工作，同时补齐开发记录。
- 最近一次提交是 `af4fd9a refactor: split run trace route helpers`，已把 run trace/filter/cursor/export helper 从 `api/app/api/routes/runs.py` 下沉到 `api/app/services/run_trace_views.py`。

## 本轮复核结论

### 1. 上一次提交是否需要直接衔接

- 不需要做“紧急补救式衔接”。`af4fd9a` 已经把 run trace route 的主要耦合点拆开，路由层与 presenter/helper 的边界更清晰，没有暴露出需要马上修复的回归问题。
- 但从结构演进上，上一轮提交的方向需要继续延续：当前项目已经从“有没有基础框架”进入“继续消化热点文件、补齐 P0 闭环”的阶段。

### 2. 基础框架是否足够继续推进

- 结论是“足够”，而且已经明显超过初始化骨架阶段。
- 后端方面，`RuntimeService` 继续作为单一 orchestration owner，围绕 workflow version、compiled blueprint、run / node_run / run_event、artifact/evidence、published surface、sensitive access 和 callback ticket 组织当前事实层。
- 前端方面，workflow editor、publish draft、run diagnostics、publish governance 等入口已存在，已经能承接持续的功能性开发，不再只是静态工作台。

### 3. 架构是否满足后续能力演进

- **功能性开发**：满足。当前骨架已经能够继续补 workflow editor、publish governance、diagnostics、plugin compat 和 runtime 主链。
- **插件扩展性 / 兼容性**：满足继续推进的前提。`7Flows IR`、compat proxy、published gateway 与 runtime 主控边界仍然成立，没有退化成协议专属执行链。
- **可靠性 / 稳定性**：方向正确但还没收口。`WAITING_CALLBACK` 的后台唤醒、真实隔离执行与通知投递闭环仍是 P0。
- **安全性**：主方向正确。统一敏感访问控制已经接到 credential、context、tool、run trace export 与部分 published 详情入口，但 publish export、notification worker / inbox、credential `allow_masked` 真实语义仍待继续补齐。

### 4. 是否已经到“人工逐项界面设计/验收”阶段

- 还没有。
- 当前项目已经适合继续围绕主业务完整度推进，但还没达到“只剩人工逐项界面设计测试”的阶段，因此本轮不触发通知脚本。

## 为什么本轮优先拆 publish streaming

- 在最近提交已经收口 run trace route 之后，`api/app/services/published_protocol_streaming.py` 仍然集中承接 native / OpenAI / Anthropic 三条 SSE 映射主线，是发布层后续最明显的后端热点之一。
- 该模块直接关系到：
  - published surface 的协议兼容边界
  - 运行事实到 SSE 的对外映射稳定性
  - 后续敏感访问治理、approval timeline、protocol-specific helper 的继续演进空间
- 因此它比继续扩某个局部 UI 更适合作为本轮“基于优先级开发”的落点。

## 目标

1. 拆开 `api/app/services/published_protocol_streaming.py` 的多协议职责。
2. 保持现有公开导入面与 SSE 行为不变。
3. 给后续 publish streaming 细化治理、协议级 helper 和更细颗粒度测试预留边界。

## 实现

### 1. 保留 facade，拆出协议专属模块

- 保留 `api/app/services/published_protocol_streaming.py` 作为对外 facade，只继续暴露：
  - `build_native_run_stream`
  - `build_openai_chat_completion_stream`
  - `build_openai_response_stream`
  - `build_anthropic_message_stream`
- 新增 `api/app/services/published_protocol_streaming_common.py`，统一承接：
  - SSE 序列化
  - 文本 chunk
  - protocol fallback text 提取
  - run event 中 delta / completed output 的文本归并
- 新增 `api/app/services/published_protocol_streaming_native.py`，承接 native stream payload 拼装与 fallback delta 逻辑。
- 新增 `api/app/services/published_protocol_streaming_openai.py`，承接 chat completions / responses 两类 OpenAI 风格流式输出。
- 新增 `api/app/services/published_protocol_streaming_anthropic.py`，承接 Anthropic message stream 的事件序列。

### 2. 结果

- `api/app/services/published_protocol_streaming.py` 从原先单体热点降为约 14 行 facade。
- 原先单文件职责被拆为：
  - common helper：约 136 行
  - native stream：约 188 行
  - openai stream：约 146 行
  - anthropic stream：约 85 行
- 对外调用路径保持不变，因此路由层和测试导入无需改协议入口。

## 影响范围

- `api/app/services/published_protocol_streaming.py`
- `api/app/services/published_protocol_streaming_common.py`
- `api/app/services/published_protocol_streaming_native.py`
- `api/app/services/published_protocol_streaming_openai.py`
- `api/app/services/published_protocol_streaming_anthropic.py`
- `docs/dev/runtime-foundation.md`

## 验证

在 `api/` 目录执行：

```powershell
.\.venv\Scripts\uv.exe run pytest -q .\tests\test_published_protocol_streaming.py
.\.venv\Scripts\uv.exe run ruff check --fix .\app\services\published_protocol_streaming.py .\app\services\published_protocol_streaming_common.py .\app\services\published_protocol_streaming_native.py .\app\services\published_protocol_streaming_openai.py .\app\services\published_protocol_streaming_anthropic.py
.\.venv\Scripts\uv.exe run pytest -q
```

结果：

- `pytest -q .\tests\test_published_protocol_streaming.py`：通过，`6 passed`
- changed-files `ruff check`：通过
- `pytest -q`：通过，`243 passed`
- `git diff --check`：通过

## 当前判断

- 当前项目基础框架已经满足继续推进产品设计目标，不需要回到“先补基础框架再说”的阶段。
- 当前项目仍没到“只剩人工逐项界面设计 / 人工验收”的阶段，本轮不运行通知脚本。
- 继续影响推进速度的主要问题，已经从“有没有架构”转成：
  - P0 闭环是否补齐
  - 热点文件是否持续拆层
  - publish / diagnostics / sensitive-access / waiting-resume 是否沿统一事实层演进

## 下一步

1. **P0**：继续把 graded execution 扩成真实隔离能力，补 sandbox / microvm tool adapter 与 compat plugin execution boundary。
2. **P0**：继续扩统一敏感访问控制闭环，优先补 publish export、通知 worker / inbox 与 credential `allow_masked` 真正语义。
3. **P0**：补齐 `WAITING_CALLBACK` 的后台唤醒闭环，避免 durable execution 仍停留在半闭环。
4. **P1**：继续治理 `web/components/run-diagnostics-execution-sections.tsx`、`api/app/services/agent_runtime_llm_support.py` 与 `api/app/services/runtime_node_dispatch_support.py` 等剩余热点。
