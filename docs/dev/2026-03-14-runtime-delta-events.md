# 2026-03-14 Runtime Delta Events & Streaming Fact Source Unification

## 背景

上一轮提交 `b0a7711 feat: replay protocol streams from run events` 让 OpenAI / Anthropic / native 三条 publish surface 的 sync streaming 开始从 `run_events` 提取流式文本。但当时的 streaming 仍然是 replay-style：publish 层基于最终输出做切块合成 `run.output.delta`，runtime 本身并不产出 delta 事件。

这意味着 delta 只存在于 SSE 传输层，不在运行态事件流中留痕，也无法被后续回放或审计消费。

## 目标

在 runtime 中补真实 `node.output.delta` 和 `run.output.delta` 事件，让 delta 成为持久化运行事实的一部分，并让 publish streaming 优先消费这些真实 delta。

## 决策与实现

### 1. Runtime 产出 delta 事件

`api/app/services/runtime.py` 现在在每个节点成功输出时：
- 在 `node.output.completed` 之前，如果节点输出包含可提取文本，写入 `node.output.delta` 事件
- 在 `run.completed` 之前，如果 run 最终输出包含可提取文本，写入 `run.output.delta` 事件

文本提取复用现有 `extract_text_output`，保持统一的 preferred key 策略。

### 2. Protocol streaming 三级降级策略

`_extract_protocol_text_from_run_events` 更新为：
1. 优先使用 `run.output.delta` 的 delta 文本
2. 回退到 `node.output.delta` 的 delta 文本
3. 最后回退到 `node.output.completed` / `run.completed` 的 output payload

这避免了同时拼接 node 和 run delta 导致文本翻倍。

### 3. Native stream 避免重复 delta

`build_native_run_stream` 在检测到 run events 中存在真实 `node.output.delta` / `run.output.delta` 时，跳过合成切块，避免同一文本输出两次。

### 4. 预存问题修复

- `test_get_run_trace_supports_machine_filters`：event payload 使用 `type`，测试错误断言 `node_type`
- `template-list-panel.tsx`：`WorkspaceStarterBulkAction` 类型导入源错误

## 影响范围

- `api/app/services/runtime.py`：新增 delta 事件发射（+23 行）
- `api/app/services/published_protocol_streaming.py`：delta 降级策略、native stream 去重（+21 行）
- `api/tests/test_runtime_service.py`：更新事件序列断言
- `api/tests/test_published_protocol_streaming.py`：新增 2 个 delta 消费测试
- `api/tests/test_run_routes.py`：修正 payload key 断言
- `web/components/workspace-starter-library/template-list-panel.tsx`：修正类型导入

## 验证

```bash
cd api && ./.venv/Scripts/uv.exe run pytest tests/ -q
# 150 passed
cd web && npx tsc --noEmit
# 0 errors
```

## 未决问题

- delta 事件当前仍是在节点最终输出确定后一次性写入，而非 token 级实时推送
- 未来 `llm_agent` 接入 LLM streaming callback 后，可产出多条细粒度 `node.output.delta`
- OpenAI / Anthropic / native streaming 仍然是 replay-style SSE，但事实来源已统一到 runtime 事件流
