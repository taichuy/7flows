# 7Flows AGENTS Guide

本文件定义 7Flows 仓库级协作约定。项目仍处于构建初期，优先保证方向一致、文档可追溯、约束可沉淀。

## 1. 项目定位

- 7Flows 是面向多 Agent 协作的可视化工作流平台，不是 Dify ChatFlow 的复刻，也不是通用低代码平台。
- 对外传播短期优先围绕 OpenClaw / 本地 AI 助手“黑盒变透明”的控制面切口展开，但内部产品内核仍是多 Agent workflow 平台，不退化为某个上游产品的 UI 包装层。
- 平台内部统一以 `7Flows IR` 作为事实模型，外部协议通过适配层映射，不允许反向让 OpenAI / Anthropic / Dify 协议主导内部设计。
- 开源给协作，商业给治理；商业能力必须建立在同一 kernel 上，不允许另起执行引擎、第二套流程模型或第二套内部 DSL。
- 仓库授权当前以 `LICENSE` 和 `docs/open-source-commercial-strategy.md` 为准；若采用 Apache 2.0 基底 + 附加条件的 community license，就不要再把项目误写成纯 `MIT` 或纯 `Apache-2.0`。
- 首版核心关注点是：可编排、可调试、可发布、可兼容、可追溯。

## 2. 当前事实来源

进行设计、实现、审查前，优先按下面顺序建立上下文：

1. `docs/product-design.md`
   产品定位、核心模型、MVP 边界、发布策略、前端骨架。
2. `docs/open-source-commercial-strategy.md`
   对外切口、开源/商业边界、版本分层、传播对象与付费对象。
3. `docs/technical-design-supplement.md`
   插件兼容、插件 UI、安全、变量传递、调试模式、缓存等技术细则。
4. `docs/dev/runtime-foundation.md`
   当前已落地运行时事实和近期优先级。
5. `docs/history/*.md`
   按日期归档的开发记录、阶段性决策与实现留痕；仅在需要追溯具体轮次时再读取。
6. `README.md`
   当前工程结构与本地开发方式。
7. `.agents/skills/*/SKILL.md`
   面向具体任务的专项工作流与审查规则。

补充约定：

- `docs/.taichuy/` 只用于本地开发设计讨论素材、文案草稿和内部推导，不纳入 Git，也不是默认事实来源；只有用户明确要求时再读取。

如果“设计文档”和“当前实现”冲突：

- 代码与 `docs/dev/` 反映当前事实；
- `docs/history/` 反映阶段性决策过程与开发留痕；
- `docs/product-design.md`、`docs/open-source-commercial-strategy.md` 和 `docs/technical-design-supplement.md` 反映目标方向；
- 发生偏差时，要么修实现，要么补文档，不要默认忽略。

## 3. 绝对边界

### 3.1 架构边界

- 坚持 `7Flows IR` 优先，避免引入第二套内部 DSL。
- 工作流执行器必须保持唯一主控，统一负责 DAG 调度、上下文状态、节点输入输出传递、重试、超时、waiting / resume 和事件落库；不要让 sandbox、插件 runtime 或子执行器拥有第二套流程控制语义。
- 节点间上下文默认不可见，必须显式授权。
- 节点语义与执行隔离级别必须分离建模：`NodeType` 描述业务语义，`execution class` 描述执行边界，避免为了隔离策略再造一套节点类型。
- 循环必须通过 `Loop` 节点表达，不能通过隐式回边或调度技巧实现。
- 调试、流式输出、回放应尽量复用统一事件流 `run_events`，不要各自另起一套。
- 系统诊断与监控默认展示聚合指标、摘要和可追踪入口，详细日志只在需要时展开，避免日志噪音淹没功能。
- 面向 AI / 自动化 的运行追溯不能依赖前端面板抓取，必须以 `runs` / `node_runs` / `run_events` 及对应 API 作为事实来源；前端面板负责为人类提供摘要、导航和排障入口。
- AI 节点应优先演进为节点内可恢复 phase pipeline；assistant 是节点内的辅助认知层，只负责 evidence 提炼，不拥有流程控制权，也不直接对最终用户负责。
- 若引入产品层 `Skill`，它应被建模为 service-hosted 的轻量 `SkillDoc`，只服务于 `llm_agent` 的认知注入与引用检索，不能演化成第二套工作流 DSL、调度器或执行引擎。
- 外部或通用 skill 格式只能通过适配映射到内部统一 `SkillDoc` 结构，不能反向主导 7Flows 的内部模型。
- 原始大体量工具结果应优先进入 artifact store，通过摘要、引用和 evidence 供主 AI 消费，不要无节制直接塞进主 prompt。
- 沙盒是核心能力，不是附属特性；代码执行、危险工具、插件脚本应优先考虑隔离边界。
- `OSS / Community` 默认执行模型保持 `worker-first`：普通 workflow 节点继续轻执行，不把默认 sandbox 作为所有部署的硬前置；但 sandbox 协议、能力声明和接入点默认开放。
- 执行隔离采用分级策略，不做“所有节点默认重沙箱化”；可信内建节点优先 `inline` 或 `subprocess`，只有代码执行、自定义节点、插件脚本、高风险工具等少量节点进入 `sandbox` 或 `microvm`。
- 对需要强隔离且不可安全降级的路径，例如 `sandbox_code`、高风险 `tool/plugin` 或显式要求受控 `sandbox / microvm` 的执行，应在没有兼容且健康的 sandbox backend 时 `fail-closed` 为 blocked / unavailable，不要静默退回 `inline` 或不受控宿主执行。
- sandbox backend registration / execution protocol 是独立的运行时能力；它可以借鉴 compat adapter registration 的建模风格，但不要把 sandbox backend 和外部插件 compat adapter 混成同一种对象。
- 7Flows core 只理解最小 sandbox contract，例如 `profile`、`language`、运行时限制、依赖引用与 capability 声明；自定义镜像、挂载、私有 registry、wheelhouse、bundle 安装等企业依赖细节，应优先留在 backend/profile/admin 扩展中，而不是直接污染工作流核心语义。
- `sensitivity_level` 与 `execution class` 是两条独立治理轴：前者管理资源访问、审批与审计，后者管理执行隔离与宿主风险，不能混为一个字段或一个策略开关。
- 敏感资源访问控制应优先做成统一运行时能力，基于分级、审批、通知与审计闭环管理；先不要预置行业分类，也不要一开始拆成独立人工审核节点。

### 3.2 集成边界

- 7Flows 首版只兼容 Dify 插件生态，不承诺兼容完整 Dify ChatFlow DSL、UI 配置格式或整个平台结构。
- OpenClaw 集成边界是 `workflow-backed provider`：OpenClaw 对接的是 7Flows 发布网关，不直接理解 7Flows 内部 DSL。
- compat adapter 解决外部生态接入，sandbox backend 解决隔离执行；两者都可以是可注册、可替换的外接能力，但职责边界不能混淆。
- 发布层统一从 `7Flows IR` 和事件总线映射到原生、OpenAI、Anthropic 接口，不能为外部协议分叉内部执行链。

### 3.3 MVP 诚实性

- 当前后端优先打稳运行时基础设施：迁移、Run / NodeRun / RunEvent、最小执行器、Docker 自动迁移。
- 尚未完整落地的能力，不能在代码、文档或 UI 中假装已完成；需要明确标注为占位、未实现或实验态。

## 4. 目录协作约定

- `api/`：FastAPI、运行时、迁移、任务、后端基础设施。
- `web/`：前端工作台、未来工作流编辑器和调试面板。
- `docs/`：产品与技术基线文档，以及总索引。
- `docs/.taichuy/`：本地开发设计讨论素材和草稿，默认 git ignore，不作为默认检索入口或仓库知识基线。
- `docs/dev/`：当前有效的开发索引文档，仅保留 `runtime-foundation.md`、`user-preferences.md` 等持续维护的当前事实。
- `docs/history/`：按日期归档的开发记录、阶段性方案、实现说明与验证留痕。
- `docs/expired/`：已废弃但仍保留历史价值的文档，不作为默认检索入口。
- `.agents/skills/`：仓库内可复用技能，承载专项任务规范与参考资料；它属于 AI 协作开发资产，不等同于产品运行时的 `SkillDoc`。

## 5. 用户偏好记录

开发过程中，如果用户表达了“稳定偏好”而不是一次性请求，必须记录到 `docs/dev/user-preferences.md`。

应记录的偏好包括：

- 长期有效的产品偏好
- 反复出现的交互或 UI 风格要求
- 命名、目录、文档、测试、发布方式等工程约定
- 明确的“不要这样做”的禁用项

不必记录的内容：

- 当前任务的一次性口头要求
- 已被代码或文档完全覆盖、且没有复用价值的细节

记录时至少包含：

- 日期
- 偏好内容
- 来源上下文
- 影响范围
- 当前落地动作

如果某条偏好已经升级为仓库级长期规则：

- 通用协作规则，更新本 `AGENTS.md`
- 领域专项规则，更新对应 `.agents/skills/.../SKILL.md` 或其 `references/`

## 6. Skill 使用与维护

### 6.1 当前仓库内技能

- `development-closure`
  用于一轮开发收尾时统一处理验证、`docs/history/`、`runtime-foundation`、Git 提交与下一步规划。
- `skill-governance`
  用于优化 `.agents/skills/`、AGENTS 协作流程和 skill 索引，同步治理 skill 漂移与分层规则。
- `backend-code-review`
  用于 `api/` 后端实现审查与后端架构约束核对。
- `backend-testing`
  用于 `api/` 后端测试设计、补测与 runtime / published surface 行为验证。
- `frontend-code-review`
  用于 `web/` 前端实现审查与工作流 UI 约束核对。
- `component-refactoring`
  用于复杂 React 组件、节点壳层、配置面板、调试面板拆分重构。
- `frontend-testing`
  用于前端测试设计、补测与测试基础设施判断。
- `orpc-contract-first`
  仅在明确引入 oRPC 合同优先 API 层时使用，不是当前默认模式。

### 6.2 维护原则

- 新的稳定规范，不要只留在对话里，应沉淀到 skill 或引用文档。
- 元流程优先沉淀为通用协作 skill，领域实现规则优先沉淀为模块 skill，不要只补单点 review 清单却缺失开发闭环。
- 通用规则放 `AGENTS.md`，专项流程放 `SKILL.md`，深入说明放 `references/*.md`。
- skill 的 `description` 优先描述“何时触发”，不要在描述里把完整流程提前讲完。
- skill 正文保持精简，重资料、长清单和样例优先下沉到 `references/*.md`。
- 如果某条规则只适用于单一模块，不要把它提升成全仓库规则。
- 需要引用 Dify、n8n、xyflow、OpenClaw 经验时，应明确说明借鉴边界，避免直接照搬不存在的基础设施。
- 可以借鉴 `superpowers` 这类项目的元流程设计思路，但不要把当前仓库不存在的 subagent、worktree 或强制流程生搬硬套进 7Flows。
- 新增、删除、重命名或实质重构 skill 后，必须同步检查 `AGENTS.md`、`README.md`、`docs/README.md`、`docs/dev/README.md` 中的索引和说明。
- 涉及 OpenClaw 对外切口、开源/商业边界、组织治理或版本分层时，应检查相关 skill 是否仍与 `docs/open-source-commercial-strategy.md` 一致。

### 6.3 优化触发条件

出现以下情况时，应考虑同步优化相关 skill：

- 同类 review / refactor / testing 建议已反复出现
- 同类收尾遗漏已反复出现，例如漏验证、漏补 `history`、漏更 `runtime-foundation`、漏提交 Git
- 用户多次强调某类实现方式或禁用项
- 现有 skill 与项目现状明显脱节
- 前后端、实现与收尾之间出现明显能力断层
- 某个专项工作已经形成固定模板、检查清单或参考路径

## 7. 开发记录与溯源

所有重要开发动作都应该在 `docs/history/` 留痕；`docs/dev/` 只保留当前有效索引。目标不是写流水账，而是保证后续能回答“为什么这样做、改了什么、影响哪里、如何验证”。

建议在以下场景新增或更新开发文档：

- 架构边界调整
- 运行时模型变化
- 新增协议、插件、沙盒、安全、缓存、调试能力
- 重要的前端交互方案确定
- 技术选型或约束变更
- 需要跨任务延续的上下文

开发记录建议包含：

- 背景
- 目标
- 决策或实现方式
- 影响范围
- 验证方式
- 未决问题或下一步

每次完成一轮开发后，额外要求：

- 必须更新相应的 `docs/history/` 记录，不能只改代码不补留痕。
- 必须同步更新 `docs/dev/runtime-foundation.md` 中与当前事实相关的部分。
- 必须在 `docs/dev/runtime-foundation.md` 写出“下一步规划”，并按明确优先级排序，不允许只写无序想法。
- 必须把 `docs/dev/runtime-foundation.md` 维持为“当前事实索引”而不是无限追加的流水账；当内容过长（例如超过约 1500 行或已明显削弱指导作用）时，应结合当前代码现状压缩到约 1000 行以内，并保留当前“下一步规划”作为最高优先级指引；阶段性历史改动归档到 `docs/history/`，已废弃文档归档到 `docs/expired/`。
- 必须在收尾阶段进行充分测试；如果测试不通过，应继续修复代码或更新测试脚本，直到结果正确、零警告、零错误；若受外部阻塞暂时无法达到，必须在最终汇报中明确说明。
- 必须在完成必要验证后执行一次非交互式 Git 提交；如果本轮只有中间态探索、暂不适合提交，需要在最终汇报里明确说明原因。
- 必须在最终汇报中结合当前项目现状给出下一步开发建议，并显式标明优先级顺序。

文件命名建议：

- 新的日期开发记录：`docs/history/YYYY-MM-DD-<topic>.md`
- 长期索引或专题文档：使用稳定语义名，例如 `runtime-foundation.md`

## 8. 废弃文档处理

- 不要静默删除仍有历史价值的设计或开发文档。
- 已废弃文档统一存放到 `docs/expired/`，不要继续混放在 `docs/dev/` 或 `docs/history/` 中。
- 废弃文档需要在文件名中显式带上 `expired` 标记。
- 废弃时应在文档开头补充原因、替代文档和废弃日期。

推荐命名方式：

- `YYYY-MM-DD-<topic>-expired.md`
- `<topic>-expired.md`

## 9. 执行前检查

开始实现前，先快速判断：

1. 这次改动是贴近当前已落地事实，还是在推进目标设计？
2. 是否会触碰 `7Flows IR`、授权模型、事件流、沙盒、发布映射这些高风险边界？
3. 是否需要同步更新 `docs/dev/` 当前索引或 `docs/history/` 开发记录？
4. 是否需要把新的稳定规则沉淀到某个 skill？
5. 是否涉及用户长期偏好，需要记入 `docs/dev/user-preferences.md`？

## 10. 默认工作方式

- 先理解边界，再实现细节。
- 先对齐事实来源，再引入抽象。
- 先沉淀规则，再扩大复用。
- 先保证可追溯，再追求“快做完”。
- AI 协作默认先判断是否命中“元流程 skill + 领域 skill”的组合，不要只加载单个模块 skill 就跳过验证、文档同步和收尾闭环。
- 读取、搜索、查看包含中文的文档或源码时，默认显式使用 UTF-8；如果编码不确定，先确认编码再分析或修改。
- 每轮任务收尾时，默认把“当前事实、文档更新、按优先级排序的下一步计划”一起闭环，不把后续规划留在对话外。
- 提交代码，PowerShell 这边不接受 &&，所以请注意分步提交
