---
memory_type: project
topic: 账户域与设置域共享二级壳层进入实施计划阶段
summary: 用户在 `2026-04-14` 当前会话要求把 `docs/superpowers/specs/1flowbase/2026-04-14-account-settings-shared-shell-design.md` 直接落成实施计划；执行入口固定为 `docs/superpowers/plans/2026-04-14-account-settings-shared-shell.md`，实施顺序冻结为“共享壳层 -> 静态子路由 -> settings 迁移 -> me 迁移与视觉回归 -> style-boundary -> 全量验证”。
keywords:
  - web
  - me
  - settings
  - shared-shell
  - plan
  - style-boundary
match_when:
  - 需要继续实现 `/me` 与 `/settings` 的共享二级壳层
  - 需要判断该专题是否已从设计阶段进入实施计划阶段
  - 需要查实施顺序、硬门禁验证或视觉基线要求
created_at: 2026-04-14 12
updated_at: 2026-04-14 12
last_verified_at: 2026-04-14 12
decision_policy: verify_before_decision
scope:
  - docs/superpowers/specs/1flowbase/2026-04-14-account-settings-shared-shell-design.md
  - docs/superpowers/plans/2026-04-14-account-settings-shared-shell.md
  - web/app/src/features/me
  - web/app/src/features/settings
  - web/app/src/shared/ui/section-page-layout
---

# 账户域与设置域共享二级壳层进入实施计划阶段

## 时间

`2026-04-14 12`

## 谁在做什么

- 用户要求把已冻结的共享二级壳层设计稿直接整理成可执行实施计划。
- AI 已产出正式计划文档，并把实施阶段的关键顺序与验证门禁沉淀到项目记忆。

## 为什么这样做

- 当前设计稿已经明确共享模板边界、section 子路由、权限可见性、移动端退化和 `/me` 视觉基线，继续停留在 spec 不会再降低实现不确定性。
- 现状代码仍是 `/me`、`/settings` 各自一套页内 state + 二级导航，且 `/me` 仍混入 `退出登录` 动作，必须用固定计划统一迁移顺序。

## 为什么要做

- 后续执行需要一个单一计划入口，避免实现过程中在 spec、代码现状和验证要求之间来回猜测。
- `/me` 本轮还有浏览器截图硬门禁，必须在计划阶段就把样式边界和视觉回归写死。

## 截止日期

- 无

## 决策背后动机

- 共享模板只放 `shared/ui`，业务 section 定义保留在各自 `features/*/lib`，可以同时保证复用和信息架构边界不混淆。
- 静态注册 section 子路由比运行时裁剪路由树更稳，能保持类型、测试和深链稳定。
- 实施顺序冻结为：
  - 先建共享 `SectionPageLayout`
  - 再接 `/me/*`、`/settings/*` 静态子路由
  - 再迁 `SettingsPage`
  - 再迁 `/me` 并做视觉收口
  - 最后补 `style-boundary`、全量验证和浏览器截图回归
- 无权限直达 section 的规则统一解释为“跳到配置顺序中的第一个可见 section”，避免设计稿 `6.4` 与 `10.1` 节措辞差异在实现时分叉。
- `/me` 的视觉基线图固定为 `uploads/image_aionui_1776142647213.png`，实现完成后必须补一张新的对比截图到 `uploads/`。

## 关联文档

- `docs/superpowers/specs/1flowbase/2026-04-14-account-settings-shared-shell-design.md`
- `docs/superpowers/plans/2026-04-14-account-settings-shared-shell.md`
