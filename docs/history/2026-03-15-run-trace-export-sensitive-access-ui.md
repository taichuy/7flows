# 2026-03-15 Run Trace Export Sensitive Access UI

## 背景

- 本轮先复核了 `AGENTS.md`、`docs/dev/user-preferences.md`、`docs/product-design.md`、`docs/open-source-commercial-strategy.md`、`docs/technical-design-supplement.md` 与 `docs/dev/runtime-foundation.md`，确认当前项目仍处于“运行时主链持续补全”的阶段，而不是只剩界面润色。
- 最近一次提交 `6d92dc3 feat: add masked credential handle resolution` 已把 credential `allow_masked` 从“事实等同 allow”收成真正的 masked handle 语义，补上了 runtime / tool 最后一跳恢复明文的边界；这轮没有发现必须先为该提交返工的阻塞缺陷。
- 复核当前实现后，最明显的产品缺口不是后端没有安全治理，而是 run diagnostics / workflow overlay 的 trace export 入口仍只是直接跳 API 链接；一旦后端因敏感访问控制返回审批或拒绝，前端没有统一落点，人与 AI 协作排障路径会出现“后端已拦截、前端只剩失败跳转”的断裂体验。

## 本轮判断

- 基础框架已经写到可以继续推进主业务完整度：`runs / node_runs / run_events / run_artifacts / tool_call_records / ai_call_records`、workflow publish、published gateway、sensitive access、graded execution、callback ticket / resume scheduler 等主干都已成型，当前不是空框架阶段。
- 架构方向与产品设计基本一致：`7Flows IR`、统一执行主控、事件流追溯、分级执行、上下文授权隔离、发布兼容层旁挂等边界在代码和文档里基本一致，没有发现“已经偏成第二套 DSL”或“让兼容协议反客为主”的问题。
- 目前仍不适合进入“人工逐项界面设计 / 全链路人工验收”阶段，因此本轮不触发本地通知脚本。
- 主要风险集中在“长文件热点”和“安全治理闭环仍有局部缺口”：
  - 后端热点仍集中在 `api/app/services/agent_runtime_llm_support.py`、`api/app/services/runtime_node_dispatch_support.py`、`api/app/services/agent_runtime.py`、`api/app/services/tool_gateway.py`、`api/app/services/run_views.py`、`api/app/services/run_trace_views.py`。
  - 前端热点仍集中在 `web/components/run-diagnostics-execution-sections.tsx`、`web/lib/get-workflow-publish.ts`、`web/components/workflow-editor-workbench/use-workflow-editor-graph.ts`、`web/components/workspace-starter-library.tsx`。
  - 安全治理上，run trace export API 已受控，但 publish export、通知 worker / inbox、approval timeline 摘要等闭环仍需继续补。

## 实现

- 新增 `web/components/run-trace-export-actions.tsx`，把 run trace export 从静态链接抽成可复用的 client-side 导出动作组件。
- `web/components/run-diagnostics-panel/trace-filters-section.tsx` 改为复用该组件，导出 JSON / JSONL 时若命中审批或拒绝，会直接展示 `SensitiveAccessBlockedCard`。
- `web/components/workflow-run-overlay-panel.tsx` 同样接入该组件，补齐 overlay 场景的安全阻断 UI。
- `web/lib/sensitive-access.ts` 新增仅解析阻断响应的 helper，避免导出成功场景被提前消费 response body。
- `web/components/sensitive-access-blocked-card.tsx` 调整为 client component，保持前端各处阻断详情卡片渲染一致。
- `web/app/globals.css` 补了导出按钮与阻断反馈的最小样式，保证按钮、错误消息和 blocked card 在现有布局下能稳定换行展示。

## 影响范围

- 人类排障入口现在能完整承接后端敏感访问控制，不再把审批/拒绝错误暴露成浏览器空白页或裸 JSON。
- 这次改动没有改变后端 `RunTraceExportAccessService`、审批票据或资源判定逻辑，只是把现有治理能力补成更可用的工作台落点。
- 诊断页导出逻辑从页面级临时 href 计算，收敛为组件级复用动作，为后续继续补 publish export 或 approval timeline 留出统一 UI 模式。

## 验证

- `web/pnpm lint`
- `web/pnpm exec tsc --noEmit`
- `git diff --check`

## 下一步

1. **P0**：继续把统一敏感访问控制挂到 publish export 真实入口，并补通知 worker / inbox。
2. **P0**：把 `WAITING_CALLBACK` 的 callback ticket、scheduler、resume orchestration 继续收成 durable execution 主链。
3. **P1**：拆 `web/components/run-diagnostics-execution-sections.tsx`，把 execution summary / node list / tool evidence / context grant 继续解耦。
4. **P1**：继续治理 `agent_runtime_llm_support.py`、`runtime_node_dispatch_support.py` 等热点文件，避免 phase helper 与主调度逻辑重新耦回去。
