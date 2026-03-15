# 2026-03-15 凭证 `allow_masked` handle 语义补齐与项目现状复核

## 背景

- 用户要求系统性阅读 `AGENTS.md`、`docs/dev/user-preferences.md`、`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/dev/runtime-foundation.md`，并复核当前项目是否已经具备继续推进产品设计目标的基础框架。
- 用户同时要求检查最近一次 Git 提交做了什么、是否需要直接衔接，并按优先级继续开发一项关键能力，同时补齐文档留痕。
- 最近一次提交是 `afcecabb refactor: split published protocol streaming`：它把 published streaming 从单体文件拆成 facade + common/native/openai/anthropic 四个 helper 模块，方向正确，但不属于必须立刻补救的半成品。

## 本轮复核结论

### 1. 上一次提交是否需要直接衔接

- 不需要做“紧急修补式”衔接。`afcecabb` 已经把 publish streaming 的协议职责拆开，发布层边界比之前清晰，没有暴露立即回滚或立即救火的问题。
- 但这次提交的治理方向需要继续延续：当前项目的主要矛盾，已经从“有没有基础框架”转成“P0 闭环是否补齐、热点文件是否持续拆层、敏感治理/等待恢复/执行隔离是否沿统一事实层演进”。

### 2. 基础框架是否已经写好

- 结论是“足够继续主业务开发”，而且已经明显超过空壳阶段。
- 后端已经具备：workflow version + compiled blueprint、run / node_run / run_event、artifact / evidence、published surface、sensitive access、waiting / resume 与 callback ticket 等主链事实层。
- 前端已经具备：workflow editor、publish draft、run diagnostics、publish governance、credential/plugin/workspace starter 等入口，不再只是静态展示工作台。

### 3. 架构是否满足后续开发与非功能要求

- **功能性开发**：满足。当前骨架已经能持续推进 workflow editor、diagnostics、publish governance、plugin compat 和 runtime 主链。
- **插件扩展性 / 兼容性**：满足继续演进的前提。`7Flows IR`、compat proxy、published gateway 与 runtime 单一 orchestration owner 仍然成立，没有被外部协议反向主导。
- **可靠性 / 稳定性**：方向正确但还没收口。`WAITING_CALLBACK` 后台唤醒、真实隔离执行能力、通知 worker / inbox 仍是 P0。
- **安全性**：主链已成立，但局部治理仍需继续补齐。credential / context / tool / trace export / published detail / cache inventory 已接入统一敏感访问控制；本轮补上了 credential `allow_masked` 不再等同明文放行的缺口。

### 4. 哪些文件仍然偏长、需要后续解耦

- 后端热点：`api/app/services/agent_runtime_llm_support.py`、`api/app/services/runtime_node_dispatch_support.py`、`api/app/services/agent_runtime.py`。
- 前端热点：`web/components/run-diagnostics-execution-sections.tsx`、`web/components/workspace-starter-library.tsx`、`web/components/workflow-editor-workbench/use-workflow-editor-graph.ts`。
- 当前这些热点还没有把主链拖回“无法迭代”的状态，但已经足够进入“继续按边界拆层而不是继续堆逻辑”的阶段。

### 5. 是否已经到“人工逐项界面设计 / 验收”阶段

- 还没有。
- 当前项目仍处于“继续补主业务闭环 + 治理热点 + 收口 P0 架构缺口”的阶段，因此本轮不触发 `node "e:\code\taichuCode\ai-presson-wen\aionui\notice\kill-port-8050.js"` 通知脚本。

## 为什么本轮优先补 credential `allow_masked`

- `docs/dev/runtime-foundation.md` 已把它列为 P0：credential 路径上的 `allow_masked` 仍“事实等同 allow”，这意味着 moderate-sensitive 凭证在 runtime resolve 阶段仍可能被直接解密成明文。
- 这与 `docs/product-design.md`、`docs/technical-design-supplement.md` 里“优先给 handle / masked value，而不是直接给原文”的敏感访问原则不一致。
- 这个缺口虽然不一定立刻让流程失败，但会削弱后续安全治理边界，因此优先级高于继续补某个局部 UI。

## 目标

1. 让 credential 路径上的 `allow_masked` 真正返回 masked handle，而不是继续返回明文。
2. 保持工具调用和 LLM 调用的最终执行能力不回退：最后一跳仍能把 handle 解析为真实密钥。
3. 用测试证明 tool 路径、llm 路径和 `CredentialStore` 本身都能覆盖这条语义。

## 实现

### 1. `CredentialStore` 不再把 `allow_masked` 当成 `allow`

- 在 `api/app/services/credential_store.py` 中新增 masked handle 语义：
  - `resolve_runtime_credential_refs()` 命中 `allow_masked` 时，不再直接解密返回凭证值；
  - 改为生成 `credential+masked://<credential_id>#<field>` 形式的运行时 handle；
  - 新增 `resolve_masked_runtime_credentials()`，负责在最后一跳把 handle 解析回真实密钥。

### 2. 只在最后一跳恢复明文

- `api/app/services/tool_gateway.py` 在真正调用 `PluginCallProxy` 前，先把 masked handle 解析成真实凭证，因此：
  - runtime 通用解析层不再默认直出明文；
  - 工具真实调用能力不受影响。
- `api/app/services/agent_runtime.py` 在进入 LLM 调用前，也会把 masked handle 解析成真实凭证，因此：
  - `llm_agent` 同样能保留执行能力；
  - 但不会在通用 runtime resolve 阶段就把 moderate-sensitive 凭证散成明文值。

### 3. 依赖注入保持同一套 credential/sensitive access 事实链

- `api/app/services/runtime.py` 继续把同一个 `CredentialStore` 注入 `ToolGateway` 与 `AgentRuntime`，避免两边各自 new 一套依赖，导致敏感访问治理语义漂移。

## 影响范围

- `api/app/services/credential_store.py`
- `api/app/services/tool_gateway.py`
- `api/app/services/agent_runtime.py`
- `api/app/services/runtime.py`
- `api/tests/test_credential_store.py`
- `api/tests/test_runtime_credential_integration.py`
- `docs/dev/user-preferences.md`
- `docs/dev/runtime-foundation.md`

## 验证

在 `api/` 目录执行：

```powershell
.\.venv\Scripts\uv.exe run pytest -q .\tests\test_credential_store.py .\tests\test_runtime_credential_integration.py
.\.venv\Scripts\uv.exe run ruff check .\app\services\credential_store.py .\app\services\tool_gateway.py .\app\services\agent_runtime.py .\app\services\runtime.py .\tests\test_credential_store.py .\tests\test_runtime_credential_integration.py
.\.venv\Scripts\uv.exe run pytest -q
git diff --check
```

结果：

- `pytest -q .\tests\test_credential_store.py .\tests\test_runtime_credential_integration.py`：通过，`43 passed`
- changed-files `ruff check`：通过，`All checks passed!`
- `pytest -q`：通过，`246 passed`
- `git diff --check`：通过
- 本轮未触发通知脚本，因为项目尚未进入“只剩人工逐项界面设计/验收”阶段

## 当前判断

- 7Flows 当前基础框架已经足够继续推进产品设计目标，不需要回到“先补底座再做功能”的阶段。
- 本轮补的是一个真实 P0 安全/治理缺口，而不是表面重构：现在 credential `allow_masked` 已经具备“先给 handle、最后一跳再解密”的最小可用语义。
- 当前仍未到“只剩人工逐项界面设计 / 验收”的阶段，因此不运行通知脚本。

## 下一步

1. **P0**：继续把统一敏感访问控制挂到 publish export 入口，并补通知 worker / inbox。
2. **P0**：继续补齐 `WAITING_CALLBACK` 后台唤醒闭环，避免 durable execution 仍停留在半闭环。
3. **P0**：继续把 graded execution 从 execution-aware 扩成真实隔离能力，补 `sandbox` / `microvm` adapter 与 compat plugin execution boundary。
4. **P1**：继续治理 `api/app/services/agent_runtime_llm_support.py`、`api/app/services/runtime_node_dispatch_support.py`、`web/components/run-diagnostics-execution-sections.tsx` 等剩余热点。
