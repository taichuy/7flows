---
memory_type: project
topic: 轻壳层 mock 导航修正当前优先落在 tmp/mock-ui
summary: 当前浅色翡翠 mock 的导航与壳层样式调整实际维护在 `tmp/mock-ui`，最近一轮决策已把顶栏改为左侧 Ant Design horizontal menu、右侧纯文本昵称 submenu，不再使用头像或胶囊按钮，再评估是否回流 `web/`。
keywords:
  - mock-ui
  - tmp/mock-ui
  - navigation
  - light-shell
  - web
match_when:
  - 用户基于当前 mock 截图要求调整导航或壳层布局
  - 需要判断浅色 mock 的实际修改目录
created_at: 2026-04-13 08
updated_at: 2026-04-13 10
last_verified_at: 2026-04-13 10
decision_policy: verify_before_decision
scope:
  - tmp/mock-ui
  - web
  - scripts/node/mock-ui-sync.js
---

# 轻壳层 mock 导航修正当前优先落在 tmp/mock-ui

## 标题

轻壳层 mock 导航修正当前优先落在 `tmp/mock-ui`

## 时间

`2026-04-13 08`

## 谁在做什么

AI 根据用户提供的 mock 截图、`../dify/web` 参考和后续反馈，持续调整浅色翡翠壳层导航栏；最近一轮把顶栏从居中胶囊导航改成左侧 `Ant Design Menu` 风格、右侧纯文本昵称 submenu，实际修改目录仍为 `tmp/mock-ui`。

## 为什么这样做

当前截图对应的浅色 mock 壳层、导航文案和样式尚未完整回流到 `web/`，直接改 `web/` 无法立即反映到用户正在看的演示。

## 为什么要做

需要先让截图对应的 mock 演示与用户预期对齐，确保导航问题和账户区布局都在当前可见产物里被修正，而不是只在源目录里理论修正。

## 截止日期

无

## 决策背后动机

优先保证“用户正在看的 mock”被正确修复，避免因为 `web/` 与 `tmp/mock-ui` 暂时不同步而把改动落到错误目录；同时将顶栏信息结构明确为“左导航 / 右账户”，并把账户入口约束为纯文本昵称下拉，避免再回到头像按钮或胶囊按钮的视觉方向。

## 关联文档

- `uploads/image_aionui_1776039959957.png`
- `uploads/image.png`
- `uploads/image_aionui_1776042644633.png`
- `tmp/mock-ui/app/src/app/router.tsx`
- `tmp/mock-ui/packages/ui/src/index.tsx`
