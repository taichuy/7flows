# 2026-03-13 Runtime Lifecycle Support 解耦

## 背景

- `api/app/services/runtime.py` 已达到 `1595` 行，超过用户偏好的单文件体量阈值，也与 `docs/dev/runtime-foundation.md` 中“Durable Runtime 不应继续堆回单文件”的判断一致。
- 当前运行时主线仍要优先承接 `API 调用开放`，因此这轮不适合做高风险语义改造；更合适的是先抽离稳定 helper 边界，降低后续继续拆分 `runtime.py` 的摩擦。

## 目标

- 把 `waiting / callback ticket / scheduled resume / retry state / event payload` 相关 helper 从 `RuntimeService` 主类中抽离。
- 保持现有运行时行为不变，只做结构性解耦。
- 为后续继续拆 `runtime.py`、拆 `test_runtime_service.py` 预留更清晰边界。

## 本轮实现

- 新增 `api/app/services/runtime_lifecycle_support.py`。
- 在 `RuntimeLifecycleSupportMixin` 中集中承接以下 helper：
  - `run.callback.ticket.*` 相关 checkpoint 与事件构建
  - waiting 场景的 `scheduled_resume` 记录
  - retry state 读写与清理
  - tool result 序列化
  - `RunEvent` 持久化与 node/edge payload 构建
- `RuntimeService` 改为组合 `RuntimeLifecycleSupportMixin + RuntimeGraphSupportMixin`，保留 orchestration 主链路在 `runtime.py`。

## 影响范围

- `api/app/services/runtime.py`
- `api/app/services/runtime_lifecycle_support.py`
- `docs/dev/runtime-foundation.md`
- `docs/dev/user-preferences.md`

## 验证方式

- 在 `api/` 下使用现有 `.venv` + `uv` 运行：
  - `./.venv/Scripts/uv.exe run pytest tests/test_runtime_service.py -q`

## 结论

- 这轮没有改变 runtime 语义，但把一段稳定的生命周期 helper 从主执行器剥离出来，降低了 `RuntimeService` 的聚合度。
- `runtime.py` 仍然是当前后端最需要继续治理的结构热点，但已从“等待/重试/事件/payload 全都混在一个类里”前进一步。

## 下一步

1. 继续承接 `API 调用开放` 主线，补 `streaming / SSE` 与 waiting lifecycle drilldown。
2. 继续拆 `api/app/services/runtime.py` 的 orchestration 主体，并同步拆 `api/tests/test_runtime_service.py`。
3. 把 diagnostics 的 `phase / evidence / artifact` 聚合事实继续统一回接 editor / overlay。
