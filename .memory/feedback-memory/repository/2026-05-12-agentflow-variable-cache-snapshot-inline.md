---
memory_type: feedback
feedback_category: repository
topic: agent-flow variable cache snapshot
summary: 变量缓存 snapshot 应一次性返回 debug_variable_cache_entries 中持久化的变量值，不在读路径二次转成 runtime debug artifact 预览。
keywords:
  - agent-flow
  - debug-variable-snapshot
  - debug_variable_cache_entries
  - runtime_debug_artifacts
match_when:
  - 调整“查看缓存 / 变量缓存”面板的数据来源或后端 snapshot 接口
  - 处理 debug_variable_cache_entries 与 runtime_debug_artifacts 的边界
created_at: 2026-05-12 21
updated_at: 2026-05-12 21
last_verified_at: 2026-05-12 21
decision_policy: direct_reference
scope:
  - web/app/src/features/agent-flow
  - api/apps/api-server/src/routes/applications/application_runtime
  - api/crates/storage-durable/postgres
---

# AgentFlow 变量缓存 Snapshot 内联值

## 时间

`2026-05-12 21`

## 规则

“变量缓存”的列表数据应对应 `debug_variable_cache_entries.value` 中持久化的变量值，并通过 `GET /api/console/applications/{id}/orchestration/debug-variable-snapshot` 一次性拿出。不要在 snapshot 读取路径上把大值二次 offload 成 `__runtime_debug_artifact` 预览。

## 原因

用户明确指出缓存变量列表的语义是“持久化变量值列表”，不是 run detail / event payload 的大对象隔断机制。读 snapshot 时创建 artifact 会让缓存面板出现额外的“已截断 / 加载完整值”步骤，并且会在读取接口里产生新的 artifact 写入副作用。

## 适用场景

- 修改 `debug-variable-snapshot` 路由、变量缓存表读写、变量缓存面板渲染时。
- 判断 `runtime_debug_artifacts` 是否应该介入变量缓存展示时。
- 新增大变量值回归测试时，优先覆盖“大值仍直接返回持久化值且不创建 artifact 元数据”。

## 备注

`runtime_debug_artifacts` 仍用于 run detail、node run payload、run event payload 等运行调试大对象；这条规则只约束变量缓存 snapshot 的读路径。
