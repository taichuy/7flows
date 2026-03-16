# 2026-03-16 架构承载度与优先级刷新

## 背景

- 用户要求重新阅读 `AGENTS.md`、`docs/dev/user-preferences.md`、`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/open-source-commercial-strategy.md` 与 `docs/dev/runtime-foundation.md`，结合当前代码判断：基础框架是否已经写好、是否足以支撑持续功能开发、插件扩展性、兼容性、可靠性、稳定性、安全性，以及哪些文件已经进入应持续解耦的热点区。
- 本轮目标不是新增一批功能，而是基于当前事实再次校准“项目是否还能继续沿主线推进闭环”，并把优先级收敛成新的可追溯记录。

## 复核范围

- 文档基线：`AGENTS.md`、`docs/dev/user-preferences.md`、`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/open-source-commercial-strategy.md`、`docs/dev/runtime-foundation.md`
- 后端抽查：`api/app/services/runtime.py`、`api/app/services/agent_runtime.py`、`api/app/services/runtime_node_dispatch_support.py`、`api/app/services/workspace_starter_templates.py`、`api/app/services/run_trace_views.py`、`api/app/services/tool_gateway.py`、`api/app/services/published_gateway.py`、`api/app/services/plugin_runtime_proxy.py`、`api/app/services/sensitive_access_control.py`、`api/app/api/routes/workflows.py`、`api/app/api/routes/published_endpoint_activity.py`、`api/app/api/routes/sensitive_access.py`
- 前端抽查：`web/app/page.tsx`、`web/components/workflow-editor-workbench.tsx`、`web/components/run-diagnostics-execution-sections.tsx`、`web/components/sensitive-access-inbox-panel.tsx`、`web/lib/workflow-editor/use-workflow-editor-graph.ts`、`web/lib/workflow-editor/use-workflow-editor-workflow-state.ts`、`web/lib/workflow-editor/use-workflow-editor-node-actions.ts`
- 结构热点统计：按 `api/app/**/*.py` 与 `web/**/*.ts(x)` 重新统计源码行数，并排除 `.venv`、`node_modules`、`.next` 等依赖/构建产物干扰

## 验证

- `cd api; .\.venv\Scripts\uv.exe run pytest -q`
  - 结果：`300 passed in 32.94s`
- `cd web; pnpm exec tsc --noEmit`
  - 结果：通过
- `cd web; pnpm lint`
  - 结果：通过；仅出现 Next.js 关于 `next lint` 将废弃的上游提示，无实际 lint 错误

## 结论

### 1. 基础框架已经写好，当前不需要回头重搭主骨架

- 后端主链已经稳定存在：`workflow definition/version -> compiled blueprint -> runtime -> run/node_run/run_events -> published surface -> diagnostics`。
- `RuntimeService` 已退回 facade 角色，核心执行依赖 mixin 与独立 service 承担；这说明运行时虽然仍在演进，但并不是由单个超级文件硬扛所有职责。
- 前端也已经不是单纯静态工作台：首页、workflow editor、publish panel、workspace starter、sensitive access inbox、run diagnostics 都接到了真实 API，足以支撑继续做功能闭环。

### 2. 当前架构已经满足继续做功能、扩插件、保兼容、提稳定的门槛

- 内部事实仍由 `7Flows IR`、`runs / node_runs / run_events`、published surfaces 和 sensitive access 主链驱动，没有看到 Dify / OpenAI / Anthropic 协议反向主导内部模型的迹象。
- 插件兼容、发布网关、运行追溯、安全治理都已经按边界拆成 service / route / presenter / helper 层，不是把所有事情重新塞回 runtime。
- 安全治理已从“文档要求”进入真实主链：credential、context、tool、trace export、published detail access 都能经过统一 sensitive access 事实层。
- 当前真正的风险不是骨架不成立，而是少数热点 service / hook 如果继续堆功能，后续会拖慢 waiting、governance、editor 和 diagnostics 的闭环速度。

### 3. 三层业务闭环都可以继续推进，但还没到只剩人工界面设计的阶段

- 用户层：已经具备工作台、工作流编辑、发布、starter、审批 inbox 的最小操作面。
- AI 与人协作层：已经具备 run detail、trace export、approval timeline、callback waiting lifecycle 等共享事实入口。
- AI 治理层：已经把 credential / context / tool / published detail access control 收进统一敏感访问治理主链。
- 当前缺口主要是 operator explanation、waiting callback 自动唤醒后的运维体验、publish/editor 的字段级交互与更完整的治理说明，因此本轮不触发“已经完善到需要人工逐项界面设计”的通知脚本。

## 当前热点文件

### 后端热点

- `api/app/services/workspace_starter_templates.py`：约 `575` 行
- `api/app/services/runtime_node_dispatch_support.py`：约 `573` 行
- `api/app/services/agent_runtime.py`：约 `523` 行
- `api/app/services/workflow_library_catalog.py`：约 `484` 行
- `api/app/services/runtime_run_support.py`：约 `450` 行
- `api/app/services/sensitive_access_control.py`：约 `426` 行
- `api/app/services/run_trace_views.py`：约 `405` 行

### 前端热点

- `workflow-editor` 相关复杂度仍主要聚集在 graph/workflow-state/node-actions hook 组合，而不是单个页面壳层。
- `run diagnostics` 与 `sensitive access inbox` 方向已经完成一轮组件拆层，但 publish/editor 相关数据聚合与字段级状态管理仍要持续警惕回流。
- 当前前端热点的风险更多是“继续加功能时容易重新聚回 hook / presenter / data aggregation”，而不是“组件已经彻底失控必须推倒重写”。

## 优先级建议

1. **P0：继续补齐高风险 execution capability 的真实 fail-closed 语义**
   - 当前 execution-aware contract、trace 和 capability guard 已足以支撑继续开发，但高风险 tool/plugin 还没有全面兑现为真正的 capability-driven 隔离执行。
2. **P0：继续收口 `WAITING_CALLBACK` 自动唤醒与 operator 续跑闭环**
   - 这是当前最直接影响真实流程完成度、恢复能力和运维体验的短板。
3. **P0：继续补统一 sensitive access 主链的 explanation 与 cross-entry diagnostics**
   - 让 inbox、run detail、publish detail、trace export 的 operator 叙事真正一致。
4. **P1：持续拆解 runtime / starter / editor / diagnostics 热点**
   - 优先盯住 `runtime_node_dispatch_support.py`、`agent_runtime.py`、`workspace_starter_templates.py` 以及 editor graph/state hook，避免复杂度继续回流。
5. **P1：继续提高 workflow editor 与 publish governance 的完整度**
   - 保持“前端可配置、后端诚实阻断、运行追溯统一落库”的方向，不横向摊更多新页面。
6. **P2：在主链更稳后，再继续推进 Skill Catalog 与 Team/Enterprise 领域模型**
   - 这两条方向都已具备设计基线，但当前不应抢占 runtime、waiting、治理与 editor 的主优先级。

## 对后续开发的含义

- 当前项目已经具备持续推进完整度和业务闭环的基础，不需要以“基础框架是否已成型”为由暂停主线开发。
- 架构方向总体满足功能性开发、插件扩展性、兼容性、可靠性、稳定性与安全性继续演进的要求。
- 现阶段最值得做的不是重造框架，而是沿既有 runtime / publish / diagnostics / governance / editor 主线继续补闭环，并持续拆热点，防止复杂度反弹。
