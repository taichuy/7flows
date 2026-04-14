---
memory_type: project
topic: `/me` 与设置页统一抽象边界评估
summary: 已完成 `/me` 与设置页二级壳层评估；建议抽共享“侧栏 + 内容”页面模板与导航组件，但不要把 `/me` 直接并入 `设置` 信息架构。推荐后续把二级导航改为可直达子路由，并把 destructive action 从 section 导航中分离。
keywords:
  - web
  - me
  - settings
  - shell
  - sidebar
  - information-architecture
match_when:
  - 需要继续重构 `/me` 或 `设置` 页面布局
  - 需要决定账户域与管理域是否共用二级壳层
  - 需要设计共享 sidebar page template
  - 需要把 section 子路由与权限可见性绑定
created_at: 2026-04-14 11
updated_at: 2026-04-14 11
last_verified_at: 2026-04-14 11
decision_policy: verify_before_decision
scope:
  - web/app/src/features/me
  - web/app/src/features/settings
  - web/app/src/routes
---

# `/me` 与设置页统一抽象边界评估

## 时间

`2026-04-14 11`

## 谁在做什么

- 用户提出：`/me` 页面布局和侧边栏样式适合抽成统一模板，想评估是否也应承载设置页。
- AI 已完成当前代码与既有设计约束核对，给出抽象边界建议。

## 为什么这样做

- `web` 当前 `MePage` 和 `SettingsPage` 都位于同一个控制台壳层内，但各自实现了一套二级导航与内容布局。
- 如果继续分别演进，后续样式、响应式、选中态和导航规则会继续漂移。

## 为什么要做

- 需要统一账户域与管理域的二级页面骨架，减少重复布局代码和样式漂移。
- 同时要保留信息架构边界：`/me` 属于个人动作入口，`设置` 属于管理域入口，不应因为共用模板而混成同一导航树。

## 截止日期

- 无

## 决策背后动机

- 推荐抽象层级是共享“二级侧栏页面壳层”与“侧栏导航组件”，而不是直接把 `/me` 页面整体迁入 `设置`。
- 用户已确认统一方向：
  - 只抽共享封装组件，不合并 `/me` 与 `设置` 的信息架构
  - section 从页内 `useState` 改为子路由
  - 侧栏内容由调用方传入，模板不内建固定 section
  - 模板支持轻量分组，但第一版不做复杂视觉
  - 模板放 `shared/ui`，业务 section 配置留在各自 feature
  - 模板支持页级标题和 section 级标题两层，但视觉层级不能同时过重
  - 桌面端固定左栏，移动端退化为顶部 `Segmented/Tabs` 或 `Drawer`
  - 不可见 section 直接隐藏；当前 URL 无权限时跳转到第一个可见 section；全部不可见时显示正式空态
  - `/me` 里的 inline style 本轮顺手收口为模板 class + token，但视觉效果保持一致
  - section 路由与权限点绑定，后续采用动态子路由/受控子路由方式统一处理
- `/me` 当前 sidebar 同时承载 section 切换和 `退出登录` 这类 destructive action，后续抽象时应拆成：
  - section 导航
  - footer/action 区
- 推荐后续把二级 section 状态从页面内部 `useState` 收口到子路由或可直达 URL，避免刷新丢状态、无法深链。
- 共享模板应只负责：
  - 左侧导航骨架
  - 内容区宽度与响应式
  - 统一选中态与 danger/action 样式
- 共享模板不负责：
  - `me` 和 `settings` 的数据请求
  - 权限判断
  - 表单与管理面板业务逻辑
