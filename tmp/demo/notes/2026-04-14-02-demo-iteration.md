# 1Flowse Demo Iteration

时间：`2026-04-14 02`

## 本轮先批判什么

1. 移动端壳层仍然把导航、健康状态、账户块同时放在首屏，用户进入页面先看到“壳”而不是“内容”。
2. 工作台把“要做的事”和“已经发生的事”重复塞进同一层，`待处理事项` 与 `最近运行` 用了同一份数据，信息深度混叠。
3. 工具页虽然已经从主导航里收口，但页面主位仍被接口表格占住，缺少真正的事件过滤、收口顺序和 L1 详情抽屉。
4. Demo 里仍有部分英文实体名和沙盒副本包，说明 UI 已经比主应用更清晰，但工程同步策略还没完全收口。

## 本轮怎么改

### 信息架构修正

| 区域 | 改前问题 | 本轮修正 |
| --- | --- | --- |
| 移动端壳层 | 首屏先看到完整导航 + 健康 + 账户 | 改成 `品牌 + 菜单按钮`，健康和账户信息收入导航抽屉 |
| 工作台 | 行动和历史重复展示 | 拆成 `行动队列` 与 `最近运行` 两个稳定区块 |
| 工具页 | API 表格抢主位，没有事件流程 | 固定为 `事件队列 + 过滤栏 + L1 抽屉 + 接口面摘要` |

### 已落地改动

- 壳层：
  - 在 `tmp/demo/app/src/app/router.tsx` 加了移动端导航抽屉。
  - 顶部桌面端继续保留水平导航；移动端只保留 `打开导航菜单` 按钮。
- 工作台：
  - `tmp/demo/app/src/features/home/HomePage.tsx` 重新拆成 `行动队列 / 常用入口 / 最近运行 / 治理提醒`。
  - 新增 `homeActionQueue` mock 数据，不再和 `demoRuns` 共用同一份列表。
- 工具页：
  - `tmp/demo/app/src/features/tools/ToolsPage.tsx` 改为事件处理中枢。
  - 新增按状态筛选、按关键词搜索、事件详情抽屉。
  - 接口面从主表降级为辅助摘要卡。
- 语义收口：
  - `tmp/demo/app/src/features/demo-data.ts` 补了 `statusLabel / badge / incident` 等结构。
  - 流程编排、子系统页的状态标签改成中文产品语义，不再直接露出 `running / ready / draft`。
- 样式：
  - `tmp/demo/app/src/styles/global.css` 重写了移动端 header 规则，并补了事件队列、接口摘要、抽屉入口等样式。

## 本轮验证

### 命令验证

- `pnpm --dir tmp/demo/app test -- --runInBand`
- `pnpm --dir tmp/demo lint`
- `pnpm --dir tmp/demo test`
- `pnpm --dir tmp/demo build`

结果：

- 测试全部通过：`9 passed`
- workspace lint 通过
- workspace build 通过
- 当前主包降到 `dist/assets/index-u2NBK8E5.js 1,148.28 kB`
  - 仍有 Vite chunk warning，但比上一轮 `1,380.71 kB` 更收敛

### 浏览器验收

- 服务器：
  - `pnpm --dir tmp/demo/app exec vite --host 127.0.0.1 --port 3200`
- 页面检查：
  - `http://127.0.0.1:3200/` 桌面端：工作台可见 `行动队列`、`最近运行`、`常用入口`
  - `http://127.0.0.1:3200/` 移动端：header 已收敛为 `1Flowse + 打开导航菜单`
  - `http://127.0.0.1:3200/tools` 桌面端：工具页出现 `事件队列`、状态筛选、搜索框、详情抽屉
- 本轮浏览器检查使用了本机 Chrome DevTools 页面快照，不是图片证据

## 本轮失败与环境坑

### Playwright 截图未完成

这轮按约定优先尝试 Playwright 截图，但失败了两次：

1. 默认 `playwright screenshot` 命中缺失的 Playwright 内置浏览器缓存。
2. 显式改走系统 Chrome 后，在未提权场景仍报 `setsockopt: Operation not permitted`。
3. 提权截图请求本轮未被放行，因此没有生成新的 `notes/screenshots/*-2026-04-14-02.png`。

处理结论：

- 本轮只能退回 Chrome DevTools 页面快照继续做无图验收。
- 对应失败和替代路径已经补进：
  - `.memory/tool-memory/playwright/2026-04-13-use-local-chrome-for-screenshots.md`

## 下一轮优先级

1. 工具页移动端仍偏“表格思维”，下一轮应给 `< md` 做 stacked event cards，而不是继续挤压列。
2. `Security / Platform Ops / Growth Systems` 这类实体名仍是英文，下一轮要么统一平台命名规范，要么给 demo 做对外语义映射。
3. `tmp/demo/packages/*` 仍是沙盒副本，不是直接复用 `web/packages/*`；如果主仓库 UI 包再演进，demo 还会漂移。
4. 当前包体仍过大，下一轮优先考虑按路由做拆包，至少把 `studio` 和 `tools` 从首页首包里拆出去。
