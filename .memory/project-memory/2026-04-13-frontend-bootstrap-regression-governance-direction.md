---
memory_type: project
topic: 前端初始化阶段目录与回归规范方向已确认
summary: 用户已确认当前前端按“轻结构、强门禁”推进，先冻结目录边界、测试命名、页面/组件/样式三层回归职责和路由真值层规范，再进入后续实现。
keywords:
  - frontend
  - bootstrap
  - regression
  - directory
  - testing
  - route
match_when:
  - 需要继续整理前端目录结构
  - 需要新增或迁移前端测试
  - 需要规划路由真值层或权限 guard
  - 需要解释初始化阶段页面/组件/样式三层回归分别测什么
created_at: 2026-04-13 15
updated_at: 2026-04-13 15
last_verified_at: 2026-04-13 15
decision_policy: verify_before_decision
scope:
  - web
  - docs/superpowers/specs/1flowse/2026-04-13-frontend-bootstrap-directory-and-regression-design.md
---

# 前端初始化阶段目录与回归规范方向已确认

## 时间

`2026-04-13 15`

## 谁在做什么

用户要求在前端仍处于初始化阶段时，优先明确目录结构、测试归档、页面/组件/样式三层回归职责，并把本轮 QA 已发现的问题统一整理成后续整改输入。AI 基于现有 `web` 结构、前端 skill 和 QA 结果，给出一套“轻结构、强门禁”的前端初始化阶段规范，用户已确认采用这套方向。

## 为什么这样做

当前前端虽然能运行，但路由真值层、权限接入、样式边界和测试归档都还未收口。如果继续按现在的 bootstrap 结构直接扩功能，`router.tsx`、`global.css` 和散落测试会快速失控。

## 为什么要做

需要在业务内容仍然较轻时先把工程秩序立住，让后续新增页面、组件和权限逻辑时有固定落点和统一门禁，而不是每次都重新讨论目录和测试规则。

## 截止日期

无

## 决策背后动机

用户接受“页面 -> 组件 -> 样式”作为回归分层，但不把它当作实现顺序；样式层只承担边界和影响面验证，不承担信息架构或审美评审。目录上进一步明确为 `app / app-shell / routes / features / shared / style-boundary / styles`，其中 `shared/ui` 负责跨 feature 组件，`shared/utils` 负责纯函数工具，`features/*/api` 负责 feature 级请求消费，底层请求继续放在 `web/packages/api-client`。测试全部进入最近的 `_tests/`，并要求新增路由未来统一收口到集中式 route config。

## 关联文档

- `docs/superpowers/specs/1flowse/2026-04-13-frontend-bootstrap-directory-and-regression-design.md`
