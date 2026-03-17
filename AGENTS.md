# 7Flows AGENTS 协作指南

本文件定义 7Flows 仓库级协作约定。项目仍处于构建初期，优先保证方向一致、文档可追溯、约束可沉淀。

- 当前共享仓库中的重点文档、ADR、skills 和新增治理条目默认使用中文；如果关键入口里出现英文且已经影响检索，应优先翻回中文。

## 1. 项目定位

- 7Flows 是面向多 Agent 协作的可视化工作流平台，不是 Dify ChatFlow 的复刻，也不是通用低代码平台。
- 对外传播短期优先围绕 OpenClaw / 本地 AI 助手“黑盒变透明”的控制面切口展开，但内部产品内核仍是多 Agent workflow 平台，不退化为某个上游产品的 UI 包装层。
- 平台内部统一以 `7Flows IR` 作为事实模型，外部协议通过适配层映射，不允许反向让 OpenAI / Anthropic / Dify 协议主导内部设计。
- 开源给协作，商业给治理；商业能力必须建立在同一 kernel 上，不允许另起执行引擎、第二套流程模型或第二套内部 DSL。
- 仓库授权当前以 `LICENSE` 和 `docs/open-source-commercial-strategy.md` 为准；若采用 Apache 2.0 基底 + 附加条件的 community license，就不要再把项目误写成纯 `MIT` 或纯 `Apache-2.0`。
- 首版核心关注点是：可编排、可调试、可发布、可兼容、可追溯。

## 2. 当前事实来源

进行设计、实现、审查前，优先按下面顺序建立上下文：

1. `docs/dev/user-preferences.md`
   稳定的用户偏好、自治开发偏好和默认汇报口径。
2. `docs/product-design.md`
   产品定位、核心模型、MVP 边界、发布策略、前端骨架。
3. `docs/open-source-commercial-strategy.md`
   对外切口、开源/商业边界、版本分层、传播对象与付费对象。
4. `docs/technical-design-supplement.md`
   插件兼容、插件 UI、安全、变量传递、调试模式、缓存等技术细则。
5. `docs/dev/runtime-foundation.md`
   当前已落地运行时事实和近期优先级。
6. `docs/dev/team-conventions.md`
   当前共享协作约定、审查守则与团队级工程偏好。
7. `README.md`
   当前工程结构与本地开发方式。
8. `.agents/skills/*/SKILL.md`
   面向具体任务的专项工作流与审查规则。

补充约定：

- `docs/.taichuy/` 只用于本地开发设计讨论素材、文案草稿和内部推导，不纳入 Git，也不是默认事实来源；只有用户明确要求时再读取。
- `docs/.private/` 只用于当前开发者自己的本地笔记、环境偏好、临时记忆与按日期开发留痕，必须保持 git ignore，不得作为共享事实来源；只有当前本地开发者明确需要时才读取。

如果“设计文档”和“当前实现”冲突：

- 代码与 `docs/dev/` 反映当前事实；
- `docs/.private/history/` 只反映当前本地开发者自己的阶段性留痕，不是共享事实来源；
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

### 3.4 协作与供应链安全

- `AGENTS.md`、`.agents/skills/`、`docs/dev/team-conventions.md`、`docs/adr/`、`scripts/`、`docker/`、CI/workflow 配置、package manager hook、shell / PowerShell / Python / batch 脚本，以及 prompt / automation instruction 都属于 `P0` review 范围。
- 允许在本地验证后自动提交到分支，但涉及上述高风险范围的改动在合并前必须经过人工审查，并使用专门的 review skill 做谨慎总结。
- 默认仓库 PR 目标分支是 `taichuy_dev`；除非维护者明确说明临时替代分支，否则不要改默认口径。
- 本仓库开发与测试路径必须保持 local-first、loopback-first；不要引入必需的远程脚本、CDN 资源、外部 webhook、外部通知端点或第三方托管依赖来完成本地开发主链。
- 禁止把任何非本地开发组件的外部链接、远程安装脚本、`curl | bash`、隐藏下载动作或隐式联网执行路径写入共享开发脚本、skill、prompt、README 或协作守则。
- 允许引用的开发依赖应优先是 workspace 内文件、本机 sibling repo、本地回环服务或仓库内已有组件；任何超出该范围的连接都应视为异常并在 review 中重点审查。

## 4. 目录协作约定

- `api/`：FastAPI、运行时、迁移、任务、后端基础设施。
- `web/`：前端工作台、未来工作流编辑器和调试面板。
- `docs/`：产品与技术基线文档，以及总索引。
- `docs/.taichuy/`：本地开发设计讨论素材和草稿，默认 git ignore，不作为默认检索入口或仓库知识基线。
- `docs/.private/`：当前开发者的本地私有笔记目录，默认 git ignore，不进入共享仓库；如需按日期保留个人开发留痕，放在 `docs/.private/history/`。
- `docs/dev/`：当前有效的开发索引文档，仅保留 `runtime-foundation.md`、`team-conventions.md` 等持续维护的当前事实。
- `docs/adr/`：需要跨回合长期保留“背景 / 决策 / 后果”的架构与协作决策记录。
- `docs/history/`：不再作为共享 history 使用，当前仅保留占位说明，提醒按日期个人留痕迁到 `docs/.private/history/`。
- `docs/expired/`：已废弃但仍保留历史价值的文档，不作为默认检索入口。
- `.agents/skills/`：仓库内可复用技能，承载专项任务规范与参考资料；它属于 AI 协作开发资产，不等同于产品运行时的 `SkillDoc`。

## 5. 共享规则与本地记忆

开发过程中，需要先区分“共享规则”与“个人记忆”，不要再把两者混写在同一份共享文档里。

共享规则写入 `docs/dev/team-conventions.md`，适用于：

- 长期有效的团队级工程约定
- 多个开发者 / 多个 AI 回合都应遵守的协作规则
- 审查守则、验证基线、提交与文档闭环规则
- 已从单人经验提升为共享仓库规范的禁用项

稳定的用户偏好与自治开发偏好写入 `docs/dev/user-preferences.md`，适用于：

- 当前用户长期稳定强调的工程判断标准
- 自治开发的默认上下文建立顺序、选题方式和汇报口径
- 适合跨多个 AI 会话持续复用、但不属于团队普适协作守则的稳定偏好

本地个人记忆写入 `docs/.private/`，适用于：

- 当前开发者自己的机器偏好、代理、提醒脚本、个人工作流快捷方式
- 不适合进入共享仓库的临时实验记录
- 只对某一个本地开发者有意义的长期记忆
- 当前开发者自己的按日期开发留痕

不要写入共享仓库的内容：

- 当前任务的一次性口头要求
- 仅对单个开发者成立的本地环境细节
- 已被代码或正式文档完全覆盖、没有复用价值的碎片信息

如果某条本地经验升级为共享规则：

- 仓库级通用规则，更新本 `AGENTS.md`
- 团队级协作约定，更新 `docs/dev/team-conventions.md`
- 用户稳定偏好或自治开发偏好，更新 `docs/dev/user-preferences.md`
- 领域专项规则，更新对应 `.agents/skills/.../SKILL.md` 或其 `references/`
- 需要长期保留背景 / 取舍 / 后果的关键决策，额外写入 `docs/adr/`

## 6. Skill 使用与维护

### 6.1 当前仓库内技能

- `autonomous-development`
  用于用户要求 AI 作为持续迭代开发者，自主判断阶段问题、选择单轮最高优先级任务，并按 7Flows 的工程观推进主链闭环。
- `development-closure`
  用于一轮开发收尾时统一处理验证、共享文档同步、本地留痕取舍、Git 提交与下一步规划。
- `skill-governance`
  用于优化 `.agents/skills/`、AGENTS 协作流程和 skill 索引，同步治理 skill 漂移与分层规则。
- `safe-change-review`
  用于审查 prompt / skill / docs governance / script / local-execution boundary 等高风险改动，在合并前执行 P0 级安全与供应链检查。
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
- 同类收尾遗漏已反复出现，例如漏验证、漏更 `runtime-foundation`、漏更 `user-preferences`、漏提交 Git
- 用户多次强调某类实现方式或禁用项
- 现有 skill 与项目现状明显脱节
- 前后端、实现与收尾之间出现明显能力断层
- 某个专项工作已经形成固定模板、检查清单或参考路径

## 7. 开发记录与溯源

共享仓库中的文档应优先保留“当前事实、稳定规则、长期决策”，不要继续把按日期的个人开发过程堆成公共 history。

建议按下面分层维护：

- 当前事实、结构热点与近期优先级：更新 `docs/dev/runtime-foundation.md`
- 稳定的用户偏好与自治开发偏好：更新 `docs/dev/user-preferences.md`
- 团队级共享协作守则：更新 `docs/dev/team-conventions.md`
- 跨多个回合都需要保留“背景 / 决策 / 后果”的决策：更新 `docs/adr/`
- 当前开发者自己的按日期开发留痕：如确有需要，写入 `docs/.private/history/`

每次完成一轮开发后，额外要求：

- 必须同步更新 `docs/dev/runtime-foundation.md` 中与当前事实相关的部分。
- 若稳定的自治开发偏好、汇报口径或公共文档分层发生变化，必须同步更新 `docs/dev/user-preferences.md`。
- 若共享协作守则变化，必须同步更新 `docs/dev/team-conventions.md`、`AGENTS.md` 或相关 skill。
- 若存在长期站住的架构 / 协作 / 安全决策，必须同步更新 `docs/adr/`。
- 当前开发者如果确实需要保留个人过程连续性，可在 `docs/.private/history/` 写本地留痕，但不要把它重新抬成共享事实源。
- 必须在收尾阶段进行充分测试；如果测试不通过，应继续修复代码或更新测试脚本，直到结果正确、零警告、零错误；若受外部阻塞暂时无法达到，必须在最终汇报中明确说明。
- 必须在完成必要验证后执行一次非交互式 Git 提交；如果本轮只有中间态探索、暂不适合提交，需要在最终汇报里明确说明原因。
- 必须在最终汇报中结合当前项目现状给出下一步开发建议，并显式标明优先级顺序。

本地个人留痕若需要按日期命名，建议使用：

- `docs/.private/history/YYYY-MM-DD-<topic>.md`

## 8. 废弃文档处理

- 不要静默删除仍有历史价值的设计或开发文档。
- 已废弃文档统一存放到 `docs/expired/`，不要继续混放在 `docs/dev/` 或共享当前事实入口中。
- 废弃文档需要在文件名中显式带上 `expired` 标记。
- 废弃时应在文档开头补充原因、替代文档和废弃日期。

推荐命名方式：

- `YYYY-MM-DD-<topic>-expired.md`
- `<topic>-expired.md`

## 9. 执行前检查

开始实现前，先快速判断：

1. 这次改动是贴近当前已落地事实，还是在推进目标设计？
2. 是否会触碰 `7Flows IR`、授权模型、事件流、沙盒、发布映射这些高风险边界？
3. 是否需要同步更新 `docs/dev/` 当前索引、`docs/dev/user-preferences.md`，或当前开发者自己的本地留痕？
4. 是否需要把新的稳定规则沉淀到某个 skill？
5. 是否产生了新的共享协作约定，需要记入 `docs/dev/team-conventions.md`、`AGENTS.md`、某个 skill，或仅应保留在 `docs/.private/`？

## 10. 默认工作方式

- 先理解边界，再实现细节。
- 先对齐事实来源，再引入抽象。
- 先沉淀规则，再扩大复用。
- 先保证可追溯，再追求“快做完”。
- AI 协作默认先判断是否命中 `autonomous-development`、`development-closure` 等“元流程 skill + 领域 skill”的组合，不要只加载单个模块 skill 就跳过验证、文档同步和收尾闭环。
- 共享仓库中的新规则、skill、ADR、当前事实索引和治理文档默认使用中文；若关键入口仍有英文且影响检索，应优先翻回中文。
- 读取、搜索、查看包含中文的文档或源码时，默认显式使用 UTF-8；如果编码不确定，先确认编码再分析或修改。
- 每轮任务收尾时，默认把“当前事实、文档更新、按优先级排序的下一步计划”一起闭环，不把后续规划留在对话外。
- 提交代码，PowerShell 这边不接受 &&，所以请注意分步提交
