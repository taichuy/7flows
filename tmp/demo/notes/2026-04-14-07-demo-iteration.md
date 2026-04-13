# 1Flowse Demo Iteration

时间：`2026-04-14 07`

## 本轮先批判什么

1. 工作台直接展示完整 `应用工作区` 导航，会把团队工作台和应用内部工作区混在同一层，用户还没进入应用就先看见应用内导航，层级不顺。
2. 顶部一级导航现在仍然直接暴露 `流程编排 / 子系统`，而页面内部又有一套 `应用工作区` 导航，导致“我是在控制台导航，还是在应用里导航”不够清楚。
3. `流程编排` 移动端首屏仍然先消耗在 hero 说明和交付摘要上，真正的执行链路没有优先进入用户视线。
4. 当前 demo 已经能讲清 `Flow / Publish / Runtime / State`，但还缺一个稳定的 `应用概览` 落点，导致工作台到 Studio 的跳转过于直接，不像真实产品的应用容器。

## 这轮判断

- 这轮核心问题是**信息深度与导航层级**，不是再多加卡片或再换一轮文案。
- `Application` 应该成为工作台进入后的稳定容器，所以需要一个正式的 `应用概览` 页，而不是让首页直接长出一整套应用内导航。
- 一级导航要压缩成控制台层级，应用内导航继续保留，但必须变成明显的次级导航。
- `流程编排` 首屏要优先让位给执行主线，交付摘要改成更轻量的表达。

## 本轮计划

1. 先补失败测试，覆盖 `当前应用` 一级导航、`应用概览` 路由和工作台入口变化。
2. 新增 `应用概览` 页面，把工作台进入应用后的默认落点补齐。
3. 重做 `应用工作区` 组件，让它从卡片墙改成更紧凑的次级导航。
4. 调整工作台和 `流程编排` 页面，去掉首页的完整应用导航，并压缩 `流程编排` 首屏摘要。
5. 跑 `lint / test / build`，再启动 3200 端口做浏览器验收并补本轮结论。

## 本轮已落地改动

- `tmp/demo/app/src/app/router.tsx`
  - 一级导航压缩为 `工作台 / 当前应用 / 工具 / 设置`
  - 新增 `/application` 作为稳定应用落点
  - `studio / subsystems` 统一归到 `当前应用` 一级导航
- `tmp/demo/app/src/features/application/ApplicationOverviewPage.tsx`
  - 新增正式 `应用概览` 页
  - 页面只保留一个主入口 `进入编排`
  - 主体收敛为 `基本信息 / 发布状态 / 当前治理焦点 / 交付边界`
- `tmp/demo/app/src/features/home/HomePage.tsx`
  - 首页 CTA 改为 `进入当前应用`
  - 移除首页的完整 `应用工作区` 导航
  - 新增 `当前交付应用` 摘要卡，工作台只表达“当前应用是什么”，不提前表达应用内导航
- `tmp/demo/app/src/shared/ui/ApplicationWorkspacePanel.tsx`
  - 导航从卡片墙改成紧凑次级导航
  - 保留应用上下文与状态，但明显降低和一级导航的竞争关系
- `tmp/demo/app/src/features/agent-flow/AgentFlowPage.tsx`
  - `流程编排` hero 去掉右侧交付摘要
  - 顶部指标改为更轻量的 `当前编排摘要`
  - 移动端继续压缩文案和摘要密度
- `tmp/demo/app/src/features/demo-data.ts`
  - `应用概览` 链接切到 `/application`
  - 当前应用抽屉 CTA 改为 `进入应用概览`
- `tmp/demo/app/src/app/_tests/app-demo.test.tsx`
- `tmp/demo/app/src/app/_tests/demo-ux-regression.test.tsx`
  - 先补失败测试，再把新导航语义、`应用概览` 路由和首页层级写进回归覆盖

## 本轮验证

### 命令验证

- `pnpm --dir tmp/demo/app test -- src/app/_tests/app-demo.test.tsx src/app/_tests/demo-ux-regression.test.tsx`
  - 首轮按预期失败，失败点集中在 `当前应用` 一级导航、`进入当前应用` CTA 和 `/application` 路由缺失
  - 实现完成后重跑通过，`15 passed`
- `pnpm --dir tmp/demo lint`
  - 通过
- `pnpm --dir tmp/demo test`
  - 通过
- `pnpm --dir tmp/demo build`
  - 通过

### 构建结果

- `dist/assets/ApplicationOverviewPage-DTAiHLiE.js 2.90 kB`
- `dist/assets/AgentFlowPage-K0qyX9E6.js 5.59 kB`
- `dist/assets/HomePage-5fVe0_mR.js 9.56 kB`
- `dist/assets/index-BYnMQY3q.js 9.47 kB`
- `dist/assets/antd-vendor-Dd57EqJC.js 799.69 kB`
  - 仍然是下一轮最主要的工程风险

### 浏览器验收

服务：

- `pnpm --dir tmp/demo/app dev -- --host 127.0.0.1 --port 3200`
  - 需要提权

Playwright 截图：

- `tmp/demo/notes/screenshots/2026-04-14-07-home-desktop.png`
- `tmp/demo/notes/screenshots/2026-04-14-07-application-desktop.png`
- `tmp/demo/notes/screenshots/2026-04-14-07-studio-desktop.png`
- `tmp/demo/notes/screenshots/2026-04-14-07-studio-mobile.png`

页面观察：

- 工作台桌面端现在先看到 `当前交付应用`，不再在首页直接出现完整应用内导航，层级比上一轮顺。
- 一级导航压缩成 `工作台 / 当前应用 / 工具 / 设置` 后，`流程编排` 不再和应用内导航同层竞争，双导航感明显下降。
- `应用概览` 已经成为稳定 app 落点，和 `docs/superpowers/specs/1flowse/modules/03-workspace-and-application/README.md` 中“应用是交付容器”的基线一致。
- `流程编排` 桌面端的执行链路已经比上一轮更靠前；移动端首屏也变轻了，但**执行链路仍然没有完全进入第一屏**，这仍是下一轮优先级第一的问题。

## 本轮失败与环境坑

1. 直接写 `Link to=\"/studio?...\"` 这类带 query 的字面量后，`pnpm --dir tmp/demo build` 会在 `@tanstack/react-router` 的路径字面量校验里失败。
   - 原因：`to` 会被推断成纯路径联合类型，不接受带 query 的字面量。
   - 处理：改成显式 `string` 变量后再传给 `Link`。
   - 后续避免：带 query 的 `Link` 不要直接把完整 URL 字面量塞进 `to`。
2. Playwright 并发截图时，如果三条命令都要提权，客户端可能只放行其中一条，剩余命令会被拒绝。
   - 原因：并发提权冲突，不是页面报错。
   - 处理：截图改为串行执行。
   - 后续避免：需要提权的浏览器截图不要并发发起。
3. 截图中途 `vite dev` 进程退出后，Playwright 会直接报 `ERR_CONNECTION_REFUSED`。
   - 原因：3200 端口已经没有监听进程。
   - 处理：先重启 dev server，再补截图。
   - 后续避免：浏览器验收前后都检查一次 3200 端口监听状态。

## 下一轮优先级

1. `流程编排` 移动端第一屏仍然没有把 `执行链路` 抬到足够靠前的位置，需要继续压缩应用工作区摘要或做可折叠策略。
2. `antd-vendor` 仍接近 `800 kB`，需要继续拆重组件或收窄依赖面。
3. `工具 / 设置` 页面虽然保留了应用上下文，但和一级导航之间仍有少量语义重叠，后续可以继续收紧控制台层和应用层的边界。
