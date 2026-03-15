# 2026-03-15 Run Trace 路由拆层与项目现状复核

## 背景

- 用户要求先阅读 `AGENTS.md`、`docs/dev/user-preferences.md`、`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/dev/runtime-foundation.md`，结合最近一次 Git 提交判断项目现状、基础框架成熟度和下一步优先级。
- 最新一次 Git 提交是 `74391ba feat: surface published sensitive access blocked states`：这次提交已把 published invocation detail / cache inventory 命中敏感访问控制时的阻塞态如实暴露到前端，不再把 `403/409` 误渲染成“没有数据”。
- 复核后确认：该提交本身不需要立即补漏洞式衔接，但它进一步坐实了统一敏感访问控制主线仍在持续推进；同时 `api/app/api/routes/runs.py` 仍集中 trace 查询、cursor、export 序列化和普通 run route，已经成为后续继续补 trace/export 治理时的结构热点。

## 现状判断

### 1. 上一次提交做了什么，是否需要衔接

- `74391ba` 主要完成 publish 治理面板对敏感访问阻塞态的最小 UI 可见性补齐，属于对已落地后端能力的前端衔接，不是半截子提交。
- 从产品主线看，这次提交与 `docs/dev/runtime-foundation.md` 中的 P0「继续扩统一敏感访问控制闭环」一致，说明项目当前优先级没有漂移。
- 从工程衔接看，下一步仍然应该继续敏感访问、执行隔离和 waiting/resume 三条主线；但不一定必须继续只改 publish UI。本轮更合适的落点，是先处理会阻碍后续 trace/export 治理扩展的 `runs.py` 热点。

### 2. 基础框架是否足够继续推进

- 当前后端已经具备 workflow version、compiled blueprint、runtime orchestration、run/node_run/run_event 事实层、published surface、sensitive access 基础治理和 callback ticket 等骨架，不再是只有初始化结构的空壳。
- 当前前端已经具备 workflow editor、publish draft、run diagnostics、publish governance 等入口，也不是只停留在静态工作台。
- 结论是：基础框架已经足够支撑持续的功能性开发、插件兼容建设、调试可追溯能力和治理能力演进；当前不足主要是若干 P0 主链尚未补成完整闭环，而不是“框架还没设计好”。

### 3. 当前主要风险点

- **可靠性 / 稳定性**：`WAITING_CALLBACK` 仍缺完整后台唤醒闭环，真实 durable resume 还需继续补齐。
- **安全性**：统一敏感访问控制已接到 credential / context / tool / run trace export / published detail，但 publish export、通知 worker / inbox、credential `allow_masked` 语义仍未完全收口。
- **扩展性**：基础架构方向正确，但个别热点文件仍会抬高继续演进的成本，`runs.py` 是其中一个典型例子。

## 目标

1. 把 `api/app/api/routes/runs.py` 中 trace/filter/cursor/export 序列化职责移出路由层。
2. 保持 `/api/runs/{run_id}/trace` 与 `/api/runs/{run_id}/trace/export` 的现有 HTTP 行为不变。
3. 给后续继续补 trace export 治理、run diagnostics 和 presenter/helper 分层预留更清晰的 service 边界。

## 实现

### 1. 新增 `api/app/services/run_trace_views.py`

- 新增 `load_run_trace()`，统一承接：
  - run 存在性校验
  - cursor 解析
  - 时间过滤归一化
  - payload key 过滤
  - run event 查询与 `RunTrace` 组装
- 新增 `build_trace_export_filename()` 与 `serialize_trace_export_jsonl()`，把 export 细节从 API route 中抽出。
- trace 相关 helper（payload key 收集、cursor encode/decode、summary 组装、trace event 序列化）统一下沉到该 service，避免继续和 HTTP contract 混写。

### 2. 收口 `api/app/api/routes/runs.py`

- `runs.py` 从约 664 行降到约 211 行。
- 路由层现在主要保留：
  - run create/get/resume/callback/events 的 HTTP contract
  - trace / trace export 的参数接收与响应封装
  - trace export 的敏感访问阻塞响应
- 路由层不再承担 trace 过滤算法、cursor 编解码和 JSONL 序列化细节，更符合“route 保持薄”的当前后端边界。

## 影响范围

- `api/app/api/routes/runs.py`
- `api/app/services/run_trace_views.py`
- `docs/dev/runtime-foundation.md`

## 验证

在 `api/` 目录执行：

```powershell
.\.venv\Scripts\uv.exe run pytest -q .\tests\test_run_routes.py
.\.venv\Scripts\uv.exe run ruff check .\app\api\routes\runs.py .\app\services\run_trace_views.py
.\.venv\Scripts\uv.exe run pytest -q
```

结果：

- `pytest -q .\tests\test_run_routes.py`：通过，`20 passed`
- `ruff check`：通过
- `pytest -q`：通过，`243 passed`

## 当前结论

- 上一次提交 `74391ba` 不需要紧急补救式衔接，但它所在的敏感访问治理主线仍然需要继续推进。
- 当前项目基础框架已经满足继续做功能性开发、插件扩展、兼容性建设、可靠性治理和安全能力演进的前提。
- 真正限制当前推进速度的，不再是“有没有框架”，而是 P0 闭环尚未收齐，以及少数热点文件需要持续拆层。
- 本轮完成 `runs.py` 拆层后，run trace / export 路由已经不再是后续扩展的主要阻塞点；但 `agent_runtime_llm_support.py`、`published_protocol_streaming.py`、`run-diagnostics-execution-sections.tsx` 等热点仍需继续治理。
- 项目还没有进入“只剩人工逐项界面设计”的阶段，因此本轮不触发通知脚本。

## 下一步

1. **P0**：继续扩统一敏感访问控制闭环，优先补 publish export 挂点、通知 worker / inbox 与 credential `allow_masked` 真实语义。
2. **P0**：继续把 graded execution 扩成真实隔离能力，补 sandbox / microvm tool adapter 与 compat plugin execution boundary。
3. **P0**：补齐 `WAITING_CALLBACK` 的后台唤醒闭环，形成更完整的 durable execution 主链。
4. **P1**：继续治理 `agent_runtime_llm_support.py`、`published_protocol_streaming.py` 与前端 diagnostics 热点，避免后续功能再次回流到单文件。
