# 2026-03-14 Published Invocation Audit Aggregation Split

## 背景

- 最近一次 Git 功能提交 `b865ab9` 已把 `published gateway` 的 `binding invoker` 从主网关拆出，并在开发记录里把“继续治理 `api/app/services/published_invocation_audit.py`”列为下一步 P0。
- 当前项目并不是“只剩空骨架”状态：运行时、发布、追踪、工作台和最小编辑器都已落地，但发布治理中的 invocation audit 仍聚合了 summary、facet、timeline 三类职责，是最突出的后端结构热点之一。
- 用户这轮明确要求先阅读当前事实、评估是否需要衔接上一次提交，再基于优先级继续推进并补齐文档留痕；因此这一轮直接沿着上次提交给出的 P0 继续，而不是切去新的支线。

## 目标

1. 继续收紧 publish governance 的后端边界，避免热点从 `published_gateway.py` 平移到 `published_invocation_audit.py`。
2. 保持 publish activity / audit API 的对外行为不变，不影响现有筛选、facet、timeline 与 API key usage 统计。
3. 同步更新当前事实索引，让下一轮可以明确把重心转向 runtime 结构治理。

## 实现方式

### 1. 把 facet / summary 聚合拆到独立 helper

- 新增 `api/app/services/published_invocation_audit_aggregation.py`。
- 把以下职责从 `published_invocation_audit.py` 中抽离：
  - invocation summary 统计
  - facet bucket 聚合
  - API key usage 列表构建
  - binding summary map 聚合
- `PublishedInvocationAuditMixin.build_binding_audit()` 现在只保留：
  - 拉取筛选后的 invocation records
  - 调用 aggregation helper 产出 summary / facets
  - 查询 API key lookup
  - 组装最终 `PublishedInvocationAudit`

### 2. 把 timeline 统计拆到独立 helper

- 新增 `api/app/services/published_invocation_audit_timeline.py`。
- 把 timeline granularity 判定、时间桶截断、bucket facet 构建、API key top bucket 聚合和最终 timeline 组装从主 mixin 中抽出。
- timeline helper 通过回调接收 request surface 与 reason code 解析，避免与 audit mixin 产生反向依赖。

### 3. 让 audit mixin 回到 orchestration 角色

- `api/app/services/published_invocation_audit.py` 从 732 行收口到 197 行。
- 主文件现在只保留 request surface / reason code 解析和 mixin orchestration，不再直接承接大段 facet / timeline 聚合细节。
- publish governance 的演进边界比上一轮更清楚：
  - `published_gateway.py` 负责发布入口编排
  - `published_gateway_binding_invoker.py` 负责 binding 执行主链
  - `published_invocation_audit.py` 负责审计编排
  - aggregation / timeline helpers 负责统计细节

## 影响范围

- `api/app/services/published_invocation_audit.py`
- `api/app/services/published_invocation_audit_aggregation.py`
- `api/app/services/published_invocation_audit_timeline.py`
- `docs/dev/runtime-foundation.md`

## 验证

- `./api/.venv/Scripts/uv.exe run --directory api ruff check app/services/published_invocation_audit.py app/services/published_invocation_audit_aggregation.py app/services/published_invocation_audit_timeline.py`
- `./api/.venv/Scripts/uv.exe run --directory api pytest tests/test_workflow_publish_routes.py tests/test_workflow_publish_activity.py -q`
- 结果：`28 passed`

## 结论

- 上一次功能提交明确需要衔接，这一轮已按它留下的 P0 继续推进，没有偏离当前主线。
- 当前基础框架已经写到“可持续推进完整度”的阶段，不是停留在空设计层：后端结构能继续按热点拆分，说明主要架构边界总体是可解耦、可演进的。
- 这轮之后，publish governance 的单文件热点明显下降，下一轮更合理的主战场已经转到 runtime 结构治理，而不是继续把注意力放在 audit 单文件上。
- 项目仍未到“只剩人工逐项界面设计 / 人工验收”的阶段，因此本轮不触发通知脚本。

## 下一步规划

1. **P0：继续治理 `api/app/services/runtime.py` 与 `api/app/services/runtime_graph_support.py`**
   - 把 graph scheduling / lifecycle / resume orchestration 边界继续收紧，避免 runtime 主链继续膨胀。
2. **P1：继续治理 `web/components/run-diagnostics-panel.tsx`**
   - 保持摘要优先、详情钻取，不让调试 UI 重新变成聚合大组件。
3. **P1：继续补节点配置完整度**
   - 让 provider / model / tool / publish 配置继续朝结构化配置段演进。
4. **P1：继续收紧 publish governance 聚合边界**
   - 后续新增统计时优先写到 aggregation / timeline helper，而不是回流 `published_invocation_audit.py`。
