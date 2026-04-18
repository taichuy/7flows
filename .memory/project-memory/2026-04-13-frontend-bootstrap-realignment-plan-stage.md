---
memory_type: project
topic: 前端 bootstrap 目录与回归规范已进入实现计划阶段
summary: 用户确认前端 bootstrap 规范 spec 没有阻塞问题后，当前工作已进入实现计划阶段，计划文件固定为 `docs/superpowers/plans/2026-04-13-frontend-bootstrap-realignment.md`。
keywords:
  - frontend
  - bootstrap
  - plan
  - route
  - style-boundary
  - tests
match_when:
  - 需要继续执行前端 bootstrap 结构整改
  - 需要确认当前前端工作是否已从 spec 进入 plan
  - 需要查找本轮前端结构整改的执行入口
created_at: 2026-04-13 16
updated_at: 2026-04-13 16
last_verified_at: 2026-04-13 16
decision_policy: verify_before_decision
scope:
  - web
  - docs/superpowers/plans/2026-04-13-frontend-bootstrap-realignment.md
---

# 前端 bootstrap 目录与回归规范已进入实现计划阶段

## 时间

`2026-04-13 16`

## 谁在做什么

用户要求先复核前端 bootstrap 规范 spec，若没有阻塞问题则直接进入计划阶段并准备开始调整前端。AI 复核后确认 spec 没有原则性问题，仅把目录示例中漏掉的 `embedded-runtime` 纳入真实迁移范围，随后已写出正式实现计划。

## 为什么这样做

前端当前的主要问题已从“方向不清楚”变成“如何按顺序安全落地”：需要先拆 route truth layer 和 app shell，再迁移 feature 目录与 API 消费，之后修测试和样式边界，而不是无计划地边改边试。

## 为什么要做

需要一个固定执行入口，确保后续实施既能守住目录边界和回归门禁，又能维持当前前端可运行，不因为一次性大改把 shell、测试和样式回归同时打坏。

## 截止日期

无

## 决策背后动机

本轮计划延续 spec 中“轻结构、强门禁”的策略：先做职责拆分和测试落点，再收束全局样式，最后补 route guard 骨架。这样可以优先解决 `router.tsx` 过宽、测试不规范、`global.css` blast radius 和 route metadata 缺失等结构性问题。

## 关联文档

- `docs/superpowers/plans/2026-04-13-frontend-bootstrap-realignment.md`
- `docs/superpowers/specs/1flowbase/2026-04-13-frontend-bootstrap-directory-and-regression-design.md`
