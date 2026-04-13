# 1Flowse 前端初始化阶段目录与回归规范设计稿

日期：2026-04-13
状态：已完成初稿，待用户审阅
关联输入：
- [DESIGN.md](../../../../DESIGN.md)
- [.agents/skills/frontend-development/SKILL.md](../../../../.agents/skills/frontend-development/SKILL.md)
- [.agents/skills/qa-evaluation/SKILL.md](../../../../.agents/skills/qa-evaluation/SKILL.md)
- [.agents/skills/qa-evaluation/references/frontend-quality-gates.md](../../../../.agents/skills/qa-evaluation/references/frontend-quality-gates.md)
- [web/app/src/app/router.tsx](../../../../web/app/src/app/router.tsx)
- [web/app/src/styles/global.css](../../../../web/app/src/styles/global.css)

## 1. 文档目标

本文档用于冻结 1Flowse 前端在“初始化阶段”的工程组织与回归门禁，解决两个问题：

1. 当前前端还处于 bootstrap 阶段，不能为了追求完整业务结构而过早复杂化。
2. 即使业务仍是 placeholder，也必须先把目录边界、测试归档、路由真值层和样式回归门禁立住，避免后续继续堆在 `router.tsx` 和 `global.css` 里。

本轮目标不是直接重写全部前端，也不是一次性补完权限系统，而是明确：

- 目录怎么放
- 测试文件怎么命名
- 页面 / 组件 / 样式三层分别测什么
- 初始化阶段已发现的问题如何作为后续整改输入

## 2. 当前现状

### 2.1 当前前端可运行，但仍是 bootstrap 状态

已验证事实：

- `pnpm --dir web test` 通过
- `pnpm --dir web/app build` 通过
- 当前 `style-boundary` 已有页面和组件场景
- 壳层桌面和移动端截图可正常打开

但当前页面主体仍以 placeholder 为主，说明当前阶段更适合先治理规范，而不是把业务形态当成既定成品。

### 2.2 当前主要风险不在“能不能跑”，而在边界和真值层

已识别出的结构性问题：

- `router.tsx` 同时承载导航、账户菜单、壳层装配、路由注册。
- 前端尚未接入权限 key、route guard、403/重定向链路。
- `shared-types` 中的 `AppRouteId` 已与真实路由漂移。
- `global.css` 中存在大量裸 `.ant-*` 全局覆写。
- 测试文件分布不统一，未完全收敛到 `_tests/`。
- `lint` 当前未通过，说明质量门禁还没有站稳。

## 3. 本轮已确认决策

### 3.1 总体原则

初始化阶段采用“轻结构、强门禁”的策略：

- 不追求一次性把前端目录拆成最终形态。
- 先保证页面、组件、样式三层回归可以稳定执行。
- 先建立单一真值层，再扩展页面内容和权限逻辑。

### 3.2 三层的准确含义

本轮确认的“页面 -> 组件 -> 样式调整”不是实现顺序，而是回归分层：

1. 页面层
   - 验证路由、导航、权限入口、壳层组合、关键流程状态
2. 组件层
   - 验证组件语义、交互状态、插槽和边界
3. 样式层
   - 只验证样式边界、影响面和保护性属性，不承担信息架构评审

其中“样式层”不等于“最后靠全局 CSS 修 UI”，而是专门的边界验证层。

## 4. 目录规范

初始化阶段前端目录冻结为以下结构：

```text
web/app/src/
  app/
    App.tsx
    main.tsx
    providers/
  app-shell/
    AppShellFrame.tsx
    Navigation.tsx
    AccountMenu.tsx
    _tests/
  routes/
    route-config.ts
    route-guards.tsx
    route-helpers.ts
    _tests/
  features/
    home/
      pages/
      components/
      api/
      lib/
      _tests/
    embedded-apps/
      pages/
      components/
      api/
      lib/
      _tests/
    agent-flow/
      pages/
      components/
      api/
      lib/
      _tests/
  shared/
    ui/
    utils/
    hooks/
    api/
  state/
  style-boundary/
    registry.tsx
    scenario-manifest.json
    _tests/
  styles/
    tokens.css
    globals.css
```

约束：

- `app/` 只保留应用启动、Provider 组装、入口级装配。
- `app-shell/` 只承载共享壳层和壳层级菜单，不承载 route tree。
- `routes/` 负责路由真值层：`route id / path / selected state / permission key / guard`。
- `features/*/pages` 放页面容器，`features/*/components` 放 feature 内部组件。
- `features/*/api` 放 feature 级请求消费层，例如 query key、queryFn、mutation 和当前 feature 的请求适配。
- `features/*/lib` 放 feature 内部工具，不对其他 feature 默认开放。
- `shared/ui` 放跨 feature 复用组件，不承担 app-shell 专属结构。
- `shared/utils` 只放纯函数工具，不放请求、副作用和界面组件。
- `shared/api` 只放多个 feature 共同依赖的请求编排；若只是单 feature 使用，优先留在 `features/*/api`。
- 测试文件必须进入最近的 `_tests/`。
- `style-boundary/` 只负责样式场景注册和边界回归，不负责泛 UI 质量结论。

### 4.1 组件落点规则

初始化阶段组件分三层放置：

1. `app-shell/`
   - 壳层专属组件
   - 例如顶栏、账户菜单、导航容器
2. `shared/ui/`
   - 跨 feature 复用组件
   - 例如通用卡片、状态徽标、空态、可复用表单片段
3. `features/*/components/`
   - 业务组件
   - 只服务当前 feature，不因“可能将来复用”而提前上提

规则：

- 不单独建立一个顶层 `components/` 垃圾桶目录。
- 壳层组件不放进 `shared/ui/`，避免把产品壳层误当通用组件库。
- 只有被两个以上 feature 真实复用且语义稳定后，才从 `features/*/components/` 提升到 `shared/ui/`。

### 4.2 工具类与请求层落点规则

初始化阶段工具类与 API 请求固定按两条线拆开：

1. 工具类
   - `shared/utils/`：跨域纯函数工具
   - `features/*/lib/`：feature 内部 mapper、常量整理、view model helper
2. API 请求
   - `web/packages/api-client/`：原始 API client、DTO、transport、base URL
   - `features/*/api/`：feature 级消费封装，例如 React Query 的 query key、queryFn、mutation 和数据适配
   - `shared/api/`：只有在多个 feature 共享同一请求编排时才新增

规则：

- 不把请求函数直接散落在页面文件和组件文件里。
- 不把 transport、业务 query hook 和页面映射全堆进一个顶层 `api/` 目录。
- `api-client` 负责“怎么请求”，`features/*/api` 负责“当前 feature 怎么消费请求”。
- `shared/utils` 只放无副作用纯函数；带网络请求或全局状态依赖的逻辑不进入 `utils`。

## 5. 测试文件命名

统一命名规则如下：

- 页面测试：`<feature>-page.test.tsx`
- 路由与导航测试：`navigation.test.tsx`、`route-config.test.ts`、`route-guards.test.tsx`
- 组件测试：`<ComponentName>.test.tsx`
- 样式边界测试：`<target>.boundary.test.tsx`
- API 请求消费测试：`<feature>-api.test.ts`
- 工具类测试：`<name>.test.ts`
- package 级测试也统一迁入 `src/_tests/`

示例：

- `web/app/src/features/home/_tests/home-page.test.tsx`
- `web/app/src/routes/_tests/route-config.test.ts`
- `web/app/src/app-shell/_tests/Navigation.test.tsx`
- `web/app/src/style-boundary/_tests/account-popup.boundary.test.tsx`
- `web/app/src/features/embedded-apps/_tests/embedded-apps-api.test.ts`
- `web/app/src/shared/_tests/formatRouteLabel.test.ts`
- `web/packages/embed-sdk/src/_tests/createEmbedContext.test.ts`

约束：

- 不再在 `src/` 根直接放 `App.test.tsx` 或 `index.test.ts`
- 同一测试文件只覆盖一个层级，不混写页面验证和样式边界断言

## 6. 三层回归职责

### 6.1 页面层必须测什么

页面层负责验证“用户从入口看到的真相”：

- 路由是否命中正确页面
- 导航文案、`route id`、`path`、选中态是否一致
- 页面是否挂在正确壳层中
- 权限存在时，是否发生正确的显示 / 隐藏 / 重定向 / 403
- 页面主状态：加载、空态、错误态、基础成功态
- 关键响应式：至少桌面和一个小屏场景

页面层不负责：

- 细粒度样式属性断言
- 第三方内部 slot 的保护性布局断言

### 6.2 组件层必须测什么

组件层负责验证“这个组件本身是否有清晰边界”：

- props 变体
- 状态语义
- 用户交互
- role / label / 可访问性语义
- 必要时的 slot 内容
- 是否依赖不该依赖的页面上下文或路由上下文
- 当组件位于 `shared/ui` 时，需额外验证其跨 feature 使用不会携带业务耦合

组件层不负责：

- 整页导航逻辑
- 真正的文件影响面扩散判断

### 6.3 样式层必须测什么

样式层只做边界与影响面回归：

- `theme token` 是否已覆盖通用视觉调整
- 是否优先使用 `first-party wrapper`
- `explicit slot override` 是否只命中单一明确 slot
- 保护性布局属性是否仍成立：
  - `display`
  - `position`
  - `height`
  - `min-height`
  - `line-height`
  - `padding`
  - `gap`
  - `overflow`
- `impactFiles` 是否能映射到明确场景
- 导航、壳层、共享样式改动后是否有运行时截图与场景回归

样式层不负责：

- 审美是否“高级”
- 页面信息架构是否合理

### 6.4 API 与工具层必须测什么

API 与工具层不单独作为“第四层 UI 回归”，但必须有自己的工程回归：

- `web/packages/api-client`
  - 请求函数输入输出
  - DTO 与共享类型对齐
  - base URL 和 transport 行为
- `features/*/api`
  - query key 是否稳定
  - queryFn / mutation 是否正确消费 client
  - feature 数据映射是否与页面预期一致
- `shared/utils` 与 `features/*/lib`
  - 纯函数输入输出
  - 边界值
  - 是否意外引入副作用或业务上下文依赖

规则：

- API / 工具测试以 `*.test.ts` 为主，不和页面渲染测试混写。
- 当页面层失败源头来自映射或 query key 时，应优先补 API / 工具测试，而不是把细节继续塞进页面测试。

## 7. 路由真值层规范

初始化阶段必须建立集中式路由真值层，至少包含：

- `route id`
- `path`
- 页面组件
- 导航文案
- 选中态计算规则
- `permission key`
- guard 处理方式

规则：

- 不能只改导航文案，不同步 `route id / path / selected state`
- 不能只注册路由，不维护对应导航映射
- 不能只做菜单隐藏，不接权限 key
- `shared-types` 中的 route 类型必须与真实 route config 同步

本轮不要求完成完整权限产品，但必须预留结构，不再允许“完全没有权限字段”的路由定义继续扩散。

## 8. 样式调整规范

初始化阶段允许样式调整，但必须遵守以下顺序：

1. `theme token`
2. `first-party wrapper`
3. `explicit slot override`
4. `stop`

禁止项：

- 裸写 `.ant-*`
- 跨多个第三方内部节点写后代链
- 用全局样式兜页面局部问题

如果确实需要命中第三方 slot，必须同时有：

- 自有 wrapper 作为边界锚点
- `style-boundary` 场景声明
- 真实运行证据

## 9. 当前已发现问题清单

### 9.1 Blocking / High

1. 前端路由尚未接入权限 key 与 guard 链路。
2. `global.css` 存在大量无边界裸 `.ant-*` 覆写，违反样式层门禁。

### 9.2 Medium

1. `router.tsx` 已承载导航、账户菜单、壳层和 route tree，职责过宽。
2. 路由真值层分裂，`shared-types` 已与真实路由漂移。
3. 测试归档不统一，部分测试未进入 `_tests/`。
4. `lint` 当前失败，Testing Library 规则和 Fast Refresh 边界未收口。

### 9.3 Low

1. 页面主体仍以 placeholder 为主，导航中文与页面英文内容混用。
2. 构建主包偏大，后续页面继续增长前应考虑分包。

## 10. 验收门禁

当初始化阶段前端继续推进时，至少满足以下门禁才算通过：

1. `pnpm --dir web lint` 通过
2. `pnpm --dir web test` 通过
3. `pnpm --dir web/app build` 通过
4. 导航 / 壳层 / 全局样式改动后，至少运行一次 `style-boundary` 场景回归
5. 新增测试文件进入对应 `_tests/`
6. 新增路由必须进入集中式 route config，而不是在页面文件或壳层文件里散注册

## 11. 实施顺序建议

后续实现建议按以下顺序推进：

1. 先拆出 `routes/` 真值层与 `app-shell/`
2. 再整理测试归档与命名
3. 再收束 `global.css` 到 token / wrapper / slot 三层
4. 最后补权限 guard 和 route meta

这样可以先把基础秩序立住，再做功能接入，避免边做业务边返工目录和门禁。
