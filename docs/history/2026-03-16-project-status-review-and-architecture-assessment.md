# 2026-03-16 项目现状复核（衔接最近提交与架构评估）

## 背景

- 用户要求重新阅读仓库协作规则、用户偏好、产品/技术/策略基线、当前运行时索引和最近正式开发留痕，判断项目当前是否需要回头重搭基础框架，还是应继续沿既有主线推进。
- 本轮还需要回答：最近一次提交做了什么、是否需要衔接、现有架构是否支撑功能性开发 / 插件扩展 / 兼容性 / 可靠性 / 稳定性 / 安全性，以及哪些业务代码文件已经成为下一轮优先解耦热点。

## 本轮复核输入

- 规则与偏好：`AGENTS.md`、`docs/dev/user-preferences.md`
- 设计基线：`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/open-source-commercial-strategy.md`
- 当前事实：`docs/dev/runtime-foundation.md`、`README.md`
- 最近提交：
  - `5fe1652 docs: record status review after workspace starter split`
  - `94ad5ed refactor: split workspace starter library state`
  - 更早的连续主线提交：`8128aff`、`14e914d`、`58916ad`、`ac379a8`、`95d8be3`
- 代码结构抽样：`api/app/services/*`、`web/components/*`、`web/lib/*`

## 最近一次提交与衔接判断

### 1. 最近一次提交做了什么

- 最近一次 Git 提交是 `5fe1652 docs: record status review after workspace starter split`。
- 该提交只更新了：
  - `docs/dev/runtime-foundation.md`
  - `docs/history/2026-03-16-project-status-review-after-workspace-starter-state-split.md`
- 它的作用是把上一轮 `94ad5ed refactor: split workspace starter library state` 的结构治理结论沉淀为正式留痕，而不是引入新的产品方向或执行语义。

### 2. 是否需要衔接

- 需要，而且应继续顺着当前主线推进。
- 最近几次提交呈现的是连续一致的工程治理节奏：
  - 后端持续把 runtime / diagnostics / published surface / compat 的大 service 拆成 facade + helper。
  - 前端持续把 workflow editor / workspace starter / publish detail 的厚壳组件拆成 state hook、action helper 和 section component。
  - 文档持续把“当前事实 + 本轮留痕 + 优先级”收敛到 `runtime-foundation` 与 `docs/history/`。
- 因此当前没有任何证据表明需要回头重搭基础框架；真正需要衔接的是继续把闭环与解耦做深。

## 基础框架与架构评估

### 1. 基础框架是否已经写好

- 结论：已经写到足以承接持续功能开发的程度。
- 当前项目已经不再是“只有底座的空壳”：
  - runtime 主链已具备 `workflow_version / compiled_blueprint / runs / node_runs / run_events / artifacts / waiting / resume / callback ticket`
  - published surface 已具备 native / OpenAI / Anthropic 协议映射、API key、审计与最小流式能力
  - editor 主链已具备 workflow definition、runtime policy、variables、publish draft、validation navigator 和 capability guard
  - sensitive access 已具备 request / approval ticket / notification dispatch / operator inbox / bulk governance

### 2. 功能性开发

- 满足持续推进条件。
- 当前阶段的限制主要在“闭环还不够完整”，不是“缺少主骨架”。
- 后续最值得优先补齐的是 waiting/resume/callback 与 publish diagnostics 两条端到端链路。

### 3. 插件扩展性与兼容性

- 架构方向正确，满足继续推进门槛。
- 当前仍坚持 `7Flows IR` 优先、compat adapter 在边缘映射、runtime 保持唯一 orchestration 主控，这与产品设计和技术补充文档一致。
- 兼容性风险主要在 lifecycle / catalog hydration / execution planning 热点继续膨胀，而不是模型方向错误。

### 4. 可靠性、稳定性与安全性

- 当前主链已经具备真实验证基础：
  - `api/.venv/Scripts/uv.exe run pytest -q` → `300 passed`
  - `web/pnpm exec tsc --noEmit` → 通过
- 安全治理主线方向正确：敏感访问分级、审批票据、通知通道、operator inbox、批量治理与 published/run detail diagnostics 都已进入事实层。
- 当前最大风险不是“没有安全架构”，而是治理解释、审批恢复、通知失败和 callback 终止策略仍需继续补齐到更可操作的 operator 体验。

## 代码热点与解耦判断

### 1. 后端热点

以下文件已经进入“继续可开发，但若不继续拆会拖慢后续迭代”的区间：

- `api/app/services/workspace_starter_templates.py`（约 575 行）
- `api/app/services/runtime_node_dispatch_support.py`（约 573 行）
- `api/app/services/agent_runtime.py`（约 523 行）
- `api/app/services/workflow_library_catalog.py`（约 484 行）
- `api/app/services/runtime_run_support.py`（约 450 行）
- `api/app/services/sensitive_access_control.py`（约 426 行）
- `api/app/services/notification_delivery.py`（约 420 行）
- `api/app/services/run_callback_ticket_cleanup.py`（约 415 行）
- `api/app/services/run_trace_views.py`（约 405 行）

### 2. 前端热点

- `web/lib/get-workflow-publish.ts`（约 457 行）
- `web/lib/workflow-tool-execution-validation.ts`（约 399 行）
- `web/components/workflow-editor-variable-form.tsx`（约 378 行）
- `web/components/workspace-starter-library/use-workspace-starter-library-state.ts`（约 364 行）
- `web/components/workflow-node-config-form/tool-node-config-form.tsx`（约 339 行）
- `web/components/sensitive-access-inbox-panel.tsx`（约 339 行）
- `web/components/workflow-node-config-form/runtime-policy-form.tsx`（约 304 行）

### 3. 判断原则

- 当前不宜仅按“超过多少行就一定要拆”来机械处理。
- 更重要的是判断该文件是否同时承接了：
  - orchestration
  - validation
  - source hydration
  - provider-specific 分支
  - bulk governance / side effect
- 只要一个文件开始同时承接这些职责，就应优先继续拆 helper / section / state hook，避免复杂度反向回流。

## 业务闭环判断

### 1. 用户层

- 已有 workflow 编辑、发布、运行诊断、workspace starter 和敏感访问治理等核心入口。
- 当前仍需继续补“失败解释、等待原因、恢复入口、发布治理摘要”的一体化可见性。

### 2. AI 与人协作层

- 已有 `llm_agent`、waiting/resume、callback ticket、approval、timeline / evidence 等基础能力。
- 当前还差把“AI 等待 -> 人类审批 / 外部回调 -> 系统恢复执行 -> 详情层解释”真正串成端到端闭环。

### 3. AI 治理层

- 已有敏感访问、审批、通知、审计与 operator 入口事实层。
- 当前还应继续把 policy explanation、notification health、published invocation 安全摘要、run detail drilldown 做到跨入口一致。

## 优先级刷新

1. **P0：打通 waiting / resume / callback ticket 的端到端恢复闭环**
   - 这是 AI 与人协作真正进入 durable execution 的主链。
2. **P0：补齐 sensitive access 的治理解释、审批恢复与通知失败处置一致性**
   - 这是从“有能力”走向“可控、可审计、可商用治理”的关键。
3. **P0：继续补真 publish gateway / published invocation 的诊断与治理可见性**
   - 这是 OpenClaw-first 对外切口能否稳定演示的关键。
4. **P1：继续拆 backend service 与 frontend state / validation 热点**
   - 重点围绕 runtime、starter、catalog、publish、validation 这些高复用路径继续解耦。
5. **P1：继续补 editor / starter 的字段级治理体验与 portability guard**
   - 目标是让复杂 workflow 定义在后续迭代中仍然可维护、可迁移。

## 验证

- `cd api; .\.venv\Scripts\uv.exe run pytest -q`
  - `300 passed in 33.26s`
- `cd web; pnpm exec tsc --noEmit`
  - 通过

## 结论

- 当前项目基础框架已经足以承接持续功能开发，不需要回头重搭主骨架。
- 最近一次提交需要衔接，但衔接方式应继续保持“拆热点、补闭环、守住 IR 与治理边界”。
- 当前还没有进入“只剩人工逐项界面设计”的阶段，因此本轮不触发通知脚本。
