# 2026-03-15 Sensitive Context Read Approval

## 背景

- 上一轮 Git 提交 `7522ebe feat: add workflow editor variables form` 主要补的是 workflow editor 的 `definition.variables` 结构化编辑能力，属于工作流编辑器完整度补强。
- 当前项目并未进入“只剩界面润色”的阶段；按 `docs/dev/runtime-foundation.md` 的优先级，P0 仍应继续推进统一敏感访问控制闭环，而不是只沿前端 editor 继续扩表单。
- 在本轮开始前，敏感访问控制已经接入 `credential://...` 解析路径，但 `mcp_query / authorized_context` 的 context read 仍未真正经过 `SensitiveAccessRequest -> ApprovalTicket -> waiting/resume` 主链，和产品/技术基线存在偏差。

## 目标

- 把统一敏感访问控制从 credential path 继续扩到 context read 主链。
- 保持 runtime 仍由 `RuntimeService` 单一主控，不为 context read 再造第二套审批/恢复状态机。
- 为 `allow_masked` 和 `require_approval -> resume` 补真实测试，验证这条链路可持续扩到 ToolGateway / publish export。

## 本轮实现

### 1. 为 runtime 统一共享 `SensitiveAccessControlService`

- `RuntimeService` 现在会与 `CredentialStore` 共享同一个 `SensitiveAccessControlService` 实例。
- 这样 credential gating、context read gating 和审批后的 resume dispatch 都继续走同一套事实层与 scheduler，而不是出现多个彼此独立的 access service 实例。

### 2. 新增 `workflow_context` 资源源类型与匹配逻辑

- 在敏感资源 schema 中新增 `workflow_context` source，用于表达“某个 workflow 某个 node 的某类 artifact 输出属于受控资源”。
- `SensitiveAccessControlService` 新增 `find_workflow_context_resource(...)`，按 `workflow_id + source_node_id + artifact_type` 优先匹配资源；若未配置 workflow 级作用域，则允许回退到全局匹配。

### 3. 把 `mcp_query / authorized_context` 接到敏感访问控制主链

- `RuntimeNodeDispatchSupportMixin` 新增 context read guard：
  - 命中受控 `workflow_context` 资源时，先创建/复用 `SensitiveAccessRequest`
  - 若决策是 `require_approval`，节点进入 `waiting_tool`，复用既有 checkpoint / resume 主链
  - 若决策是 `deny`，直接阻断当前访问
  - 若决策是 `allow_masked`，返回结构化 masked payload，而不是把原始 context 继续透给下游
- `node.context.read` 事件现在额外记录 `sensitive_result_count` 和 `masked_result_count`，为后续 diagnostics / approval timeline 提供更清晰的事实摘要。

### 4. 保留当前实现边界

- 本轮只把统一敏感访问控制接到 context read；ToolGateway 与 publish export 仍未接入。
- credential path 里的 `allow_masked` 仍未实现真正的 masked value / handle 语义，这仍是下一轮要补的治理缺口。

## 影响范围

- `api/app/services/runtime.py`
- `api/app/services/credential_store.py`
- `api/app/services/sensitive_access_control.py`
- `api/app/services/runtime_node_dispatch_support.py`
- `api/app/services/runtime_graph_support.py`
- `api/app/schemas/sensitive_access.py`
- `api/tests/test_runtime_credential_integration.py`
- `docs/dev/runtime-foundation.md`

## 验证

- `api/.venv/Scripts/uv.exe run pytest -q tests/test_runtime_credential_integration.py`
  - `12 passed`
- `api/.venv/Scripts/uv.exe run ruff check app/services/credential_store.py app/services/runtime.py app/services/sensitive_access_control.py app/services/runtime_node_dispatch_support.py app/services/runtime_graph_support.py app/schemas/sensitive_access.py tests/test_runtime_credential_integration.py`
  - `All checks passed`
- `api/.venv/Scripts/uv.exe run pytest -q`
  - `235 passed`

## 当前判断

- 基础框架已经足够继续支撑功能性开发，尤其是 runtime / trace / waiting-resume / publish surface 主干没有缺失到无法推进的程度。
- 架构方向总体仍与产品设计一致：内部继续以 `7Flows IR + RuntimeService + run_events` 为事实中心，没有因为敏感访问控制扩展而引入第二条执行链。
- 但统一治理能力还没真正闭环到所有入口；ToolGateway、publish export、通知 worker / inbox 仍是下一阶段的关键缺口。

## 下一步

1. 把同一套敏感访问控制继续挂到 ToolGateway，避免 tool invoke 与 context read 再次分叉。
2. 把 publish export / published surface 的高敏导出接到同一套 access request 与 approval 事实层。
3. 继续治理 `runtime_node_dispatch_support.py` 与 `sensitive_access_control.py` 的热点，优先拆 helper，而不是让它们演进成新单体。
