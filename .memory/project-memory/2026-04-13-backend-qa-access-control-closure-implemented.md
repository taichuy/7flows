---
memory_type: project
topic: backend QA access control closure 已完成实现与验证
summary: `docs/superpowers/plans/2026-04-13-backend-qa-access-control-closure.md` 已在 `api` workspace 落地，补齐 `state_model` 详情读取可见性和 `state_data` runtime own/all ACL，并在 `2026-04-13 16` 通过专题回归与统一后端验证脚本。
keywords:
  - backend
  - qa
  - access-control
  - state_model
  - state_data
  - runtime
  - verification
match_when:
  - 需要继续执行或回归 backend QA remediation topic A
  - 需要确认 `state_model` 详情读取 ACL 是否已闭环
  - 需要确认 `state_data` own/all 是否已在 runtime CRUD 落地
created_at: 2026-04-13 16
updated_at: 2026-04-13 16
last_verified_at: 2026-04-13 16
decision_policy: verify_before_decision
scope:
  - docs/superpowers/plans/2026-04-13-backend-qa-access-control-closure.md
  - docs/superpowers/specs/1flowse/2026-04-13-backend-qa-remediation-design.md
  - api
---

# backend QA access control closure 已完成实现与验证

## 时间

`2026-04-13 16`

## 谁在做什么

AI 按 `docs/superpowers/plans/2026-04-13-backend-qa-access-control-closure.md` 在 `api` workspace 落地 access-control remediation topic A，并完成控制面、runtime-core、storage-pg、route 层和回归测试收口。

## 为什么这样做

本轮后端 QA 修复按 remediation 专题拆分推进，topic A 专门收口此前“只要有 session 就能通过”的访问控制缺口，避免控制面和 runtime 数据面的 ACL 语义继续漂移。

## 为什么要做

总设计稿已经固定：

- `state_model` 作为共享结构资源处理，`view/manage.own` 也应按作用域共享资源放行；
- `state_data` 第一阶段按 `created_by` 落地 `own`；
- runtime 路由必须把授权判断下沉到 `runtime-core -> storage-pg`，不能继续由 route 层隐式放行。

## 截止日期

无

## 决策背后动机

优先把现有静态权限目录修到真实可用，而不是引入新的动态 ACL 体系。通过新增 `runtime_acl` 和 owner-aware repository 参数，让 `state_data` own/all 的判定落在统一入口，同时保留 `state_model` 第一阶段的共享资源语义，减少 topic C / D 后续继续收口路由和 runtime registry 时的耦合成本。

## 关键结果

- `GET /api/console/models/:id` 现在必须经过 `state_model.view` 权限校验；
- `state_model.view.own` / `state_model.manage.own` 现在按共享资源语义放行控制面结构读写；
- runtime CRUD 现在接收 `ActorContext`，在 `runtime-core` 里解析 `state_data.create/view/edit/delete/manage` own/all 作用域；
- `storage-pg` 的 runtime record SQL 在 own-scope 模式下会追加 `created_by = actor.user_id` 过滤；
- manager/admin/root 在 runtime 路由上已经有差异化回归覆盖。

## 关联提交

- `171f4f88 fix: enforce state model visibility on detail reads`
- `203126d6 fix: enforce state data own all authorization`
