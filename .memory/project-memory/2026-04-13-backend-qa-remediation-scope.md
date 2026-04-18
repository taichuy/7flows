---
memory_type: project
topic: 后端 QA 修复范围已收敛为总 spec 加多专题计划
summary: 用户已确认后端当前轮工作采用“一个总 spec + 多个修复计划”，范围固定为权限闭环、会话闭环、OpenAPI 与状态入口收口，并仅对 `app runtime` 做结构预留，不作为本轮交付对象。
keywords:
  - backend
  - qa
  - remediation
  - spec
  - session
  - acl
  - openapi
match_when:
  - 需要继续编写或执行当前后端 QA 修复计划
  - 需要判断 `app runtime` 是否属于本轮交付
  - 需要确认密码、session、ACL 和 OpenAPI 的修复边界
created_at: 2026-04-13 13
updated_at: 2026-04-13 13
last_verified_at: 2026-04-13 13
decision_policy: verify_before_decision
scope:
  - docs/superpowers/specs/1flowbase/2026-04-13-backend-qa-remediation-design.md
  - api
---

# 后端 QA 修复范围已收敛为总 spec 加多专题计划

## 时间

`2026-04-13 13`

## 谁在做什么

用户要求先不处理前端，把后端当前 QA 暴露的问题集中讨论后收敛成正式总 spec，再基于该 spec 拆多个修复计划逐个实施。

## 为什么这样做

当前问题跨越 ACL、session、安全动作、OpenAPI 和状态入口，如果直接零散修复，后续很容易因设计口径不一致而反复返工。

## 为什么要做

本轮后端虽然基础验证通过，但 QA 已确认存在 runtime 数据面 ACL 缺失、session 契约不完整、OpenAPI 漂移和 route 层副作用收口不足等系统性问题，必须先统一修复边界。

## 截止日期

无硬性外部截止日期；当前优先目标是先完成 spec 审阅，再进入多个修复计划编写与执行。

## 决策背后动机

用户已确认：

- 采用“一个总 spec + 多个修复计划”组织方式
- `state_model` 按共享资源处理，不按创建人做 `own`
- `state_data` 第一阶段按 `created_by` 落地 `own`
- 单设备退出与全端失效分开
- 自助改密码、管理员重置密码和禁用用户会触发全端失效
- 角色/权限变更不触发全端失效
- 动作路由统一进入 `/actions/*`
- 本轮仍聚焦团队空间，`app runtime` 只做结构预留，不作为交付验收对象
