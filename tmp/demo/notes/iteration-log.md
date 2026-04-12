# Demo Iteration Log

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
