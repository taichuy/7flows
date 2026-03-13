# 2026-03-13 Runtime Node Execution Support 解耦

## 背景

- 本轮先按仓库约定复核了 `AGENTS.md`、`docs/dev/user-preferences.md`、`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/dev/runtime-foundation.md` 与最近一次 Git 提交。
- 当前 `HEAD` 为 `be86d6e feat: split publish invocation drilldown card`，说明发布治理主线仍在继续，但后端 `api/app/services/runtime.py` 与 `api/tests/test_runtime_service.py` 仍是明显的结构热点。
- 结合用户长期偏好，后端代码文件原则上不应持续逼近或超过 1500 行；在不插队打断发布主线的前提下，需要沿稳定边界继续拆分 runtime 热点，避免后续推进 `streaming / SSE` 时再次把核心执行器拉回 God object。

## 目标

- 把 `RuntimeService` 中稳定的节点执行 helper 从 orchestration 主链路里抽离出来。
- 把超长的 `api/tests/test_runtime_service.py` 按职责拆分，降低后续补测和定位回归的摩擦。
- 不改变现有运行时语义，只做结构性解耦与测试文件整理。

## 本轮实现

- 新增 `api/app/services/runtime_node_execution_support.py`。
- 在 `RuntimeNodeExecutionSupportMixin` 中集中承接以下能力：
  - node run 准备与 join unmet / blocked / skipped 处理
  - retry 包装与 node execution dispatch
  - tool node / branch node 执行 helper
  - node input 构建、failure output、downstream edge 激活
- `api/app/services/runtime.py` 现在只保留 runtime orchestration 主链路，并通过：
  - `RuntimeNodeExecutionSupportMixin`
  - `RuntimeLifecycleSupportMixin`
  - `RuntimeGraphSupportMixin`
  共同支撑执行。
- 将 `api/tests/test_runtime_service.py` 中 `llm_agent / waiting / callback ticket / retry resume` 相关测试拆到新文件 `api/tests/test_runtime_service_agent_runtime.py`。

## 结果

- `api/app/services/runtime.py` 从 `1308` 行降到 `732` 行。
- `api/tests/test_runtime_service.py` 从 `1595` 行降到 `1042` 行。
- 新增 `api/tests/test_runtime_service_agent_runtime.py`，当前约 `562` 行。
- 这次拆分没有引入新的 runtime 协议层，也没有改变 `runs / node_runs / run_events` 作为事实来源的边界。

## 影响范围

- `api/app/services/runtime.py`
- `api/app/services/runtime_node_execution_support.py`
- `api/tests/test_runtime_service.py`
- `api/tests/test_runtime_service_agent_runtime.py`
- `docs/dev/runtime-foundation.md`
- `docs/dev/2026-03-13-runtime-node-execution-support-decoupling.md`

## 验证方式

- 在 `api/` 下优先复用现有 `.venv` + `uv` 执行：
  - `./.venv/Scripts/uv.exe run pytest tests/test_runtime_service.py tests/test_runtime_service_agent_runtime.py -q`
- 结果：`25 passed`。

## 结论

- 当前项目的基础框架已经足够支撑继续开发，但仍属于“骨架 + 主干能力 + 发布治理主线持续成型”的阶段，还没有进入“可交给人工逐项做界面设计”的完成态。
- 这轮拆分说明当前架构方向总体是对的：运行时、图结构、生命周期、节点执行已经可以继续按稳定边界拆开，而不是全部堆回一个大类。
- 现阶段仍然应该继续承接 `API 调用开放 / 发布治理` 主线，但需要在推进主业务的同时持续控制热点文件体量，避免结构债务反噬主线开发速度。

## 下一步

1. 继续承接 `API 调用开放` 主线：补 `streaming / SSE` 发布链路与协议流式事件映射。
2. 继续深化 publish governance：补 waiting / async lifecycle detail 与 publish invocation 到 run / callback ticket / cache 的可追踪链路。
3. 若 `streaming / SSE` 落地继续推高 publish 层复杂度，优先按协议 surface / mapper / audit 边界继续拆 `published_gateway.py`。
