# 2026-03-11 Run Execution / Evidence Views

## 背景

上一轮已提交改动 `feat: persist compiled workflow blueprints` 把 `workflow_version -> compiled blueprint -> run binding` 固化为运行时事实。

但运行侧虽然已经把 `run_artifacts`、`tool_call_records`、`ai_call_records` 和 `run_callback_tickets` 落库，当前 UI 和调用方仍主要依赖：

- `GET /api/runs/{run_id}` 的大包详情
- `GET /api/runs/{run_id}/trace`

这会带来两个问题：

1. `runs.py` 继续膨胀，路由层同时承担 detail、trace、export、resume、callback 和新的聚合查询风险越来越高。
2. `run diagnostics` 需要手工从多个 payload 中重新拼运行事实，execution view / evidence view 的边界虽然在文档里明确了，但还没成为真实 API。

## 目标

本轮目标不是继续下钻 runtime 主循环，而是把已落库的运行态事实收口成可消费的聚合视图，并让 `run diagnostics` 先成为第一批消费者：

- 提供面向人类诊断和后续 editor 复用的 execution view
- 提供围绕 evidence context 的 evidence view
- 顺手拆分 `runs.py` 的序列化职责，避免再往单一路由模块堆逻辑
- 避免 `run-diagnostics-panel.tsx` 继续长成新的前端大文件

## 决策与实现

### 1. 新增独立 run views 服务与路由

新增：

- `api/app/services/run_views.py`
- `api/app/schemas/run_views.py`
- `api/app/api/routes/run_views.py`

后端现在补上两个聚合接口：

- `GET /api/runs/{run_id}/execution-view`
- `GET /api/runs/{run_id}/evidence-view`

其中：

- execution view 聚合 `node_runs / run_artifacts / tool_call_records / ai_call_records / run_callback_tickets`
- evidence view 聚焦 `node_runs.evidence_context`、assistant 调用、supporting artifacts 和最终 decision output

这样 run diagnostics 与后续 editor / diagnostics 复用时，不需要再从 `RunDetail` 全量对象里手工拼装调用轨迹。

### 2. 把 RunDetail 序列化从 routes 移到 services

`api/app/api/routes/runs.py` 原本自己承担：

- `RunDetail` 序列化
- artifact / tool call / AI call / event 序列化

本轮把这些下沉到 `api/app/services/run_views.py`：

- `serialize_run_detail`
- `serialize_run_event`
- 以及 run view 相关序列化函数

这一步不是为了“抽象而抽象”，而是为了让：

- `runs.py` 继续专注 detail / trace / callback 主入口
- 新的 `run_views.py` 承担聚合查询面
- 后续如果再补 execution / evidence export、editor overlay 复用或 publish 侧引用，不需要复制一份序列化逻辑

### 3. 先把 run diagnostics 接上 execution / evidence view

新增：

- `web/lib/get-run-views.ts`
- `web/components/run-diagnostics-execution-sections.tsx`

并更新：

- `web/app/runs/[runId]/page.tsx`
- `web/components/run-diagnostics-panel.tsx`

当前 run diagnostics 会并行读取：

- `RunDetail`
- `RunTrace`
- `RunExecutionView`
- `RunEvidenceView`

前端新增的展示边界：

- execution view：展示每个节点的 artifacts、tool calls、AI calls、callback tickets 和事件计数
- evidence view：展示 evidence summary、key points、conflicts、unknowns、recommended focus、supporting artifacts 和 decision output

这一步仍然保持 MVP 诚实性：

- 没有假装 editor 已经具备完整 execution / evidence 工作台
- 只是先把 run diagnostics 升级为可消费这些后端事实的第一批页面

### 4. 顺手控制前后端文件体量

这轮没有继续把新增逻辑塞进现有大文件：

- 后端没有继续把 execution / evidence 聚合写进 `api/app/api/routes/runs.py`
- 前端没有继续把 execution / evidence JSX 直接堆进 `web/components/run-diagnostics-panel.tsx`

这符合当前长期偏好：

- 后端文件原则上不超过 1500 行
- 前端文件原则上不超过 2000 行
- 当文件继续增长时优先拆职责，而不是继续堆叠

## 影响范围

后端：

- run 聚合查询能力从“detail + trace”扩展为“detail + trace + execution view + evidence view”
- callback ticket 生命周期开始进入 execution view 的正式消费层
- `RunDetail` 序列化从路由层迁到 service 层复用

前端：

- run diagnostics 不再只展示 run summary / node timeline / trace
- 现在已经可以显式看到 execution facts 和 evidence facts
- diagnostics 面板新增 section 组件拆分，避免主面板继续增长

## 验证

后端：

```powershell
cd api
.\.venv\Scripts\python.exe -m pytest tests\test_run_view_routes.py tests\test_run_routes.py
```

结果：20 个测试通过。

前端：

```powershell
cd web
pnpm exec tsc --noEmit
pnpm lint
```

结果：

- TypeScript 编译通过
- ESLint 通过

## 未决问题与下一步

本轮完成后，execution / evidence view 已经成为真实 API 和真实 UI，但仍有几个明确缺口：

1. editor overlay 还没有消费 execution / evidence view，只停留在 run detail + trace 摘要层
2. execution view 还没有导出接口，也还没有独立的 artifact drill-down / raw payload 打开方式
3. callback ticket 还缺过期、清理、来源审计和更强鉴权
4. publish binding 仍未真正接上 compiled blueprint 和开放协议映射

因此下一步应继续优先：

1. 把 publish binding 补到 compiled blueprint 主线上
2. 收口 callback ticket 生命周期治理
3. 把 execution / evidence view 进一步接回 editor 和更细的 diagnostics drill-down
