# 2026-03-14 Runtime Execution Progress Split

## 背景

- 2026-03-14 前两轮已先后把 `runtime.py` 中的 run load / resume / callback orchestration 与 graph support 拆出，但 `RuntimeService._continue_execution()` 仍同时承担节点失败处理、waiting 落盘、成功收尾、run output finalization 等多类职责。
- `docs/dev/runtime-foundation.md` 已将这条链路列为 P0 热点，说明最近一次 `refactor: split runtime graph support` 提交之后仍需要继续衔接，而不是停在 graph support 拆分阶段。

## 目标

- 继续降低 `api/app/services/runtime.py` 的职责密度，让主文件更接近“执行主链 orchestration”。
- 把节点执行后的失败 / waiting / 成功收尾，以及 run 完成输出构建，收口到独立 support 层。
- 保持现有运行时行为、事件语义与测试结果不变，为下一轮继续治理 `runtime_node_execution_support.py` 留出边界。

## 实现

- 新增 `api/app/services/runtime_execution_progress_support.py`。
- 在新 mixin 中拆出四类职责：
  - `_handle_failed_node_execution()`：失败事件、失败输出、失败分支激活与 checkpoint 更新。
  - `_handle_suspended_node_execution()`：waiting 状态落盘、callback ticket / resume 调度与 `run.waiting` 事件。
  - `_handle_succeeded_node_execution()`：节点输出落盘、delta / completed 事件与下游激活。
  - `_finalize_completed_run()`：run 输出解析、`run.output.delta` / `run.completed` 事件与最终状态收尾。
- `api/app/services/runtime.py` 现通过 `RuntimeExecutionProgressSupportMixin` 调用这些 helper，`_continue_execution()` 保留节点遍历、输入准备、调用执行和主链分支控制。

## 影响范围

- `api/app/services/runtime.py`
- `api/app/services/runtime_execution_progress_support.py`
- `docs/dev/runtime-foundation.md`

## 验证

- 运行：`api/.venv/Scripts/python.exe -m pytest api/tests/test_runtime_service.py api/tests/test_runtime_service_agent_runtime.py`
- 结果：25 个测试全部通过。

## 当前判断

- 最近一次 git 提交 `81d8d19 refactor: split runtime graph support` 已被本轮有效衔接；当前 runtime 主链继续沿既定方向收口，没有出现 graph support 拆完后重新把 waiting / output finalization 回流到主文件的问题。
- 基础框架仍然足以继续推进主业务完整度，且当前拆分方向符合“7Flows IR 优先、统一事件流、运行事实可追溯”的产品目标。

## 下一步

1. 优先继续治理 `api/app/services/runtime_node_execution_support.py`，把节点准备、重试循环、节点类型执行和事件拼装继续拆层。
2. 继续治理 `web/components/run-diagnostics-panel.tsx`，让诊断面板结构对齐后端事实接口。
3. 继续补齐节点配置完整度，避免关键配置长期滞留在大表单和平铺结构中。
