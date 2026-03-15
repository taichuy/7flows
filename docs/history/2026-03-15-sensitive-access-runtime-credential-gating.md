# 2026-03-15 敏感访问控制接入 runtime credential resolve 与 waiting/resume 主链

## 背景

- 用户要求先复核 `AGENTS.md`、产品/技术基线、`runtime-foundation` 和最近提交，再判断当前项目是否需要衔接上一次提交继续推进。
- 上一次提交 `dca2a0b feat: add sensitive access control foundation` 已经把敏感资源、访问请求、审批票据和通知投递落成独立事实层与 API，但 `docs/dev/runtime-foundation.md` 同时明确指出：真正的 P0 缺口还在 runtime 主链，尤其是 `credential resolve`、审批后 `waiting/resume` 衔接，以及运行中真实拦截点。
- 结合当前代码现状继续评估后，最值得优先衔接的并不是再做一轮局部 schema 拆分，而是把“已有安全事实层”真正挂到运行中的 credential 使用路径，否则上一轮提交仍然停留在“管理 API 已落地、runtime 仍不消费”的半闭环状态。

## 目标

1. 让 runtime 在解析 `credential://...` 时真正接入敏感访问控制，而不是只靠独立管理 API。
2. 让审批通过/拒绝不只改变票据状态，而是能触发既有 `waiting/resume` 主链继续推进。
3. 顺手补齐 `tool` 节点对 normalized `waiting` 工具结果的处理缺口，避免 direct tool node 和 llm_agent tool call 的 waiting 语义继续不一致。

## 实现

### 1. 敏感访问控制服务增加复用与 resume 调度能力

- `api/app/services/sensitive_access_control.py`
  - 新增 `SensitiveAccessControlService.__init__()`，接入 `RunResumeScheduler`。
  - 新增 `find_credential_resource()`：按 `source=credential + metadata.credential_id` 查找与 credential 绑定的敏感资源。
  - 新增 `ensure_access()`：在同一 `run_id + node_run_id + requester + resource + action` 范围内优先复用已有访问请求/审批票据，避免 resume 后重复造单。
  - `decide_ticket()` 现在会在票据 `approved / rejected` 后调度一次 `run resume`，把审批结果真正送回 runtime 主链。

### 2. CredentialStore 增加 runtime 侧敏感凭证解析

- `api/app/services/credential_store.py`
  - 新增 `CredentialAccessPendingError`，用于把“需要审批但暂未完成”的状态以 domain signal 传回 runtime，而不是直接当普通错误处理。
  - 新增 `resolve_runtime_credential_refs()`：
    - 先识别并批量检查所有 `credential://...` 引用；
    - 若命中敏感资源，则通过 `SensitiveAccessControlService.ensure_access()` 获取当前有效决策；
    - `require_approval` 时抛出 `CredentialAccessPendingError`；
    - `deny` 时抛出明确的 credential access error；
    - `allow / allow_masked` 时才真正解密并返回凭证内容。

### 3. Runtime 把敏感凭证等待态收进统一执行主链

- `api/app/services/runtime.py`
  - `RuntimeService` 新增可注入 `credential_store`，便于测试和后续 service 组合，也避免把 credential + sensitive access 绑死在不可替换的默认构造器里。
- `api/app/services/runtime_node_dispatch_support.py`
  - `llm_agent` 在解析 model/config credentials 时，若命中 `CredentialAccessPendingError`，现在会返回 `NodeExecutionResult(suspended=True)`，并写入 `sensitive_access.requested` 事件与 checkpoint 摘要。
  - `tool` 节点在解析 `config.tool.credentials` 时也接入同样逻辑。
  - direct `tool` 节点现在补齐了对 normalized `ToolExecutionResult(status="waiting")` 的处理：
    - 会进入 `waiting_tool / waiting_callback`；
    - 会保留 waiting reason；
    - 会把 `resume_after_seconds` 交给现有 scheduler；
    - 不再把 waiting tool result 当成普通成功输出继续往下跑。

## 影响范围

- 安全闭环：敏感访问控制第一次真正接入 runtime credential resolve。
- durable runtime：审批通过/拒绝后，已能通过既有 `RunResumeScheduler` 回到 `waiting/resume` 主链。
- 行为一致性：`llm_agent` 与 direct `tool` node 在“凭证审批等待 / 工具 waiting”场景下的执行语义更加统一。
- 架构边界：继续沿单一 runtime orchestration owner 演进，没有新增第二套流程控制语义。

## 验证

在 `api/` 目录执行：

```powershell
.\.venv\Scripts\uv.exe run ruff check app/services/sensitive_access_control.py app/services/credential_store.py app/services/runtime.py app/services/runtime_node_dispatch_support.py tests/test_runtime_credential_integration.py
.\.venv\Scripts\uv.exe run pytest -q tests/test_runtime_credential_integration.py
.\.venv\Scripts\uv.exe run pytest -q
```

结果：

- changed-files `ruff check`：通过
- `pytest -q tests/test_runtime_credential_integration.py`：通过，`10 passed`
- 后端全量 `pytest -q`：通过，`233 passed`

补充：

- `git diff --check` 仅提示若干文件在下一次 Git 触碰时会统一为 CRLF；这是当前工作区换行风格提示，不是内容性 diff 错误。

## 结论与下一步

- 结论：上一次提交**需要衔接**，而且最优衔接方式就是把敏感访问控制从“管理 API foundation”推进到“runtime 真正消费”。本轮已经完成 `credential resolve + approval decision resume` 这一段最小闭环。
- 下一步仍按优先级推进：
  1. 把同一套敏感访问控制继续挂到 `context read`、`publish export` 和 `ToolGateway` 的更细粒度入口。
  2. 继续把审批/通知的事实层延展到真实 inbox / webhook worker，而不是只停留在 `in_app delivered` 记录。
  3. 继续治理 `agent_runtime_llm_support.py`、`runs.py`、`published_protocol_streaming.py` 等长文件热点，避免安全与调试能力回流成单体。
