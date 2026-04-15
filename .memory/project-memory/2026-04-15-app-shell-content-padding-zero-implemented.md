---
memory_type: project
topic: AppShell 内容区边距下放到页面自身
summary: 用户确认 `AppShell` 不再为内容区提供默认内边距，壳层内容容器统一清零，具体页面所需留白由各页面或页面级布局自己声明。
keywords:
  - web
  - app-shell
  - layout
  - padding
  - full-bleed
match_when:
  - 需要决定 AppShell 是否应给页面统一留边
  - 需要排查页面边缘露白或内容区未铺满
  - 需要判断壳层和页面之间的布局职责边界
created_at: 2026-04-15 22
updated_at: 2026-04-15 22
last_verified_at: 2026-04-15 22
decision_policy: verify_before_decision
scope:
  - web/app/src/app-shell
  - web/app/src/app
  - web/app/src/features/applications
  - web/app/src/shared/ui
---

# AppShell 内容区边距下放到页面自身

## 时间

`2026-04-15 22`

## 谁在做什么

用户要求把 `AppShell` 上层内容区边缘样式清零，不再由壳层给页面统一留白；本次已在 `web/app/src/app-shell/app-shell.css` 中把 `.app-shell-content.ant-layout-content` 的桌面和移动端 `padding` 均改为 `0`。

## 为什么这样做

编排页面在 `SectionPageLayout` 和编辑器画布都已支持全宽布局，但右侧仍露出壳层背景，根因是 `AppShell` 内容区保留了统一 `padding`。继续由壳层决定边距会让全宽页面和普通页面耦合在一起。

## 为什么要做

当前共识是壳层只提供结构，不替业务页面做内容留白决策；需要边距的页面自行声明，不需要边距的页面可直接铺满。

## 截止日期

无硬性截止日期；自 `2026-04-15 22` 起作为当前实现事实生效。

## 决策背后动机

把布局职责边界收紧到“壳层负责容器，页面负责内容 spacing”，减少后续每做一个全宽页面都要回头绕过壳层默认边距的重复成本。
