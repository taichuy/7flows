# 文档计划审计待讨论

更新时间：`2026-04-17 07:09 CST`

这轮建议重点讨论的不是“项目有没有继续做”，而是“项目正在高速推进，但推进方向开始偏向 `04 agentFlow`，和产品主目标不完全一致”。

## 1. 现状

- 最近 `24` 小时共有 `31` 次提交，说明节奏很快，不是停滞状态。
- 但改动热点非常集中：
- `web/app/src/features/agent-flow/** = 165`
- `web/app/src/features/applications/** = 6`
- `api/** = 12`

- 当前更准确的实现状态是：
- `03`：应用宿主壳层已落地，不再只是 spec
- `04`：editor 和 node detail 持续快速推进
- `05`：运行时仍主要停留在设计和占位 contract
- `06B`：发布网关仍未进入真实实现

- 代码真相和文档真相开始冲突：
- 顶层需求还保留 `FR-004 应用概览`
- `03` 模块 spec 已明确“不再保留 overview”
- 当前代码和路由测试也已经按“直接进 orchestration”实现

- 当前健康判断：
- `开发速度`：好
- `产品主线对齐度`：一般
- `长期软件健康`：偏黄

- AI 时代不要再按“提交数”评估进度。
- 更准确的说法应该是：`活动很高，但 05/06B 主闭环进度仍慢于 03/04`。

## 2. 可能方向

### 方向 A：回到 publish-first 主线

- 冻结 `04` 的新小专题
- 下一条主切片转 `05 runtime`
- 再接 `06B publish`

### 方向 B：承认当前是 authoring-first

- 正式把 P1 目标改成“先做完整 editor + application shell”
- 相应改写产品和需求文档

### 方向 C：先做一轮治理收口

- 修文档真值冲突
- 合并热点记忆
- 压缩超长 plan

## 3. 不同方向的风险和收益

### 方向 A

- 收益：最符合 1Flowbase 当前“发布优先”的产品定位
- 风险：会更早暴露 runtime 和 publish 的后端欠账

### 方向 B

- 收益：最容易继续做出更完整的 editor 演示
- 风险：产品会越来越像内部 builder，而不是可发布平台

### 方向 C

- 收益：AI 检索和审计质量会明显提升
- 风险：如果单独做太久，会显得业务能力没有新增

## 4. 对此你建议是什么？

我的建议是：`A + C-lite`

- 不改产品定位，定位本身仍然清晰且正确
- 先修顶层需求、模块 spec、代码之间的真值冲突
- 把 `04` 暂时视为“够用”，只修 bug 和补接缝，不再继续做 node detail 小专题
- 下一条主切片直接做 `05` 的最小真实闭环，让“上次运行”不再只是占位
- 紧接着做 `06B` 的最小闭环，让 `publish-gateway` 不再只有骨架

建议优先合并或清理的记忆：

- `.memory/project-memory/2026-04-15-module-03-application-shell-plan-stage.md`
- `.memory/project-memory/2026-04-15-module-03-application-shell-needs-future-hooks.md`
- `.memory/project-memory/2026-04-16-agentflow-editor-store-centered-restructure-direction.md`
- `.memory/project-memory/2026-04-16-agentflow-editor-store-centered-restructure-plan-stage.md`
- `.memory/project-memory/2026-04-16-agentflow-node-detail-design-direction.md`
- `.memory/project-memory/2026-04-16-agentflow-node-detail-plan-stage.md`
- `.memory/project-memory/2026-04-14-modules-spec-status-reclassification-direction.md`
- `.memory/project-memory/2026-04-14-modules-03-06-07-08-decision.md`

建议优先收口的工具记忆：

- `3100` 端口相关 `vite / bash / node / style-boundary` 记录
- `.memory/tool-memory/vitest/2026-04-15-web-test-blocked-by-existing-me-page-timeout.md`

一句话总结：

现在不是“开发慢”，而是“`04` 做得太快，开始快过产品主线、文档真值和记忆系统的同步速度”。下一步最该做的是把主切片切回 `05/06B`，而不是继续深挖 editor 细节。
