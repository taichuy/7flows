---
memory_type: project
decision_policy: verify_before_decision
updated_at: "2026-04-26 12"
scope: "application deletion"
---

# 应用删除级联契约

用户确认：删除应用时，应硬删除该应用，并一并删除该应用相关的级联数据。

当前实现语义：

- 控制面接口使用 `DELETE /api/console/applications/{id}`。
- 删除权限使用 `application.delete.own` / `application.delete.all`，root 视为拥有全量删除权限。
- 删除入口必须走 `ApplicationService::delete_application`，路由层只做 session、CSRF、参数解析和响应映射。
- PostgreSQL 持久层删除 `flow_runs` 后再删除 `applications`，其余应用附属数据依赖外键级联清理，包括标签绑定、flow、draft、version、compiled plan、node run、checkpoint、event、callback task 等。
- 删除成功返回 `204 No Content`，并写 `application.deleted` 审计事件。

后续涉及应用恢复、软删除、运行记录保留或审计留存策略时，必须重新确认产品语义；当前阶段按开发初期硬删除处理。
