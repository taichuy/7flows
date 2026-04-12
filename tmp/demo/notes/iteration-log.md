# Demo Iteration Log

## 2026-04-13 05:13

### 本轮批判

- 桌面端 hero 上一版虽然已经补了 signal cards，但这些卡片本质上还是静态摘要，不是真正的问题域入口；hero 左侧因此继续显得偏空。
- `overview` 把 `进入编排 / 查看 API 契约 / 继续处理等待态` 平铺成同一层按钮，会把主动作和二级处理路径混在一起。
- hero 下方那排数字摘要卡仍然太像通用 dashboard，和当前 demo 要表达的“workspace 现状与问题路径”不完全一致。

### 本轮执行

- 新增诊断记录：
  - `tmp/demo/notes/2026-04-13-0513-overview-focus-lanes.md`
- 先写测试，把 `overview` 的目标改成：
  - hero 只保留一个主 CTA `进入编排`
  - hero 右侧必须出现 `当前焦点`
  - 从当前焦点可直接跳到 `API / Logs / Monitoring`
- 将 hero 右侧从静态 `signal cards` 重构为 `当前焦点` 面板，收纳三条二级路径：
  - `查看发布面`
  - `打开 backlog`
  - `检查 host gap`
- 删除 `overview` 原来的数字摘要行，避免继续堆抽象 stat cards。
- 保留 `最近运行摘要 / Published 与 Draft 明确分层 / 真实路由成熟度 / Embedded runtime snapshot` 作为概览页主内容。

### 测试与验证

- `npm test`：通过，`4` 个测试全部通过。
- `npm run build`：通过，产物为：
  - `dist/assets/index-CXUcp2M5.css` `13.69 kB`
  - `dist/assets/react-Bxqk-rQc.js` `106.54 kB`
  - `dist/assets/index-13k-oK7R.js` `437.48 kB`
  - `dist/assets/antd-FPCx2csc.js` `466.01 kB`
- `npm run preview`：提权后成功监听 `http://127.0.0.1:3200/`。
- Playwright 截图成功：
  - `tmp/demo/desktop-2026-04-13-0510.png`
  - `tmp/demo/mobile-2026-04-13-0510.png`

### 本轮结论

- `overview` 现在更像真正的 workspace 入口，二级路径已经从“平铺按钮”收束成“问题域焦点”。
- 移动端首屏仍然保持一个主 CTA，但已经能同时看到三个明确的后续处理入口。
- 桌面端 hero 空白问题被削弱了，但还没有完全消失；下一轮重点不该是继续加块，而是进一步压缩焦点文案或引入更具体的可视化内容。

### 工具复盘

1. `vitest` 不支持 `--runInBand`
   - 这次把 `jest` 风格参数误带到了 `npm test`，CLI 直接报 `Unknown option --runInBand`。
   - 后续在 `tmp/demo` 里跑测试应直接使用 `npm test`，不要附加该参数。
2. `tmp/demo` 内不存在 `../../web/node_modules/.bin/playwright`
   - 这次先假设 Playwright 跟 `vite/vitest` 一样复用 `web/node_modules`，结果命令报 `没有那个文件或目录`。
   - 当前机器上可用的 Playwright CLI 仍是 `/home/taichu/git/AionUi/node_modules/.bin/playwright`；后续截图应直接用这个路径。

## 2026-04-13 03:13

### 本轮批判

- 移动端顶部任务域切换还是横向胶囊，`监控报表` 在首屏被截断，用户一眼看不全五个任务域。
- overview hero 里的 `Published / Runtime healthy` 被 grid 拉成整条色块，看起来像进度条，不像状态标签。
- 概览首屏只有“进入编排”一个动作，已发布契约和等待态 run 都需要继续往下滚才能处理，首屏操作性偏弱。

### 本轮执行

- 在 `overview` hero 增加两个次级跳转：
  - `查看 API 契约`
  - `继续处理等待态`
- 保持“进入编排”仍是唯一主动作，但把关键下一跳也前置到首屏。
- 把 hero 标题压缩成 `Revenue Copilot` + `Workspace demo` 标签，收短首屏文案。
- 把 hero 右侧改成紧凑 badge + signal cards，去掉会在移动端被拉满宽度的状态条式布局。
- 将移动端任务域切换改为 sticky 两列网格，确保五个任务域入口都能在首屏看见。
- 同步缩短 `summary stats` 文案，减少概览卡片高度。
- 新增诊断记录：
  - `tmp/demo/notes/2026-04-13-0313-mobile-first-tightening.md`

### 测试与验证

- `npm test`：通过，`3` 个测试全部通过。
- `npm run build`：通过，产物为：
  - `dist/assets/index-CSS6-m2t.css` `12.98 kB`
  - `dist/assets/react-Bxqk-rQc.js` `106.54 kB`
  - `dist/assets/index-DV0OpEea.js` `437.69 kB`
  - `dist/assets/antd-FPCx2csc.js` `466.01 kB`
- `vite preview --host 127.0.0.1 --port 3200 --strictPort`：沿用已启动预览继续验证。
- Playwright 截图成功：
  - `tmp/demo/mobile-after.png`
  - `tmp/demo/desktop-after.png`

### 本轮结论

- 移动端首屏终于从“能滚动切页”变成了“直接可切页”，这轮最核心的问题已经解决。
- overview 首屏现在更像一个真正的 workspace 入口，而不是只有一个 CTA 的介绍块。
- 桌面端 hero 仍有明显空白区，说明下一轮不该继续加 badge，而要把这块换成更有业务语义的 feed 或 canvas 摘要。

## 2026-04-13 02:12

### 本轮批判

- `overview` 上一版仍然混入“为什么要 React 化 / 本轮建议”这类实现说明，偏离了工作区 `L0` 概览页应该只讲当前状态、最近运行摘要和唯一主入口的 recipe。
- 桌面端的左侧栏和主内容都在重复讲 `repo 现状 / 本轮批判 / 下轮方向`，信息没有做到互斥，导致页面看起来像“笔记墙”而不是 workspace。
- 移动端虽然已经把主内容放前，但任务域切换仍然主要依赖后置 sidebar；用户浏览完第一屏后，切页入口还是不够靠前。
- 当前 build 仍然只有 `react / antd / app` 三大块，主 app chunk 已涨到 `434.52 kB`，继续堆页面文案和状态会让 demo 很快变钝。

### 本轮执行

- 新增 `tmp/demo/notes/2026-04-13-0203-demo-critique-and-plan.md`，把这轮的信息架构诊断和改造计划固定下来。
- 按测试先行把 `overview -> logs drawer` 的新行为锁定下来：概览页必须出现“最近运行摘要”，并能直接带用户进入日志页查看等待态 run。
- 重构 `overview`，删掉“为什么这轮要 React 化 / 本轮建议”，改成：
  - `最近运行摘要`
  - `Published 与 Draft 明确分层`
  - `真实路由成熟度`
  - `Embedded runtime snapshot`
- 收缩 `WorkspaceLayout` 的 sidebar，只保留身份、导航和 `workspace capsule`，不再重复堆放批判、现状和下轮方向。
- 补了移动端顶部任务域切换条；在小屏下隐藏 sidebar 导航，避免必须滚到后面才能换页。
- 给日志页主标题补了可访问 heading，使跨页跳转后的测试与语义更稳定。

### 测试与验证

- `npm test`：通过，`2` 个测试全部通过。
- `npm run build`：通过，产物为：
  - `dist/assets/index-DXqE0ui5.css` `11.78 kB`
  - `dist/assets/react-Bxqk-rQc.js` `106.54 kB`
  - `dist/assets/index-BM-gct2J.js` `434.52 kB`
  - `dist/assets/antd-FPCx2csc.js` `466.01 kB`
- `vite preview --host 127.0.0.1 --port 3200 --strictPort`：提权后成功监听 `http://127.0.0.1:3200/`。
- Playwright：
  - 移动端截图成功：`uploads/1flowse-demo-2026-04-13-mobile.png`
  - 桌面端提权截图申请被拒绝；随后在沙箱内直接运行系统 Chrome 截图失败，报 `setsockopt: Operation not permitted`，因此本轮没有拿到新的桌面截图。

### 本轮结论

- demo 的 `overview` 已经更像真正的 workspace 概览页，而不是实现说明页。
- 移动端首屏现在能直接看到任务域切换、状态和唯一主入口，交互路径明显更短。
- sidebar 的职责已经收紧，但桌面端还缺一次新的截图验证，不能对桌面视觉细节做过度乐观结论。

### 下轮入口

- 优先继续处理构建体积，至少考虑把五个任务域按路由懒加载，而不是继续把内容塞进单一 app chunk。
- 如果后续能拿到桌面截图权限，先复查桌面端是否仍然存在“主内容太像文档板块”的问题，再决定是否继续减字。
- 可以考虑把 `workspace capsule` 和 `overview` 共用的一部分摘要提炼成真正的 workspace primitive，为后续迁移到 `web/app` 做准备。

## 2026-04-13 01:35

### 本轮批判

- 上一版 `tmp/demo` 虽然把五个任务域和跨视图跳转讲清楚了，但仍然是静态原型，不符合“参考 `web/` 依赖、固定 `3200` 端口”的目标。
- 侧栏与概览页同时展开同一批 repo 现状，信息重复感偏强，桌面和移动端都显得啰嗦。
- 移动端首轮截图暴露出一个更严重的问题：首屏先看到的是侧栏，而不是当前任务域主内容，违背了 `workspace-rules.md` 的小屏降级要求。
- 直接引用 `web/` 现有依赖时，`tmp/demo` 不是 workspace 子包，导致 TypeScript、Vitest、Vite 对模块和类型都不会自动继承，需要额外桥接。

### 本轮执行

- 把 `tmp/demo` 重构成 `React + Vite + Ant Design + TanStack Router + Zustand` 的独立 demo 项目。
- 删除旧的 `script.js / demo-data.js / styles.css` 静态模板，实现 `overview / orchestration / api / logs / monitoring` 五个视图。
- 引入真实 workspace 依赖与包能力：复用 `web` 中已有前端依赖，并直接使用 `api-client / embed-sdk / embedded-contracts / page-protocol` 源码导出的类型与方法。
- 加入稳定的 `Run Drawer`、`Node Inspector`、跨页状态跳转和 mock 数据单一事实源。
- 通过重新组织 DOM 顺序与桌面 `grid-area`，把移动端结构改成“主内容优先、侧栏后置”的语义布局。
- 把构建产物拆成 `react / antd / app` 三个主要 chunk，避免所有依赖继续挤在单一 bundle。

### 测试与验证

- `npm test`：通过，`2` 个测试全部通过。
- `npm run build`：通过，输出 `react / antd / app` 三个主要 JS chunk。
- `vite preview`：已在提权后成功监听 `127.0.0.1:3200`。
- Playwright：已成功产出
  - `tmp/demo/desktop.png`
  - `tmp/demo/mobile.png`
  - `tmp/demo/mobile-pixel5.png`

### 本轮结论

- demo 已从静态稿升级成真正可运行、可测试、可构建的前端项目。
- 桌面端结构已经比较稳定，当前更明显的改进方向转向：进一步减少侧栏与概览页的重复信息。
- 移动端在普通缩窗截图里仍容易看到桌面浏览器语义干扰；使用 `Pixel 5` 设备模拟时，主内容优先顺序已经符合预期。

### 下轮入口

- 优先继续压缩侧栏信息密度，把“项目现状”和“本轮批判”合并成更短的摘要块。
- 若要继续提升 bundle 结构，可把五个视图进一步懒加载，而不是只做 vendor chunk 切分。
- 如果后续要把这套 demo 往正式 `web/app` 迁移，应先抽出 workspace primitives，而不是直接复制页面。

## 2026-04-13 00:05

### 本轮批判

- `tmp/demo` 现状仍偏浅色工作台，和当前仓库 `DESIGN.md` 的深色控制台方向不一致。
- demo 主要在演示 application workspace，但没有把当前仓库真实已有的 `Home / AgentFlow / Embedded Apps / Embedded Mount` 路由现实纳入叙事，容易脱离项目现状。
- 现有交互主要是切页、选节点、打开抽屉，跨任务域跳转偏弱，没把 `overview -> orchestration -> api/logs/monitoring` 的路径讲清楚。
- HTML 与 JS 同时保存 run / node 文案，后续继续迭代很容易失同步。
- 用户要求参考的 `dcos/` 本地未找到；本轮实际参考源切换为 `DESIGN.md`、`../dify`、`../xyflow` 与当前 `web/` 路由结构。
- Skill / 文档层存在漂移：`.agents/skills/frontend-development/references/visual-baseline.md` 仍强调浅色高对比，但当前仓库 `DESIGN.md` 已切到深色控制台主线。本轮只记录，不在 `tmp/demo` 外修。

### 本轮执行

- 把 demo 改成深色控制台壳层，统一 shell / editor 状态语义。
- 用单一 JS 数据源渲染 `overview / orchestration / api / logs / monitoring`，去掉双份文案来源。
- 增加真实跨视图交互：节点跳 API / Logs，Monitoring hotspot 跳 Logs，Overview CTA 跳编排。
- 在 overview 明确补入当前仓库现状，展示 `AgentFlow / Embedded Apps / Mount` 的当前成熟度。

### TDD 说明

- `tmp/demo` 属于视觉原型 / throwaway prototype，本轮不做正式 TDD。
- 收尾时至少做 `node --check tmp/demo/script.js` 与本地资源级验证，避免无效完成声明。

### 验证阻塞

- `node --check tmp/demo/script.js` 已通过。
- Playwright CLI 存在于 `/home/taichu/git/AionUi/node_modules/.bin/playwright`，但当前机器缺少对应浏览器二进制，截图验证失败。
- 失败原因不是 demo 代码本身，而是 `~/.cache/ms-playwright/` 下没有已安装浏览器。
- 后续若还要用 Playwright 做截图，应该先在允许联网或已缓存浏览器的环境里执行 `playwright install`，避免重复卡在这一步。

### 下轮入口

- 若继续迭代，优先考虑把 demo 拆成 `src/data.js + src/render.js + src/styles.css` 的小型项目结构，避免单文件继续膨胀。
- 如果用户后续补充 `dcos/` 的真实路径，下轮应优先补做参考差异审查。
