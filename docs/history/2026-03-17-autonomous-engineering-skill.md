# 2026-03-17 自治开发工程判断 Skill

## 背景

在围绕“给 AI 的自治开发提示词”继续收敛时，用户明确指出一个关键问题：如果提示词只要求 AI “自主评估、自己决定优先级、持续推进项目”，但没有把“好项目 / 好代码 / 好架构 / 坏信号”的判断标准显式写进协作协议，AI 实际上仍然不知道该按什么标准自治，只会表现成流程上更主动。

对 7Flows 这类已经有明确产品边界、运行时事实和长期架构约束的仓库来说，这会带来一个具体风险：AI 可能越来越会“总结和判断”，但不一定越来越会按当前工程观稳定地选择最值得推进的单轮任务。

## 目标

- 把“自治开发”的含义从泛化自主收紧成“按 7Flows 工程观持续自治开发”
- 把好坏标准、优先级取舍和单轮选题规则下沉成仓库内可复用的元流程 skill，而不是继续只留在对话中
- 让后续连续自治回合默认围绕 `runtime-foundation` 当前优先级和工程判断尺推进，而不是每轮临时发挥

## 本轮决策与实现

### 1. 新增自治开发元流程 Skill

新增：

- `.agents/skills/autonomous-development/SKILL.md`
- `.agents/skills/autonomous-development/references/engineering-rubric.md`

核心作用：

- 明确何时应触发“持续自治开发”元流程
- 要求先判断阶段问题，再生成候选任务，再按工程 rubric 选题
- 默认从 `docs/dev/runtime-foundation.md` 的最高优先级未完成项中选主主题
- 强制区分“功能闭环”“阻塞型架构问题”“必要文件解耦”和“局部优化”

### 2. 把好坏标准写成可执行 rubric

在 `engineering-rubric.md` 中明确沉淀了：

- 好项目的标准
- 好代码的标准
- 好架构的标准
- 典型坏信号
- 单轮候选任务的正负向评分规则
- 功能 / 架构 / 解耦三类决策的判定条件
- 一份更适合作为外部提示词骨架的 prompt scaffold
- 一套“愿景目标完整度”汇报视图，用于每轮都把局部改动放回整体目标里判断

这样后续 AI 的自治开发不再只依赖“价值观描述”，而是有一套仓库内的可复用判断协议。

### 3. 同步索引与长期偏好

同步更新：

- `AGENTS.md`
- `README.md`
- `docs/README.md`
- `docs/dev/README.md`
- `docs/dev/user-preferences.md`
- `docs/dev/runtime-foundation.md`

其中：

- `user-preferences.md` 记录了新的长期偏好：自治开发必须按工程观和当前事实持续推进，而不是泛化自主
- `runtime-foundation.md` 记录了这条新的 AI 协作当前事实，便于后续连续回合直接接续

## 影响范围

- AI 持续自治开发的选题方式
- 元流程 skill 的组合判断
- 每轮最终汇报中“为什么选这个任务”的判断依据
- 后续功能开发 / 架构增强 / 文件解耦的优先级取舍

## 验证

本轮改动为文档与 skill 协作资产更新，执行了：

- `git diff --check`
- 索引引用自查，确认 `AGENTS.md`、`README.md`、`docs/README.md`、`docs/dev/README.md` 已同步出现新 skill

## 下一步

1. 在后续真实“持续自治开发”轮次中，优先按 `autonomous-development + 领域 skill + development-closure` 组合执行，验证这套判断协议是否真正降低选题漂移。
2. 若后续又出现某类重复性的“自治判断失真”，再继续把细化规则下沉到该 skill 的 `references/`，而不是回退到临时对话说明。
