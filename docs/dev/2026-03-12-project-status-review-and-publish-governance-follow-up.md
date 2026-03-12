# 2026-03-12 Project Status Review And Publish Governance Follow-up

## 背景

本轮先按仓库约定重新对齐了以下事实来源：

- `AGENTS.md`
- `docs/dev/user-preferences.md`
- `docs/product-design.md`
- `docs/technical-design-supplement.md`
- `docs/dev/runtime-foundation.md`
- 最近一次 Git 提交 `062d03a5626d232f8490b2c6da04cbe584c217cc`（`2026-03-12 11:39:18 +0800`）

用户本轮关注点不是单点修 bug，而是确认几件事：

1. 上一次提交做了什么，当前是否需要衔接
2. 基础框架是否已经设计并落地到可继续推进主业务
3. 当前架构是否还保持了解耦
4. 是否已经出现需要优先拆分的过长文件
5. 后续应按什么优先级继续推进

## 当前判断

### 1. 上一次提交做了什么，是否需要衔接

最近一次提交 `feat: add published openai anthropic gateway` 已经把开放 API 主线推进到后端可用阶段，主要包括：

- `published_gateway` 接入 native / OpenAI / Anthropic 三类发布入口
- `published_protocol_mapper` 把外部协议映射限制在发布层，而不是倒灌进 runtime
- `workflow_publish` / invocation / cache / api key 事实继续补齐
- `docs/dev/runtime-foundation.md` 已同步记录发布网关现状

结论：

- 需要衔接
- 当前工作区里未提交的 `web/` 改动正是这次后端提交之后的自然续接
- 因此本轮不应重新起一条“更底层的新主线”，而应优先把发布治理前端闭环补上

### 2. 基础框架是否已经设计写好

结论不是“还没开始”，而是“基础框架已经进入可承接主业务的阶段”。

当前已经具备：

- `workflow/version -> compiled blueprint -> run` 的稳定绑定
- `runs / node_runs / run_events / run_artifacts / tool_call_records / ai_call_records`
- `llm_agent` phase runtime、callback ticket、resume scheduler
- publish binding、lifecycle、alias/path、api key、rate limit、cache、invocation audit
- workflow 页面上的 publish governance 消费入口

当前仍未完成，但属于“下一阶段能力”而不是“框架没搭好”：

- `loop` 节点执行
- 更完整的 streaming / SSE 发布映射
- compat adapter 全生命周期
- editor 侧 execution / evidence 更深度接入

### 3. 架构是否保持解耦

整体方向基本正确，关键边界目前仍然成立：

- `WorkflowPublishBindingService` 负责 publish binding 事实与 lifecycle
- `PublishedEndpointGatewayService` 负责发布入口编排、鉴权、限流、缓存、run 调用
- `published_protocol_mapper.py` 只负责外部协议响应映射
- runtime 没有因为 OpenAI / Anthropic 发布协议再长出第二套执行链
- workflow 页面不再自己并行拼四组 publish 治理请求，而是把装配职责收口到独立 loader

本轮补的一处解耦是前端工作流页：

- 之前页面直接拼装 cache inventory、API key、invocation audit、rate-limit window 四组发布治理数据
- 本轮抽成 `web/lib/get-workflow-publish-governance.ts`
- 结果是 workflow 页面回到“页面装配”，发布治理数据收敛到独立 loader

### 4. 哪些文件已经过长，应该优先关注

按当前仓库实际行数看，风险最明显的是：

- `api/app/services/runtime.py`: 1502 行，已超过后端 1500 行偏好阈值
- `api/tests/test_runtime_service.py`: 1595 行，测试也已经开始过载
- `web/components/workspace-starter-library.tsx`: 1042 行，虽然没超过前端阈值，但已是后续拆分候选
- `api/app/services/runtime_graph_support.py`: 649 行
- `api/app/services/agent_runtime.py`: 628 行
- `web/components/run-diagnostics-panel.tsx`: 636 行

本轮处理后，发布治理这一支已经明显更可控：

- `web/app/workflows/[workflowId]/page.tsx`: 66 行
- `web/components/workflow-publish-panel.tsx`: 102 行
- `web/components/workflow-publish-binding-card.tsx`: 209 行
- `web/components/workflow-publish-activity-panel.tsx`: 278 行
- `web/lib/get-workflow-publish-governance.ts`: 78 行

## 本轮实现

### 1. 继续衔接 publish governance 前端

新增：

- `web/lib/get-workflow-publish-governance.ts`

作用：

- 统一装配 cache inventory
- 统一装配 published API key
- 统一装配 invocation audit
- 统一装配 rate-limit window audit

这样 workflow 页面不再直接堆四组 Promise 组合逻辑。

### 2. 保持发布治理 UI 分层

当前 publish 治理链路拆成：

- 页面：`web/app/workflows/[workflowId]/page.tsx`
- 汇总面板：`web/components/workflow-publish-panel.tsx`
- 单个 binding 卡片：`web/components/workflow-publish-binding-card.tsx`
- invocation 治理面板：`web/components/workflow-publish-activity-panel.tsx`
- 数据装配：`web/lib/get-workflow-publish-governance.ts`

这比把生命周期、cache、activity、API key、rate-limit 全继续堆回页面或单一 panel 更符合当前仓库的分层方向。

### 3. 补齐 invocation 治理信息的呈现层

`workflow-publish-activity-panel.tsx` 当前已经直接承接：

- traffic mix
- rate-limit window used / remaining / rejected
- API key usage
- recent failure reasons
- timeline buckets

这样开放 API 的治理反馈不再停留在 binding 摘要卡片。

### 4. 继续收口共享展示逻辑

`workflow-publish-activity-panel.tsx` 已改为复用 `runtime-presenters.ts` 中的：

- `formatDurationMs`
- `formatKeyList`
- `formatTimestamp`

避免在发布治理面板里继续复制一套格式化逻辑。

### 5. 补齐新治理区块的基础样式

`web/app/globals.css` 本轮补上了：

- `health-pill.rejected`
- `publish-cache-list` 的自适应栅格
- `publish-timeline` / `publish-timeline-bar` / `publish-timeline-bar-fill`

避免新的 invocation timeline 和 rejected 状态退化成默认无结构排版。

## 验证

前端验证已执行：

```powershell
pnpm --dir web exec tsc --noEmit
pnpm --dir web lint
```

结果：

- `tsc --noEmit`: passed
- `pnpm --dir web lint`: passed

## 结论与下一步

当前结论：

- 项目基础框架已经足以继续推进主业务，不应再把“是否有框架”当成主要阻塞
- 上一次提交需要衔接，而且本轮已经沿着它继续补完前端治理层
- 架构主边界基本成立，但 `runtime.py` 已经进入必须规划拆分的区间
- 发布治理这一支现在已经从“后端可用”推进到“workflow 主页面可治理、可观察、可继续扩展”

按优先级建议下一步继续推进：

1. P0：继续补开放 API 主线的产品闭环
   - 把 publish governance 继续推进到更完整的协议面可见性和 streaming/SSE
   - 让 workflow 页面对 publish activity、rate limit、cache、protocol surface 的治理反馈更完整
2. P1：拆分 `runtime.py`
   - 优先按 run lifecycle、node execution、waiting/resume、event persistence 四个方向切层
   - 避免 Phase 2 能力继续堆回单一 God object
3. P1：收敛测试文件体量
   - `test_runtime_service.py` 后续应按 execution path / waiting-resume / callback / error path 拆分
4. P2：继续把 execution/evidence 视图接回 editor
   - 让主业务编排页直接承认新的 runtime 事实，而不是长期停留在“基础框架已做、主界面未消费”
