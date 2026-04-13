# 1Flowse Demo Iteration

时间：`2026-04-14 06`

## 本轮先批判什么

1. 当前 demo 虽然已经把 `Flow / Publish / Runtime / State` 讲出来了，但仍然更像一组平铺页面，缺少“团队工作台 -> 应用容器 -> 应用工作区”的层级。
2. 工作台没有把 `Application` 作为交付单元明确展示，和 `docs/superpowers/specs/1flowse/modules/03-workspace-and-application/README.md` 中“应用列表是工作台核心内容”的基线不一致。
3. App 内页面缺少稳定的应用上下文，用户进入 `流程编排 / 子系统 / 工具 / 设置` 后，很难立刻判断“我现在在哪个应用里、当前交付物是什么、下一步去哪”。
4. 浏览器截图第一次抓到的还是懒加载占位态，说明当前截图验收如果不等关键节点出现，会误判页面质量。

## 这轮判断

- 主要问题是**信息架构没有把应用容器讲清楚**，不是简单继续堆卡片或换文案。
- 这轮应该优先补 `Application` 这一层，把工作台与 app 内页面的关系拉直；否则 demo 仍会偏“控制台宣传稿”，不够像当前项目。
- 移动端现在还能读，但从截图上看，`流程编排` 第一屏仍偏重说明和交付摘要，真正核心内容还在更下方；这属于下一轮继续压缩的重点。

## 本轮怎么改

### 信息架构修正

| 区域 | 改前问题 | 本轮修正 |
| --- | --- | --- |
| 工作台 | 只有指标、待办和入口，没有应用容器 | 新增 `应用列表`，把应用名称、负责人、最近更新、最近访问和发布状态拉回首页主区 |
| 工作台到 app | 首页只能跳页，缺少当前交付容器语义 | 新增 `应用工作区` 面板，明确当前应用、当前 Flow、发布入口、状态模型和最近 revision |
| App 内页面 | 用户不知道当前页面属于哪个 app | 在 `流程编排 / 子系统 / 工具 / 设置` 统一加入 `当前应用工作区` 区块 |
| App 导航语义 | 原来只有顶栏一级路由，app 级结构不明显 | 新增 `应用概览 / 流程编排 / 发布接口 / 调用日志 / 监控报表 / 子系统 / 设置` 工作区导航带 |

### 已落地改动

- `tmp/demo/app/src/features/demo-data.ts`
  - 新增应用容器、当前应用工作区和 app 级导航 mock 数据
- `tmp/demo/app/src/shared/ui/ApplicationWorkspacePanel.tsx`
  - 新增共享应用工作区组件
- `tmp/demo/app/src/features/home/HomePage.tsx`
  - 新增 `应用列表`
  - 支持打开应用详情 drawer
  - 首页加入 `应用工作区` 面板
- `tmp/demo/app/src/features/agent-flow/AgentFlowPage.tsx`
- `tmp/demo/app/src/features/embedded-apps/EmbeddedAppsPage.tsx`
- `tmp/demo/app/src/features/tools/ToolsPage.tsx`
- `tmp/demo/app/src/features/settings/SettingsPage.tsx`
  - 四个 app 内页面统一接入 `应用工作区` 面板
- `tmp/demo/app/src/styles/global.css`
  - 新增应用工作区和应用列表的样式，并补移动端折叠规则
- `tmp/demo/app/src/app/_tests/demo-ux-regression.test.tsx`
  - 回归测试补覆盖工作台应用容器和 app 内工作区导航

## 本轮验证

### 命令验证

- `pnpm --dir tmp/demo/app lint`
  - 通过
- `pnpm --dir tmp/demo/app test`
  - `14 passed`
- `pnpm --dir tmp/demo/app build`
  - 通过
- `pnpm --dir tmp/demo lint`
  - 通过
- `pnpm --dir tmp/demo test`
  - 通过
- `pnpm --dir tmp/demo build`
  - 通过

### 构建结果

- `HomePage-DJNg1oCS.js 7.73 kB`
- `AgentFlowPage-8Bxc4vF5.js 5.69 kB`
- `ToolsPage-Bi6mOe5P.js 5.26 kB`
- `EmbeddedAppsPage-C9Wcm97R.js 3.95 kB`
- `SettingsPage-DYBd1RWB.js 3.08 kB`
- `antd-vendor-Dd57EqJC.js 799.69 kB`
  - 仍然是下一轮最主要的工程风险

### 浏览器验收

服务：

- `pnpm --dir tmp/demo/app dev -- --host 127.0.0.1 --port 3200`
  - 提权后成功启动

Playwright 截图：

- `tmp/demo/notes/screenshots/2026-04-14-06-home-desktop.png`
- `tmp/demo/notes/screenshots/2026-04-14-06-studio-desktop.png`
- `tmp/demo/notes/screenshots/2026-04-14-06-studio-mobile.png`

页面观察：

- 工作台桌面端现在能直接看到 `应用列表` 和 `应用工作区`，应用容器已经比前几轮更靠近主位
- `流程编排` 桌面端新增的 app 级导航带已经能把 `应用概览 / 流程编排 / 发布接口 / 调用日志 / 监控报表 / 子系统 / 设置` 连成一条稳定工作区
- `流程编排` 移动端没有崩，但首屏仍偏重 hero + 当前交付物 + 应用工作区，核心执行链路需要继续上提

## 本轮失败与环境坑

1. Playwright 首次截图直接抓到了 `正在加载页面模块...`
   - 原因：路由采用懒加载，CLI 在 chunk 和页面内容真正就绪前就开始截图
   - 处理：改为 `--wait-for-selector` + `--wait-for-timeout`
2. Playwright 桌面截图在未提权时仍然会因为 Chrome `setsockopt: Operation not permitted` 退出
   - 这是已知环境限制
   - 处理：继续使用提权截图链路

## 下一轮优先级

1. 移动端 `流程编排` 首屏仍然偏重摘要，需要继续把 `执行链路` 上提，减少说明区高度。
2. 顶部一级导航和 app 级工作区导航现在都存在，虽然已经更清楚，但仍有“双导航”感；下一轮可以继续压缩一级导航表达。
3. `antd-vendor` 仍接近 `800 kB`，继续拆重组件和图标依赖。
