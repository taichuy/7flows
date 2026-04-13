# 1Flowse Demo Iteration

时间：`2026-04-14 05`

## 本轮先批判什么

1. 首页的 `治理提醒` 仍是静态说明，用户看见问题，但不能直接沿着正确路径进入 `Flow / Tool / Access / Subsystem` 的处理闭环。
2. `tmp/demo` 虽然要求“依赖主组件和包”，但工程上仍主要靠本地副本；如果直接把 `../../web/packages/*` 拉进 workspace，又会把第二份 React 依赖带进来。
3. Studio 在产品语义上已经更接近真实项目，但还缺少“我为什么现在在这里、下一步去哪里”的治理链说明。
4. 移动端壳层已经压缩，但需要确认新的治理联动在手机上不会退化成又长又散的说明流。

## 本轮怎么改

### 交互与信息架构

| 区域 | 改前问题 | 本轮修正 |
| --- | --- | --- |
| 工作台治理提醒 | 只有静态文案，没有治理出口 | 改成可点击的治理闭环卡，分别直达 `Studio / Settings / Subsystems` 的聚焦上下文 |
| 行动队列抽屉 | CTA 只会跳到页面根，不会带上上下文 | 每条待办补 `actionLabel + query context`，例如 `打开发布闭环` |
| Studio | 只有节点与 Inspector，没有“当前为什么处理它” | 新增 `当前治理链`，明确来源、当前检查点、下一步和事件出口 |
| Settings / Subsystems | 页面只能手动找内容，不能从治理事件直达 | 支持 query-driven focus，访问控制和子系统缓存窗口都能直接打开正确上下文 |
| Tools | 事件详情能回跳，但外部不能直接落到具体事件 | 支持 `?incident=` 直接打开阻塞事件抽屉 |

### 工程对齐

- `tmp/demo/app/vite.config.ts`
  - 运行时源码 alias 直接切到 `../../../web/packages/*/src`
  - 增加 `react / react-dom / antd / @ant-design/icons` 的精确 alias 与 `dedupe`
  - 保证 demo 使用主仓库最新包源码，但仍复用 `tmp/demo/app/node_modules` 这一棵依赖树
- `tmp/demo/pnpm-workspace.yaml`
  - 保持本地 workspace，不再直接把 `../../web/packages/*` 拉进来
  - 直接跨根跑 workspace 会触发 React 依赖树分裂，见本轮工具记忆

## 本轮已落地改动

- `tmp/demo/app/src/features/home/HomePage.tsx`
  - `治理提醒` 改成可点击治理卡
  - 行动队列抽屉 CTA 改为具体治理动作
- `tmp/demo/app/src/features/agent-flow/AgentFlowPage.tsx`
  - 支持根据 query 预选节点
  - 新增 `当前治理链`
  - 发布检查和运行轨道支持高亮信息
- `tmp/demo/app/src/features/settings/SettingsPage.tsx`
  - 支持 `section + focus` query
  - 增加 `当前治理关注` panel
- `tmp/demo/app/src/features/embedded-apps/EmbeddedAppsPage.tsx`
  - 支持 query 打开指定子系统 drawer
  - 增加 `当前同步关注`
- `tmp/demo/app/src/features/tools/ToolsPage.tsx`
  - 支持 `incident` query 直开事件抽屉
- `tmp/demo/app/src/features/demo-data.ts`
  - 把治理链、页面 focus、事件去向统一建模
- `tmp/demo/app/src/styles/global.css`
  - 补 focus summary、高亮卡和治理 panel 样式
- `tmp/demo/app/src/app/_tests/demo-ux-regression.test.tsx`
  - 回归测试覆盖首页到 Studio 的治理跳转、访问控制直达、子系统聚焦打开

## 本轮验证

### 命令验证

- `pnpm --dir tmp/demo/app test`
  - `12 passed`
- `pnpm --dir tmp/demo/app build`
  - 通过
- `pnpm --dir tmp/demo lint`
  - 通过
- `pnpm --dir tmp/demo test`
  - 通过
- `pnpm --dir tmp/demo build`
  - 通过

### 构建结果

- 页面 chunk 继续保持拆分：
  - `HomePage-CiKvcNwu.js 4.96 kB`
  - `ToolsPage-CNm7RQDo.js 5.21 kB`
  - `AgentFlowPage-CyxUDkaB.js 5.65 kB`
  - `EmbeddedAppsPage-C5oDXch6.js 3.90 kB`
  - `SettingsPage-DXkI4NH5.js 3.01 kB`
- vendor 现状：
  - `antd-vendor-Dd57EqJC.js 799.69 kB`
  - 仍是下一轮最主要的工程优化点

### 浏览器验收

服务：

- `pnpm --dir tmp/demo/app dev -- --host 127.0.0.1 --port 3200`
  - 需提权

实际页面检查：

- 桌面端 `http://127.0.0.1:3200/`
  - `治理提醒` 已变成可点击治理闭环卡
  - `发布闭环仍缺最终确认` 可直达带 query 的 Studio
- 桌面端 `http://127.0.0.1:3200/studio?focus=release-gateway&track=callback&incident=incident-webhook`
  - 出现 `当前治理链`
  - `发布网关` 已成为当前聚焦节点
  - `前往工具台处理事件` 可直达对应阻塞事件
- 桌面端 `http://127.0.0.1:3200/tools?incident=incident-webhook`
  - 事件抽屉已自动打开到 `Webhook 回写超时`
- 移动端 `http://127.0.0.1:3200/studio?focus=release-gateway&track=callback&incident=incident-webhook`
  - 顶栏仍保持 `1Flowse + 打开导航菜单`
  - 治理链、Inspector、关联入口都能被顺序看到
- 移动端 `http://127.0.0.1:3200/subsystems?subsystem=growth-portal&focus=cache-rollout`
  - `当前同步关注` 和 `增长门户` drawer 都能直接出现

## 本轮失败与环境坑

1. 沙箱内启动 `vite` 监听 `3200` 仍然报 `listen EPERM`
   - 这是已知环境限制，处理方式仍是提权启动
2. 把 `../../web/packages/*` 直接纳入 `tmp/demo` workspace 后，`pnpm --dir tmp/demo test` 会在 `@1flowse/web` 里触发双 React 的 `Invalid hook call`
   - 原因是外部 workspace 包把 `web/node_modules` 的 React/Ant Design 依赖树一起带进了 demo
   - 处理方式：workspace 保持本地，只在 `vite.config.ts` 把源码 alias 到 `web/packages/*`
3. React 去重 alias 首次误写到 `tmp/demo/node_modules`
   - 结果导致 `react/jsx-dev-runtime` 和 build 解析失败
   - 已修正为 `tmp/demo/app/node_modules`

## 下一轮优先级

1. `antd-vendor` 仍接近 `800 kB`，需要继续拆 `icons / menu / table` 或减少重组件依赖面。
2. Studio 移动端现在逻辑通了，但信息密度仍偏高，下一轮可以把 `当前交付物 + 指标` 压成折叠区。
3. 运行时源码已经指向 `web/packages/*`，但 `tmp/demo/packages/*` 这批副本仍存在；下一轮要决定是否做更明确的“只保留壳、放弃副本”整理。
