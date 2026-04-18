# 文档计划审计优化报告

更新时间：`2026-04-17 07:09 CST`

审计模式：`qa-evaluation / project evaluation`

本轮新增关注：

- 这轮不重复上一版“QA 门禁不稳”和“03 README 过时”的原始表述，而把重点切到 4 个新结论：
- 最近 `24` 小时的开发重心明显偏向 `04 agentFlow authoring`，与产品文档中的“发布优先 / 运行时优先”主目标出现排序错位。
- 顶层需求、模块 spec、当前代码已经出现三层真值冲突，不只是单一 README 滞后。
- AI 时代不该再用“提交多不多、一天写了多少文档”来评估进度，而应看“模块有没有进入真实闭环”。
- 记忆系统当前不只是数量变多，连文件名与真实阶段都开始错位，已经影响 AI 检索可信度。

审计输入：

- 最近 `24` 小时 `git log`
- `.memory/AGENTS.md`、`.memory/user-memory.md`
- 本轮展开记忆：
  - `.memory/project-memory/2026-04-15-module-03-application-shell-needs-future-hooks.md`
  - `.memory/project-memory/2026-04-15-module-04-editor-first-pass-direction.md`
  - `.memory/project-memory/2026-04-16-agentflow-editor-store-centered-restructure-plan-stage.md`
  - `.memory/project-memory/2026-04-16-agentflow-branching-and-edge-deletion-follow-up.md`
  - `.memory/project-memory/2026-04-16-agentflow-node-detail-design-direction.md`
  - `.memory/project-memory/2026-04-16-agentflow-node-detail-plan-stage.md`
- `docs/superpowers/specs/1flowbase/2026-04-10-product-design.md`
- `docs/superpowers/specs/1flowbase/2026-04-10-product-requirements.md`
- `docs/superpowers/specs/1flowbase/modules/03-workspace-and-application/README.md`
- `docs/superpowers/specs/1flowbase/modules/04-chatflow-studio/README.md`
- `docs/superpowers/specs/1flowbase/modules/05-runtime-orchestration/README.md`
- `docs/superpowers/specs/1flowbase/modules/06b-publish-gateway/README.md`
- 当前 `web` / `api` / `docs` / `.memory` 目录压力和代码静态证据

本轮未额外运行会写入 `target / dist / cache` 的验证命令。
原因：本任务被要求仅更新 `docs/qa-report` 和 `docs/userDocs/todolist`。
因此，关于“哪些能力已落地、哪些能力仍为空壳”的结论，主要依据当前代码、最近 `24` 小时提交和最近已落库的项目记忆，不对本轮未重新执行的运行时行为下绝对结论。

## 1. 现状

### 1.1 现在开发情况和状态

- 最近 `24` 小时共有 `31` 次提交：
- `docs`：`14`
- `feat + feat(web)`：`9`
- `refactor`：`5`
- `fix + fix(css)`：`3`
- `test`：`1`

- 最近 `24` 小时改动文件路径分布：
- 顶层分布：`web 181`、`docs 36`、`.memory 16`、`api 12`
- 进一步看热点区域：`web/app/src/features/agent-flow/** = 165`，`web/app/src/features/applications/** = 6`，`api/** = 12`，`docs/superpowers/** = 20`

- 这说明项目不是“停了”，而是开发非常活跃。
- 但也说明当前几乎全部有效开发动量都压在 `04 agentFlow` 上，尤其是 editor store、连线交互、node detail、last-run 壳层和 panel revision。

- 当前代码真实状态已经比顶层文档前进得更快：
- `web/app/src/features/home/pages/HomePage.tsx` 已把首页切为 `ApplicationListPage`
- `web/app/src/features/applications/pages/ApplicationDetailPage.tsx` 已让 `orchestration` 进入真实 `AgentFlowEditorPage`
- `web/app/src/routes/_tests/application-shell-routing.test.tsx` 已验证 `/applications/:id` 直接重定向到 `orchestration`
- 但 `api/logs/monitoring` 仍只展示状态页，`api/crates/control-plane/src/application.rs` 和 `api/crates/storage-pg/src/mappers/flow_mapper.rs` 里仍是 `planned`
- `web/app/src/features/agent-flow/components/detail/last-run/*` 仍明确写着“当前版本暂未接入运行数据 / 输入输出”
- `api/crates/publish-gateway/src/lib.rs` 仍只有 `crate_name()`

结论：

- `03` 应用宿主壳层：已经不是设计态，而是实现态
- `04` authoring：继续快速推进
- `05` runtime：仍主要停留在设计与预留 contract
- `06B` publish：仍是未来设计，代码闭环还没开始

### 1.2 对当前开发健康来说是好还是差

结论：`开发速度好，战略健康一般，整体偏黄`

- 好的一面：
- 代码不是空文档项目，`03/04` 已有真实页面、真实交互和真实测试入口
- 最近 `24` 小时的改动高度集中，说明当前执行不是发散式乱修
- `store-centered` 重构和 `node detail` 连续推进，说明局部架构不是一碰就碎

- 差的一面：
- 产品主目标写的是“发布优先、运行时优先”，但最近的主要新增价值几乎都在 editor 内部体验
- 真值层已经分裂：顶层需求、模块 spec、代码现实并不总是一致
- 资料系统比代码本身更快膨胀，开始反向拖慢 AI 判断

更准确地说：

- `执行健康`：好
- `模块闭环健康`：中
- `产品真值层健康`：差
- `长期软件健康`：中下

### 1.3 短期风险和收益

短期收益：

- `03 + 04` 的体验已经从“只有 spec”进入“有壳层、有主路由、有编辑体验”的状态
- 如果目标是内部演示或继续验证 editor 心智，这条线是有效的

短期风险：

- 继续深挖 `04`，会让项目更像“做得越来越像样的内部编辑器”，而不是“可发布、可运行、可调试的 AI 工作流平台”
- `Last Run`、`发布配置` 这些入口已经出现在 UI，但后面仍缺真实 runtime / publish 支撑，用户和 AI 都容易把“有入口”误判成“有能力”
- 顶层真值冲突如果不先修，后续每小时审计都会先花时间纠正文档，而不是输出新判断

### 1.4 长期软件健康和质量

长期看，当前最危险的部分不是代码，而是“代码、计划、记忆、需求文档各自说不同版本的真相”。

- `docs/superpowers/specs/1flowbase/2026-04-10-product-requirements.md` 仍有 `FR-004 应用概览`
- `docs/superpowers/specs/1flowbase/modules/03-workspace-and-application/README.md` 明确说“不再保留独立 overview”
- 当前前端路由和测试也已经按“直接进 orchestration”实现

这不是普通的文档滞后，而是：

- 顶层 PRD 说一套
- 模块 spec 说一套
- 代码与测试又是第三套

如果继续这样累积，长期质量问题会优先表现为：

- AI 检索命中错误入口
- 审计报告越来越依赖人工解释上下文
- 后续新专题更难判断应该继承哪一份真相

### 1.5 开发进度如何评估

如果还按旧人力时代看法，“最近 `24` 小时 `31` 次提交、文档和界面都在持续变”会显得进度很快。

但在 AI 时代，这个口径已经不够用了。

更有意义的衡量方式应该是：

- 有没有新模块从“设计已确认”变成“代码已闭环”
- 有没有从“UI 壳层”进入“真实后端能力”
- 有没有从“内部 authoring 可用”进入“外部可发布、可运行、可观察”

按这个口径，本项目当前进度应判断为：

- `活动强度`：高
- `03/04` 进度：快
- `05/06B` 进度：慢
- `P1 真闭环进度`：中，不算慢项目，但也绝对不能算“主目标快完成”

### 1.6 产品方向定位是否清晰，是否正确，是否需要调整

方向本身依然是清晰的，而且原则上是对的。

从 `2026-04-10-product-design.md` 看，1Flowbase 的核心定位一直很明确：

- 不是聊天优先产品
- 不是通用低代码平台
- 是“以标准 Agent API 发布为中心的 AI 工作流平台”

问题不在定位错误，而在当前执行排序开始偏离这个定位。

当前有两种可能：

- 如果你的真实商业目标仍然是“团队把 Flow 编排出来并稳定发布给外部 Agent 调用”，那就不应该改定位，应该改路线排序
- 如果你已经决定先把 P1 收成“一个体验更完整的内部 agentFlow builder”，那就应该正式改产品文档，不要继续保留“发布优先”叙事

以当前仓库现状看，我更倾向于：

- `不改定位`
- `调整路线排序`

因为现在的壳层和 editor 已经够用了，再继续加 authoring 小专题，边际收益明显下降。

## 2. 可能方向

### 方向 A：回到 publish-first 主线

- 冻结 `04` 的新专题，只保留 bugfix 和为 `05/06B` 服务的必要接缝
- 下一条主切片直接进入 `05 runtime` 的最小真闭环
- 紧接着进入 `06B publish` 的最小可调用闭环

### 方向 B：正式改成 authoring-first 路线

- 承认当前 P1 的真实目标已经变成“先把 application shell + agentFlow editor 做完整”
- 相应重写产品设计、需求和模块状态，不再强调短期内必须有外部发布闭环

### 方向 C：先做一轮治理收口

- 先修三层真值冲突
- 先压缩过长计划文档
- 先合并热点专题记忆和工具记忆
- 让后续 AI 检索、每小时审计和执行入口都先回到可信状态

## 3. 不同方向的风险和收益

| 方向 | 收益 | 风险 |
| --- | --- | --- |
| `A 回到 publish-first 主线` | 最符合当前产品定位；最能把“高频开发”转成“真实模块闭环”；最快补上 P1 最大短板 | 会立刻暴露 runtime / publish 的后端欠账；短期内界面观感新增会变少 |
| `B 改成 authoring-first 路线` | 最容易继续做出更顺滑、更完整的编辑器演示；短期 demo 观感提升最快 | 会把产品从“可发布 AI 工作流平台”滑向“内部 builder”；未来再回到 `05/06B` 时返工成本更高 |
| `C 先做治理收口` | 能最快提升 AI 检索效率和文档可信度；后续审计会更准 | 如果单独做太久，会形成“治理 busy 但业务闭环不增加”的停滞感 |

从短期收益看，`A` 最有业务价值，`B` 最有演示价值，`C` 最有 AI 协作价值。

从长期软件健康看，`A + C-lite` 组合最好，单走 `B` 风险最大。

## 4. 对此你建议是什么？

建议：`A + C-lite`，不要改产品定位，也不要继续把主时间花在 `04` 的局部打磨上。

我建议的顺序是：

1. 先修真值层，不要再拖
- 对齐 `docs/superpowers/specs/1flowbase/2026-04-10-product-requirements.md`
- 对齐 `docs/superpowers/specs/1flowbase/modules/03-workspace-and-application/README.md`
- 明确 `03/04/05/06B` 当前状态矩阵：`设计已确认 / 代码已落地 / 已验证 / 真实闭环`

2. 把 `04` 进入“够用冻结”
- 允许修 bug
- 允许补 `05` 接入所需 contract
- 暂停新增 node detail / panel / editor 微体验专题

3. 连续推进两个最小闭环
- `05`：至少接通一个真实 `Flow Run / Node Run / Last Run` 查询与展示链路，让“上次运行”不再是占位
- `06B`：至少让 `publish-gateway` 不再是骨架，并形成一个最小的应用级鉴权与稳定调用 contract

4. 用 AI 时代口径管理进度
- 不再按“今天多少提交、多少文档更新”汇报
- 改按“模块是否进入闭环”汇报
- 建议后续每小时审计都固定输出：`新增闭环 / 新增占位 / 真值冲突 / 待清理记忆`

5. 优先清理和合并这些记忆
- 合并 `.memory/project-memory/2026-04-15-module-03-application-shell-plan-stage.md` 和 `.memory/project-memory/2026-04-15-module-03-application-shell-needs-future-hooks.md`
- 合并 `.memory/project-memory/2026-04-16-agentflow-editor-store-centered-restructure-direction.md` 和 `.memory/project-memory/2026-04-16-agentflow-editor-store-centered-restructure-plan-stage.md`
- 合并 `.memory/project-memory/2026-04-16-agentflow-node-detail-design-direction.md` 和 `.memory/project-memory/2026-04-16-agentflow-node-detail-plan-stage.md`
- 合并 `.memory/project-memory/2026-04-14-modules-spec-status-reclassification-direction.md` 和 `.memory/project-memory/2026-04-14-modules-03-06-07-08-decision.md`
- 这些文件当前最大问题不是只有“多”，而是文件名还停留在 `direction / plan-stage`，正文却已经进入“已实现 / 已完成 / 已验证”，会误导检索

6. 优先收口这些工具记忆
- 把 `3100` 端口、`dev-up ensure`、`style-boundary`、`vite` 的多条近邻记录收成一个“前端本地验证链路”主记忆
- 把 `.memory/tool-memory/vitest/2026-04-15-web-test-blocked-by-existing-me-page-timeout.md` 标成陈旧或并入“慢速套件 / 旧阻塞项”总记忆
- 否则后续 AI 很容易继续命中过时故障，把已经恢复的问题当成当前阻塞

一句话结论：

现在的问题不是“开发慢”，而是“`04` 的推进速度已经开始快过产品主目标、真值层同步和记忆收口速度”。最优先该做的不是再补 editor 小功能，而是把真值层收正，并把主切片切回 `05/06B`。
