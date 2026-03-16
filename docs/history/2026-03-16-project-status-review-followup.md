# 2026-03-16 项目现状复核补充（对齐当前 HEAD 与验证结果）

## 背景

- 按用户要求再次串读 `AGENTS.md`、`docs/dev/user-preferences.md`、`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/open-source-commercial-strategy.md`、`docs/dev/runtime-foundation.md` 与最近提交，确认项目当前是否仍沿正确主线推进。
- 本轮重点不是引入新的产品方向，而是把“最近提交是否需要衔接”“基础框架是否足以持续开发”“哪些热点该继续优先治理”再对齐到 2026-03-16 当前 `HEAD`。

## 本轮复核输入

- 规则与偏好：`AGENTS.md`、`docs/dev/user-preferences.md`
- 设计基线：`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/open-source-commercial-strategy.md`
- 当前事实：`docs/dev/runtime-foundation.md`
- 最近提交链：
  - `18795bc docs: validate architecture status review`
  - `159b712 docs: record architecture assessment and priorities`
  - `5fe1652 docs: record status review after workspace starter split`
  - `94ad5ed refactor: split workspace starter library state`
- 代码抽样：`api/app/services/runtime.py`、`api/app/services/agent_runtime.py`、`api/app/services/tool_gateway.py`、`api/app/api/routes/workflows.py`、`api/app/api/routes/runs.py`、`web/components/workflow-editor-workbench.tsx`、`web/components/sensitive-access-inbox-panel.tsx`、`web/lib/get-workflow-publish.ts`

## 最近提交与衔接判断

### 1. 最近一次提交做了什么

- 当前 `HEAD` 是 `18795bc docs: validate architecture status review`。
- 这次提交仍然属于开发留痕与事实校准，延续上一条 `159b712` 的状态复核工作，没有改动 runtime 语义、插件边界、发布协议或安全模型。
- 结论：最近一次提交需要“阅读衔接”，但不需要“架构补救式衔接”；它没有引入新的分叉方向。

### 2. 当前真正的代码衔接点

- 最近一次正式代码提交仍是 `94ad5ed refactor: split workspace starter library state`。
- 从 `94ad5ed -> 5fe1652 -> 159b712 -> 18795bc` 的连续关系看，当前主线保持一致：先拆热点，再做状态复核，再把架构判断与优先级固化进文档。
- 因此当前最合理的继续开发方式，不是回头重搭主骨架，而是沿 runtime / waiting / diagnostics / editor / governance 这条既有主线继续收口闭环。

## 代码与架构判断

### 1. 基础框架是否已经设计并落地到可继续开发

- 结论：是。当前项目已经超过“初始化骨架”阶段，后端和前端都具备持续功能开发的基础承载力。
- `api/app/services/runtime.py` 维持 `facade + mixin` 的主控结构，说明 workflow orchestration 仍然由单一 runtime 主控统一负责，没有被 publish、plugin runtime 或 sandbox 路径长出第二套流程控制语义。
- `api/app/services/agent_runtime.py`、`api/app/services/tool_gateway.py`、`api/app/services/sensitive_access_control.py` 之间的分层已经形成：AI 节点执行、工具调用、敏感访问治理虽然还在继续拆层，但职责边界总体清晰。
- `api/app/api/routes/workflows.py`、`api/app/api/routes/runs.py` 维持薄路由趋势，说明 workflow persistence、run diagnostics 与 waiting surface 没有明显回流到 HTTP 层。
- `web/components/workflow-editor-workbench.tsx` 已收敛到工作台装配层，说明前端编辑器骨架已经具备继续扩展节点表单、校验和图编辑的条件。

### 2. 是否满足功能性开发、插件扩展性、兼容性、可靠性、稳定性与安全性

- 当前架构已满足继续推进这些目标的“基础门槛”，不需要回头重造框架。
- 插件兼容仍然保持 `compat adapter` 边缘化建模，没有看到 Dify / OpenAI / Anthropic 协议反向主导 `7Flows IR` 的迹象。
- reliability / stability 的关键事实已经存在：`runs / node_runs / run_events` 是统一事实层，published surface、run views、sensitive access 都围绕同一条 runtime 主链扩展。
- 安全方向也基本成立：高风险访问会进入 `SensitiveAccessControlService`，而不是散落在工具节点和路由层里直接放行。
- 现阶段的主要风险不在方向，而在于 waiting / callback、publish diagnostics、sensitive access explanation 和 editor validation 这些热点如果不继续收口，后续功能开发会越来越慢。

## 代码热点与解耦判断

### 1. 仍值得优先治理的后端热点

- `api/app/services/workspace_starter_templates.py`：575 行
- `api/app/services/runtime_node_dispatch_support.py`：573 行
- `api/app/services/agent_runtime.py`：523 行
- `api/app/services/workflow_library_catalog.py`：484 行
- `api/app/services/runtime_run_support.py`：450 行
- `api/app/services/sensitive_access_control.py`：426 行

### 2. 仍值得优先治理的前端热点

- `web/lib/get-workflow-publish.ts`：457 行
- `web/lib/workflow-tool-execution-validation.ts`：399 行
- `web/components/workflow-editor-variable-form.tsx`：376 行
- `web/app/page.tsx`：340 行
- `web/components/sensitive-access-inbox-panel.tsx`：337 行

### 3. 判断

- 这些文件目前还没有“必须紧急返工”的程度，但它们都已经处在继续拆 helper / presenter / validation / action orchestration 的合理窗口期。
- 后续应优先按“职责分叉点”拆，而不是按行数机械切文件。例如：provider-specific streaming、waiting lifecycle hydration、bulk governance action、publish export binding、editor field-level validation 都更适合作为独立 helper / hook / presenter 下沉。

## 对产品闭环推进的判断

### 1. 用户层

- 当前已具备工作台、工作流编辑、基础发布、run diagnostics、sensitive access inbox 等入口，说明“用户可见的可编排/可调试/可发布”闭环已经成形，但仍不是成品态。

### 2. AI 与人协作层

- 当前 `llm_agent`、tool gateway、published surface、trace / replay 方向与设计基线一致，已经具备把 workflow 作为 AI 可调用能力源继续推进的条件。
- 但 waiting / callback 和 publish diagnostics 仍需继续增强，否则“AI 独立消费 + 人类排障介入”的协作闭环还会有解释断层。

### 3. AI 治理层

- sensitive access、approval ticket、notification dispatch、bulk governance 已经是实质落地，而不是纯占位。
- 下一步关键不是再加一个新的治理系统，而是把 policy explanation、callback wake-up、notification / inbox / run timeline 解释链继续统一，减少 operator 排障时的信息跳转。

## 验证

- `cd api; .\.venv\Scripts\uv.exe run pytest -q`
  - `300 passed in 32.71s`
- `cd web; pnpm exec tsc --noEmit`
  - 通过

## 结论与下一步优先级

1. **P0：继续补齐 waiting / callback 的后台唤醒与 operator 可解释闭环**
   - 当前 waiting surface 已有事实层，但 callback bus、scheduler 唤醒、published/detail/inbox 的解释链仍是下一条最值得继续打透的主线。
2. **P0：继续把 sensitive access explanation 做成统一治理事实，而不是分散在页面提示里**
   - 已有审批、通知、批量治理和 diagnostics；下一步应继续统一 policy explanation、channel health、run timeline 与 publish export blocked reason。
3. **P1：继续治理 publish diagnostics / streaming / export 的 presenter 与 helper 热点**
   - 避免发布层在补功能时重新回流成新单体模块。
4. **P1：继续治理 editor validation / workflow publish / variable form 热点**
   - 保持前端壳层轻量，优先下沉字段级验证、binding identity、tool capability guard 和 graph orchestration。
5. **P1：继续按职责拆解大文件，而不是按行数平均切分**
   - 优先处理 `runtime_node_dispatch_support.py`、`agent_runtime.py`、`get-workflow-publish.ts`、`workflow-tool-execution-validation.ts` 和 `sensitive-access-inbox-panel.tsx`。
6. **P2：在不新增第二套内核的前提下，继续收敛 Team / Enterprise 最小领域模型**
   - 重点是 `organization / workspace / member / role / publish governance` 的最小可实现边界。

## 当前是否触发人工界面验收通知

- 不触发。
- 原因：当前项目虽然已经具备持续功能开发骨架，但还未达到“主要能力已完善，只差人工逐项界面设计和验收”的阶段。
