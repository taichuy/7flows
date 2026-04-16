# 文档计划审计优化报告

更新时间：`2026-04-17 05:06 CST`

审计模式：`qa-evaluation / project evaluation`

本轮重点：

- 不再重复展开“03/04 文档口径漂移”这一层泛问题。
- 直接下钻到当前最影响判断和 AI 检索效率的 5 个具体问题：假闭环入口、状态页冒充模块页、审计文档自身高频 churn、工程黄灯堆积、记忆真值层缺失。

审计输入：

- 最近 `24` 小时 `git log`
- `.memory/AGENTS.md`、`.memory/user-memory.md`
- 相关反馈记忆：
  - `.memory/feedback-memory/interaction/2026-04-12-memory-summary-first-selection.md`
  - `.memory/feedback-memory/repository/2026-04-13-subdir-agents-inline-critical-rules.md`
  - `.memory/feedback-memory/repository/2026-04-14-agents-only-hard-rules-no-guidance.md`
- 本轮展开的 `5` 条项目记忆全文：
  - `.memory/project-memory/2026-04-16-agentflow-editor-store-centered-restructure-plan-stage.md`
  - `.memory/project-memory/2026-04-16-agentflow-handle-first-source-trigger-follow-up.md`
  - `.memory/project-memory/2026-04-16-agentflow-branching-and-edge-deletion-follow-up.md`
  - `.memory/project-memory/2026-04-16-agentflow-node-detail-design-direction.md`
  - `.memory/project-memory/2026-04-16-agentflow-node-detail-plan-stage.md`
- `docs/superpowers/specs/1flowse/2026-04-10-product-design.md`
- `docs/superpowers/specs/1flowse/2026-04-10-product-requirements.md`
- `docs/superpowers/specs/1flowse/2026-04-10-p1-architecture.md`
- `docs/superpowers/plans/2026-04-15-module-03-application-shell.md`
- `docs/superpowers/plans/2026-04-15-agentflow-editor.md`
- `docs/superpowers/plans/2026-04-16-agentflow-node-detail-panel-revision.md`
- 当前 `web` / `api` 代码与目录压力

本轮直接验证：

- `pnpm --dir web/app exec vitest run src/routes/_tests/application-shell-routing.test.tsx src/features/applications/_tests/application-list-page.test.tsx src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx src/features/agent-flow/_tests/node-detail-panel.test.tsx`
  - 结果：`4` 个文件、`20` 条测试通过
  - 仍有 stderr 噪声：`React Flow parent container needs a width and a height`、`Please import '@xyflow/react/dist/style.css'`、`Tooltip overlayInnerStyle is deprecated`
- `pnpm --dir web/app build`
  - 结果：通过
  - 产物：主包 `5,268.92 kB`，gzip `1,572.14 kB`
  - 仍有 chunk warning
- `pnpm --dir web/app exec eslint src --ext .ts,.tsx`
  - 结果：`0` error，`1` warning
  - 位置：`web/app/src/features/agent-flow/store/editor/provider.tsx`
- `cargo fmt --all --check`
  - 结果：失败
  - 性质：当前后端格式未收口，尚不是“语义错误”，但说明统一门禁仍未闭合

本轮未重跑：

- `node scripts/node/check-style-boundary.js ...`
- `node scripts/node/verify-backend.js`
- 浏览器级桌面 / 移动端人工回归

## 1. 现状

### 1.1 当前开发情况和状态

- 最近 `24` 小时共有 `32` 次提交：
  - `docs`: `14`
  - `feat`: `9`
  - `refactor`: `5`
  - `fix`: `3`
  - `test`: `1`
- 这不是旧人力时代的“慢项目”，而是典型 AI 日更节奏项目。
- 但这 `32` 次提交里，仅 `docs: refresh document plan audit` 就出现了 `8` 次，说明审计文档本身已经进入高频重写状态。
- 代码真实进展依旧集中在 `agent-flow` 和 `application shell`：
  - `HomePage` 已直接挂 `ApplicationListPage`
  - `/applications/:applicationId/orchestration` 已接入 editor、draft 保存、版本恢复、node detail
  - 应用列表已支持标签和编辑
  - 后端已有 `applications` 列表 / 详情接口，以及 orchestration `get/save/restore`
- 但对外交付主线仍明显不足：
  - `publish-gateway` 目前只有 `crate_name()` 空壳
  - `ApplicationDetailPage` 中只有 `orchestration` 是真实页面，其余 `api/logs/monitoring` 仍是状态说明页

### 1.2 当前开发健康判断

结论：`内部推进快，外部交付弱，真值层噪声偏高`

| 维度 | 判断 | 说明 |
| --- | --- | --- |
| 内部开发吞吐 | `好` | `24` 小时内连续完成 editor 重构收尾、node detail 深化、application list 增强 |
| 产品主线对齐 | `中下` | P1 仍是 publish-first，但当前主要投入仍偏 authoring/editor |
| 工程门禁 | `中` | 测试和 build 能过，但 `fmt`、warning、deprecation、bundle warning 仍在 |
| UI / 导航诚实度 | `中下` | 存在“入口像完成了，实际没动作”或“模块页仍是状态页”的问题 |
| 文档真值层 | `差` | 计划、审计、模块状态和代码事实之间有持续重写与漂移 |
| AI 检索效率 | `中下` | 记忆与计划越来越集中在 `agent-flow` 细节，而不是当前产品真实阶段 |

### 1.3 本轮最值得指出的 5 个问题

### [High] 发布闭环已经出现“假完成入口”

- 位置：
  - `web/app/src/features/agent-flow/components/editor/AgentFlowOverlay.tsx`
  - `web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx`
  - `web/app/src/features/agent-flow/store/editor/index.ts`
  - `api/crates/publish-gateway/src/lib.rs`
- 证据：
  - UI 暴露了启用态主按钮“发布配置”
  - `AgentFlowCanvasFrame` 里 `onOpenPublish={() => undefined}`
  - store 持有 `publishConfigOpen`，但当前没有实际消费方
  - 现有测试只断言按钮“存在”，没有断言点击后的行为
  - `publish-gateway` 当前只有：
    - `pub fn crate_name() -> &'static str { "publish-gateway" }`
- 为什么是问题：
  - 这不是“正式建设中状态”，而是“看起来可用但实际上无动作”的假闭环。
  - 它会同时误导用户、误导 AI、误导进度评估，把 `06B` 还没开始的事实包装成“已经进入收尾”。
- 建议修正方向：
  - 没有动作前，不要暴露启用态主按钮。
  - 二选一：
    - 隐藏入口
    - 改成正式“未开放 / 建设中”状态并给出边界说明
  - 真正开始 `06B` 时，再让 UI、状态和测试一起进入闭环。

### [High] `api / logs / monitoring` 仍是状态说明页，不是产品能力页

- 位置：
  - `web/app/src/features/applications/pages/ApplicationDetailPage.tsx`
  - `web/app/src/features/applications/components/ApplicationSectionState.tsx`
- 证据：
  - `ApplicationDetailPage` 只有 `orchestration` 分支挂真实 `AgentFlowEditorPage`
  - `api/logs/monitoring` 统一回落到 `ApplicationSectionState`
  - 文案中直接写明：
    - `invoke_path_template` “由 application_type 冻结，06B 再落地”
    - `日志` “05 会把 Application Run、Node Run 和 Event Trace 接进这里”
    - `监控` “真实图表与配置编辑留到后续专题”
- 为什么是问题：
  - 路由、导航、版位已经让这些分区看起来像“模块已落成”。
  - 但真实能力仍停留在 capability snapshot / placeholder data 层。
  - 这会导致项目在日报、周报、审计和未来任务分配中被高估。
- 建议修正方向：
  - 不要把这些页描述成“模块已进入实现后段”。
  - 当前更准确的口径应是：
    - `03`：应用壳层与 capability snapshot 已落地
    - `04`：authoring/editor 基线已落地
    - `05/06B`：运行与对外交付仍处于前置阶段
  - 页面层面也应改为更诚实的“能力状态页”表达，而不是接近完整模块页的视觉姿态。

### [Medium] 审计文档自身已经开始制造检索噪声

- 位置：
  - `docs/qa-report/document-plan-audit.md`
  - `docs/userDocs/todolist/document-plan-audit.md`
  - `git log --since='24 hours ago'`
  - `docs/superpowers/plans/*.md`
- 证据：
  - 最近 `24` 小时同主题 `audit` 刷新提交达到 `8` 次
  - 当前这两份报告文件在工作树中仍处于高频重写状态
  - 多份计划文档已超过本地 `1500` 行约束：
    - `2026-04-15-module-03-application-shell.md`: `2335`
    - `2026-04-15-agentflow-editor.md`: `2188`
    - `2026-04-16-agentflow-editor-store-centered-restructure.md`: `2024`
    - `2026-04-16-agentflow-node-detail.md`: `1734`
- 为什么是问题：
  - 当同一个审计主题被整篇重写多次时，`git`、AI 检索和人工回看都更难提炼“本轮真正新增了什么”。
  - 长计划文档继续累积，也会把“当前真值”埋进长执行流水里。
- 建议修正方向：
  - 同主题定时审计改成“增量回填”，不要整篇重写。
  - 超长计划文档应按阶段完成态切分到 `history/`，保留一份当前基线文档。

### [Medium] 工程门禁仍然是稳定黄灯，不是红灯，但已经开始侵蚀完成定义

- 位置：
  - `web/app/src/features/agent-flow/store/editor/provider.tsx`
  - `web/app` build/test 输出
  - `api/` `cargo fmt --all --check`
- 证据：
  - `eslint` 仍有 `react-refresh/only-export-components` warning
  - `build` 虽通过，但主包 `5,268.92 kB`
  - 测试通过时仍有 `React Flow` 宿主宽高 / 样式提示与 `Tooltip overlayInnerStyle` 弃用提示
  - `cargo fmt --all --check` 失败
- 为什么是问题：
  - 这些问题单个都不致命，但会持续放松“什么算完成”的标准。
  - 一旦 AI 迭代速度继续保持，黄灯会很快变成新的默认常态。
- 建议修正方向：
  - 只做一轮轻治理，不把它扩成大工程专题：
    - 收掉 `fmt`
    - 处理 `provider.tsx` warning
    - 替换 `Tooltip overlayInnerStyle`
    - 处理测试宿主下的 `React Flow` 噪声
    - 给主包加基础 chunk 策略

### [Medium] 记忆系统正在放大 `agent-flow` 偏置，但缺少当前产品阶段的汇总真值

- 位置：
  - `.memory/project-memory`
  - `.memory/tool-memory`
- 证据：
  - `.memory/project-memory` 当前已有 `65` 条
  - 最近展开的 `5` 条项目记忆全部集中在 `agent-flow`
  - 最近 `20` 条 `tool-memory` 也主要集中在 `vite`、`vitest`、`style-boundary`、浏览器回归
  - 当前缺少一条“现在 03/04/05/06B 实际到了哪里”的收口型 project-memory
- 为什么是问题：
  - AI 在读取最近记忆时，会自然把注意力继续压到 editor 交互和测试工具问题上。
  - 这会加重“内部 authoring 很热闹，外部发布/运行主线没人盯”的偏差。
- 建议修正方向：
  - 为“当前模块真值”和“当前产品闭环缺口”单独维护汇总记忆。
  - 将已完成计划阶段记忆合并为“implemented baseline”，减少 design/plan 双条并存。

### 1.4 短期与长期判断

短期收益：

- 现在不是“只有文档没有代码”，而是已经有真实应用壳层和 editor 基线。
- `20` 条关键前端测试通过，说明主路径不是一碰就碎。
- 源码文件行数仍可控，主要超限点在计划文档，不在核心代码。

短期风险：

- 如果继续暴露假完成入口，后续优先级会持续被高估能力拖偏。
- 如果继续整篇重写审计文档，定时任务会开始放大噪声而不是增加信息量。
- 如果继续只补 editor，P1 最重要的对外交付证明会继续滞后。

长期正向面：

- 代码边界没有明显塌陷，`web` / `api` 结构仍大体符合各自 `AGENTS` 约束。
- 最近提交虽多，但仍以同一主线持续收口，而不是四处开坑。

长期风险面：

- 未来最先拖慢 AI 的不一定是代码复杂度，而是“文档和记忆越来越多，但真值越来越不集中”。
- 当 UI 入口和计划状态先于能力闭环进入“完成态视觉”，后续所有审计都会更难诚实。

### 1.5 如何评估当前开发进度

不建议再用旧人力时代“周更 / 月更”口径。

更准确的 AI 时代评估方式应该拆成两个维度：

1. `内部吞吐`
   - 当前很强
   - editor、node detail、application shell 都是按天推进
2. `外部价值闭环`
   - 当前一般
   - “建出来”已经明显前进
   - “发出去、跑起来、查得到”仍主要停在 capability snapshot 和 future hook

因此当前更准确的结论是：

- `开发速度快`
- `authoring 基线扎实`
- `发布 / 运行闭环明显滞后`
- `方向没错，排序需要调整`

### 1.6 产品方向是否清晰、是否正确

产品方向本身是清晰的，而且仍然正确。

稳定证据：

- `2026-04-10-product-design.md` 明确：
  - `Flow` 是核心资产
  - `Publish Endpoint` 是核心交付物
- `2026-04-10-product-requirements.md` 明确要求：
  - `Flow Run`
  - `Node Run`
  - `checkpoint`
  - `callback`
  - 发布 API
- `2026-04-10-p1-architecture.md` 明确：
  - `api-server` 承接控制面、发布入口、callback 与运行时宿主

所以当前不需要调整产品定位。

真正需要调整的是：

- UI 和文档必须诚实反映“哪些能力真的闭环了”
- 主切片要尽快从 editor 继续转回 `05/06B`

## 2. 可能方向

### 方向 A：先收口真值层和假入口

目标：

- 让 UI、文档、记忆都回到当前真实阶段
- 停止制造“看起来做完了”的假信号

具体动作：

- 隐藏或正式降级“发布配置”入口
- 把 `api/logs/monitoring` 明确标成 capability state，不装作功能页
- 补一份“当前模块真实状态”总览

### 方向 B：下一条主切片直接转最小 `05/06B`

目标：

- 尽快证明“发出去、跑起来、查得到”

建议最小闭环：

- 一个真实 publish config / publish action
- 一条最小应用调用入口
- 一条最小 `Flow Run / Node Run` 记录
- 一个最小日志查询页，而不是状态页

### 方向 C：审计、计划、记忆减噪

目标：

- 让 AI 和人能更快命中“当前真值”

具体动作：

- 同主题审计改为 delta 更新
- 计划完成后及时归档到 `history/`
- 合并“设计稿已确认 + 计划阶段 + 已完成”三连记忆

### 方向 D：做一轮轻量门禁收口

目标：

- 避免黄灯变成默认完成标准

具体动作：

- 收 `cargo fmt`
- 收 `provider.tsx` warning
- 收 `Tooltip` 弃用
- 降低 `React Flow` 测试宿主噪声
- 做基础 chunk 拆分

## 3. 不同方向的风险和收益

### 方向 A

- 收益：最先提高判断准确度，后续每轮开发和审计都会更准
- 风险：短期用户可见新功能不多，更多是“把话说对、把入口放对”

### 方向 B

- 收益：最快回到 P1 真正要证明的价值链
- 风险：需要主动暂停继续深挖 editor 小优化的冲动

### 方向 C

- 收益：对 AI 长期效率提升最大，后续搜索、对齐和总结成本都会下降
- 风险：如果只搬文件不改真值层表达，收益会打折

### 方向 D

- 收益：完成定义重新变硬，后面少解释 warning / deprecated / chunk 黄灯
- 风险：容易被做成单独治理专题，吞掉主线时间

## 4. 对此你建议是什么？

建议顺序：`A -> B -> C -> D-lite`

我建议先做的事：

1. 立刻收掉假闭环入口。
2. 把 `api/logs/monitoring` 的页面口径改成“能力状态页”，不要继续让它们看起来像已进入功能阶段。
3. 补一条当前产品真值结论：
   - `03`：壳层与 capability snapshot 已落地
   - `04`：editor authoring 基线已落地
   - `05`：运行态未成闭环
   - `06B`：发布态未成闭环

我建议紧接着做的事：

1. 下一条主切片不要再开 editor 新专题。
2. 直接补最小 `05/06B`：
   - publish config
   - publish action
   - 最小 run record
   - 最小日志视图

我建议优先清理和合并的记忆：

1. 合并 `03` 应用壳层相关记忆：
   - `.memory/project-memory/2026-04-15-module-03-application-shell-plan-stage.md`
   - `.memory/project-memory/2026-04-15-module-03-application-shell-needs-future-hooks.md`
   - 目标：保留一条“03 当前真实状态”
2. 合并 editor 重构相关记忆：
   - `.memory/project-memory/2026-04-16-agentflow-editor-store-centered-restructure-direction.md`
   - `.memory/project-memory/2026-04-16-agentflow-editor-store-centered-restructure-plan-stage.md`
   - 目标：保留一条“editor store-centered 已实现基线”
3. 合并 node detail 相关记忆：
   - `.memory/project-memory/2026-04-16-agentflow-node-detail-design-direction.md`
   - `.memory/project-memory/2026-04-16-agentflow-node-detail-plan-stage.md`
   - 目标：保留一条“node detail 当前基线”
4. 合并 `vite` 端口类 tool-memory：
   - `3100/3200 requires escalation`
   - `already in use reuse existing vite`
   - `stale server check`
   - 目标：收敛成一条“web dev server 端口与复用规则”
5. 合并 `vitest` 聚焦运行 / timeout 类 tool-memory：
   - `single-file run use vitest directly`
   - `app test timeout when suite is slow`
   - `web test blocked by existing me page timeout`
   - 目标：收敛成一条“web test 定向运行与超时处理”

我建议对定时审计本身也做一个规则调整：

1. 同主题不再整篇重写。
2. 每轮只追加：
   - 新证据
   - 新问题
   - 旧问题状态变化
3. 只有当主题结构变化时，才重排整篇文档。

一句话总结：

现在的问题不是“做得慢”，也不是“方向错了”，而是“内部 authoring 进展很快，但 UI、文档、记忆已经开始把未完成的发布 / 运行能力包装成接近完成态”。当前最该做的不是继续美化 editor，而是先把真值层说对、把假入口收掉，再补最小 `05/06B` 闭环。
