# 2026-03-13 Publish Invocation Drilldown UI

## 背景

- `2026-03-13` 最近一次提交已经把 publish waiting lifecycle 聚合事实接到后端审计与 workflow 页卡片。
- 但 `web/components/workflow-publish-activity-panel-sections.tsx` 仍同时承担聚合展示与单条 invocation 卡片渲染，文件体量继续增长。
- 当前列表项虽然已经带有 `request_preview / response_preview / run_waiting_lifecycle`，但 workflow 页里还缺一个更直接的单次 invocation drilldown 入口。

## 目标

- 在不新增后端协议的前提下，直接复用现有 invocation 列表数据，把单次调用的 request / response preview 与 waiting lifecycle 细节暴露给 publish 面板。
- 顺手把 invocation entry 卡片从主 sections 文件中拆出，继续维持 publish governance 的前端解耦方向。

## 实现方式

- 新增 `web/components/workflow-publish-invocation-entry-card.tsx`，把单条 invocation 的状态、waiting 生命周期、run 跳转和 drilldown 展示独立封装。
- 在新卡片内新增可展开的 `details` drilldown：
  - request preview
  - response preview
  - waiting lifecycle 补充说明
- `web/components/workflow-publish-activity-panel-sections.tsx` 只保留聚合 sections 编排，不再持有单条 invocation 卡片的大段细节 JSX。

## 影响范围

- `web/components/workflow-publish-activity-panel-sections.tsx`
- `web/components/workflow-publish-invocation-entry-card.tsx`

## 验证

- 已尝试在 `web/` 下执行 `./node_modules/.bin/tsc.cmd --noEmit`。
- 当前验证被仓库内既有无关错误阻断：`components/workspace-starter-library/template-list-panel.tsx` 仍在导入不存在的 `WorkspaceStarterBulkAction` 导出。
- 已额外人工复核本轮变更：`workflow-publish-activity-panel-sections.tsx` 已改为直接消费 `WorkflowPublishInvocationEntryCard`，没有保留旧的重复 inline 卡片 JSX。

## 结果与判断

- 这次改动继续承接了上一轮 `publish waiting lifecycle drilldown` 的主线，没有偏离既定优先级。
- publish governance 仍旧只消费统一审计事实，没有额外引入第二套前端运行态协议。
- 前端热点文件得到了一次安全的小拆分，但 `runtime.py` / `test_runtime_service.py` 仍然是更高优先级的后续结构风险点。

## 下一步规划

1. 继续承接 `API 调用开放` 主线：把 `streaming / SSE` 挂到 publish binding 与统一事件流上。
2. 继续深化 publish governance：若现有 preview 不足，再补单次 invocation 的后端 detail API 与更细粒度趋势视图。
3. 继续治理 Durable Runtime 热点：沿稳定边界继续拆 `api/app/services/runtime.py` 与 `api/tests/test_runtime_service.py`。
