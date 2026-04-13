---
memory_type: project
topic: 正式 web 已回流 tmp/mock-ui 的浅色翡翠壳层主题与导航
summary: 用户确认 `tmp/mock-ui` 的主题和导航审美方向后，正式 `web` 已回流浅色翡翠主题 token、顶部水平导航和右侧纯文本账户入口；当前顶栏文案固定为“工作台 / 团队 / 前台”，账户入口与右边缘保持 `5%` 间距，且没有把 `theme-preview` 这类沙盒展示页一起带回主应用。
keywords:
  - web
  - tmp/mock-ui
  - theme
  - navigation
  - shell
match_when:
  - 需要继续调整正式 web 的壳层主题或顶部导航
  - 需要判断 `tmp/mock-ui` 中哪些 UI 改动已经正式回流
  - 需要确认是否应把 `theme-preview` 一类演示页带入正式 web
created_at: 2026-04-13 10
updated_at: 2026-04-13 10
last_verified_at: 2026-04-13 10
decision_policy: verify_before_decision
scope:
  - web
  - tmp/mock-ui
  - web/packages/ui/src/index.tsx
  - web/app/src/app/router.tsx
  - web/app/src/styles/global.css
---

# 正式 web 已回流 tmp/mock-ui 的浅色翡翠壳层主题与导航

## 时间

`2026-04-13 10`

## 谁在做什么

用户明确要求把 `tmp/mock-ui` 里更符合审美的主题和导航栏迁移到正式 `web`，并进一步把导航文案收敛为“工作台 / 团队 / 前台”，同时把右侧账户入口从贴边状态后退到距右边缘 `5%` 的位置。AI 已将这些壳层规则落实到正式前端。

## 为什么这样做

最近一轮 UI 探索实际在 `tmp/mock-ui` 中完成，用户已经明确认可该方向，继续把视觉改动停留在沙盒里会造成 mock 与正式 web 割裂。

## 为什么要做

需要让正式前端直接继承用户已经确认过的壳层风格，避免主题和导航只存在于展示副本中。

## 截止日期

无

## 决策背后动机

回流范围只覆盖正式应用真正生效的壳层能力，不把 `theme-preview` 这类沙盒展示页一起带回主应用，避免把探索用页面误当成正式产品结构；同时用更明确的中文导航文案和右侧留白让顶栏信息层次更贴近用户当前认可的视觉方向。
