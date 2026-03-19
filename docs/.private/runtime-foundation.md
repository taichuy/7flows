# 运行时基础索引

## 文档定位

- 本文只保留当前仍成立、且对后续开发有直接指导作用的运行时事实、结构热点和优先级。
- 产品与技术基线见 `docs/product-design.md` 和 `docs/technical-design-supplement.md`。
- 开源 / 商业边界与对外切口见 `docs/open-source-commercial-strategy.md`。
- 稳定的用户偏好与自治开发偏好见 `docs/.private/user-preferences.md`。
- 共享协作约定见 `AGENTS.md` 与 `docs/dev/team-conventions.md`。
- 当前开发者如需保留按日期的个人开发留痕，应写入 `docs/.private/history/`；这类内容不是共享事实来源。
- 需要长期保留“背景 / 决策 / 后果”的事项，写入 `docs/adr/`。
- 如果目标设计与当前实现冲突，优先以代码事实和 `docs/dev/` 为准，再决定修实现还是补文档。

## 当前阶段判断

- 项目已经具备“可编排、可调试、可发布、可追溯”的后端与前端基础骨架，不再是只有初始化脚手架的阶段。
- 当前还没有进入“只剩界面润色或人工全链路验收”的阶段，后续仍应围绕主链路闭环继续推进，因此本轮默认不触发人工界面设计通知脚本。
- 公共文档不再维护按日期的共享 history；共享层只保留稳定规则、当前事实和优先级，个人过程留痕转入 `docs/.private/history/`。

## 当前已成立的事实

### 用户层

- 首页工作台已经接上 system overview、plugin registry、credential store、workflow library、workspace starters、run diagnostics、publish panel 与 sensitive access inbox 等入口。
- Workflow editor 已经能够创建、编辑、保存最小工作流定义；结构化表单已覆盖 `runtimePolicy.execution / retry / join`、节点 `input/output schema` 与 workflow `publish` draft 的核心字段。
- Workflow editor 的 execution preflight 现已同时消费聚合 `sandbox_readiness` 与逐个 `sandbox_backends` capability，`sandbox_code`、tool 节点、`llm_agent.allowedToolIds` / `mockPlan.toolCalls` 的默认强隔离路径都会给出 backend 级 fail-closed 解释，而不再只停留在聚合 readiness 口径。
- 发布与排障相关前端已经具备最小操作面，但仍处于“可继续扩展”的阶段，不应假装 UI 已经完全成品化。

### AI 与人协作层

- `runs / node_runs / run_events` 仍是运行事实主来源，run detail、execution overview、trace export、callback waiting summary 与 published invocation detail 已形成最小排障链路。
- `WAITING_CALLBACK` 的 due resume monitor 现已把 `scheduled_resume.requeued_at / requeue_source` 写回同一事实链，并按 scheduler interval 做最近重入防重，避免同一 waiting run 在 worker 尚未消费前被重复补发，同时保留超窗后的再次补偿能力。
- sensitive access inbox 现已直接消费 run execution view 的 `skill_trace`，operator 不需要再跳回 run detail 才能确认 execution focus 节点实际加载了哪些 skill references。
- run detail、published invocation detail 与 sensitive access inbox 现在都会优先消费后端统一生成的 `execution_focus_explanation`，同一 focus node 的 primary signal / follow-up 不再依赖三个入口各自拼接文案。
- sensitive access inbox 里的 callback waiting follow-up 现已复用同一 `node_run` 下的整节点 `sensitive_access_entries`，并在 execution view 尚未及时回填当前票据时合并当前 inbox 条目，避免 operator 只看到单票据而漏掉同节点的 approval / notification blockers。
- callback waiting summary 现在也开始消费后端统一生成的 `callback_waiting_explanation`：run detail、publish detail 与 inbox card 会围绕同一份 primary signal / follow-up 展示 waiting blocker，不再各自重写 headline。
- `RunDetail.execution_focus_node` 现已直接携带 `callback_waiting_explanation`，`fetchRunSnapshot` 也对旧契约保留 execution-view 回退：单 run snapshot 不再因为 run detail 已带 execution focus 就把 waiting blocker explanation 吃丢。
- publish activity list 现已补齐顶层 `execution_focus_explanation / callback_waiting_explanation` 共享契约：活动卡片可以直接消费和 detail / run snapshot 同名字段，并对旧数据保留 `run_follow_up.sampled_runs` / waiting lifecycle 回退，不再只停留在聚合计数。
- publish activity list 与 invocation detail 现在也开始真正消费 `run_follow_up.sampled_runs[].snapshot` 里的 compact focus evidence：sampled run 不再只显示状态 / waiting reason，已经会把 artifact / tool call / raw_ref 计数、compact evidence card 与 snapshot summary 一起带回发布入口，减少从 publish 入口排障时再跳回 run detail 的必要性。
- run trace export、published invocation export、published invocation detail 与 cache inventory 的敏感访问阻断响应现在都会携带统一 `outcome_explanation + run_snapshot + run_follow_up` 契约，前端阻断卡片也直接复用同一份 canonical follow-up 结果链，不再只剩 detail 文案和票据状态。
- 本轮又把 sensitive access 阻断响应里的 run 上下文回填补齐到 metadata-only `run_ids` 场景：cache inventory / published invocation export 不再因为 `access_request.run_id` 为空就丢失 `run_snapshot` 与 `run_follow_up`，`SensitiveAccessBlockedCard` 也已有独立测试覆盖 canonical follow-up 的静态渲染入口。
- sensitive access inbox entry card 已切到共享 `SensitiveAccessInlineActions + InlineOperatorActionFeedback + OperatorFocusEvidenceCard` 结果链：审批 / 通知重试不再停留在纯文本反馈，inbox entry 上的 execution focus evidence 也开始复用同一张 evidence card，减少 operator 结果页之间的重复拼装与体验断层。
- callback waiting follow-up 现已把 focus node 的 skill trace / node-level skill loads 一起收进共享 `CallbackWaitingSummaryCard`：run overview blocker、sensitive access inbox 与 publish callback section 会围绕同一张卡片展示 waiting 解释、focus evidence 与 injected references，不再由每个入口单独拼一套 skill trace 摘要。
- `llm_agent` 已经在朝 phase pipeline 演进，assistant 仍只负责 evidence 提炼，不拥有流程控制权。
- Skill Catalog 最小链路已成立：`SkillDoc`、catalog API、phase binding、reference retrieval 与 runtime 注入主链已经存在。

### AI 治理层

- 敏感访问主链已覆盖 credential、context、tool 与 published detail 等关键入口，`SensitiveAccessRequest / ApprovalTicket / NotificationDispatch` 已经进入统一治理主链。
- 审批票据现已具备 TTL、定时过期扫描、过期拒绝恢复与通知跳过保护，operator 决策与后台 scheduler 会沿同一事实链写回 request / ticket / notification / resume。
- callback waiting、approval pending、notification retry 等 operator 动作已经能够在当前页给出结果解释与 follow-up 摘要；`callback cleanup` API 现在也会回写后端统一生成的 `run_follow_up`，前端 cleanup 结果开始优先消费同一份 primary signal / follow-up，而不再只靠本地拼接 run snapshot；手动恢复结果也已补上后端 `callback_blocker_delta`，前端开始优先消费同一事实链并仅额外补 automation health 摘要。
- callback summary 的共享解释层已打通；敏感访问审批决策、通知重试及其批量动作的 `outcome_explanation`、单 run `run_snapshot` 与批量 `run_follow_up` 已开始一起下沉到后端，前端优先消费同一份 primary signal / follow-up 与 follow-up snapshot；`fetchRunSnapshot` 也已不再只停留在 `waiting_reason` 降级口径。
- 手动恢复与 callback cleanup 的 operator action result 现已继续补齐 compact `run_snapshot` 共享契约；前端命中后端 snapshot 时不再额外触发单 run `fetchRunSnapshot`，减少双请求和页面级兜底拼装，也让 action result 能直接沿同一份 execution focus / callback waiting / artifact evidence 事实链汇报。
- operator action outcome 已继续沿共享解释模型收口；敏感访问审批决策、通知重试及其批量动作的 `callback_blocker_delta` 已开始下沉到后端，前端不再需要为这些 action 额外拉取前后 blocker 快照再临时拼结果消息。

### 运行基础 / 发布 / 兼容层

- 工作流定义已经具备最小结构校验、immutable version snapshot 与 compiled blueprint 绑定。
- Runtime 已支持 DAG 调度、条件 / 路由分支、join、edge mapping、waiting / resume、callback ticket、artifact 引用和统一事件落库。
- Published surface 已具备 native / OpenAI / Anthropic 三类协议入口，并接上 API key、缓存、调用审计与最小 SSE 能力。
- `execution class` 与 `sensitivity_level` 继续分离建模；`sandbox_code` 与高风险 tool / plugin 路径已经开始沿 capability-driven readiness 与 fail-closed 主链推进。
- 非 `tool` 的普通 inline 节点若显式请求 `sandbox / microvm`，Runtime 现在会在 node preparation 阶段直接标记 unavailable 并保持 fail-closed，不再静默 fallback 到 inline；对应 run execution focus explanation 也已改成统一 blocker 口径。
- tool / plugin 的 `sandbox / microvm` 路径已进一步收口到统一 sandbox tool runner 主链：compat adapter 与 native tool 在 backend 声明 `supports_tool_execution` 且 capability / profile / dependency 匹配时，都会走同一条 sandbox-backed runner；只有 backend 不支持 runner、能力不兼容或不可用时才继续诚实 fail-closed。
- sandbox-backed tool runner 的 normalized result contract 已进一步接回统一事实链：`tool_call_records` 现已持久化 `response_content_type / response_meta`，run view 与 diagnostics UI 也开始直接消费 backend 返回的 `summary / content_type / raw_ref / meta`，普通 `tool` 节点继续复用 runner 产出的 artifact ref，而不是在宿主侧再造一份本地 artifact。
- run execution focus explanation 已补上针对 tool 强隔离未兑现的统一 blocker 文案；workflow 保存、workspace starter 保存、plugin dispatch trace 与 runtime blocked run 现在围绕同一条 shared fact 收口。
- system overview 与 editor preflight 已经能够暴露部分 sandbox readiness / governance gap，但强隔离链路还没有完全闭环。

### 协作文档层

- 当前共享仓库中的重点文档、skills、ADR 与新增治理条目默认使用中文。
- 稳定规则集中在 `AGENTS.md`、`docs/dev/team-conventions.md`、`docs/.private/user-preferences.md` 与本文；个人按日期过程留痕放入 `docs/.private/history/`。

## 当前愿景目标完整度

- 用户层：已有稳定骨架，正处于从“能操作”走向“更完整可持续使用”的阶段。
- AI 与人协作层：已有最小闭环，trace / diagnostics / operator 入口已建立；sensitive access inbox 与部分 operator 回读入口已接上后端 canonical execution focus 与 skill trace，但 operator blocker explanation 与 follow-up 仍需继续加厚。
- AI 治理层：已有最小主链，敏感访问、审批、通知与 waiting 解释已经进入同一治理方向，但 operator 实际工作面还不够厚。
- 运行基础 / 发布 / 兼容层：runtime 与 publish 主骨架稳定，compat 与 skill catalog 方向明确，但强隔离与统一高风险执行还没有完全闭环。
- 当前全局最大缺口：graded execution / 强隔离主链、`WAITING_CALLBACK` 的 durable resume 闭环，以及 editor / publish 剩余关键场景的完整度。

## 下一步规划

1. **P0：继续把 graded execution 扩成统一的高风险执行主链**
   - 继续把 `sandbox_code`、compat `tool/plugin`、native tool 的 execution capability、profile、dependency、backend readiness 与 fail-closed 语义收口到同一条事实链。
   - system overview 与 editor preflight 已进一步对齐到同一份 execution / sandbox 事实；native / compat tool 的强隔离路径也已共享 sandbox-backed tool runner contract，本轮已把 normalized result 的 `summary / content_type / raw_ref / meta` 接回 runtime tool fact 链，并补到 run view / diagnostics 入口，减少 sandbox tool result 在 diagnostics 与 artifact 语义上的再次分叉。
   - sensitive access inbox 已补齐 focus node 的 tool runner 事实展示；本轮又把 compact `run_snapshot` / `run_follow_up.sampled_runs[].snapshot` 对齐为携带 `execution_focus_node_name/type`、artifact refs、artifact sample 与 tool call sample 的 shared fact，sensitive access operator action result 与 `fetchRunSnapshot` 也开始直接消费同一份 focus evidence，而不是额外跳回 run detail 再拼装。

2. **P0：继续补齐 `WAITING_CALLBACK` 的 durable resume 闭环**
- 继续加厚 callback waiting、approval pending、notification retry 的 operator follow-up。
- 本轮已补上 due resume monitor 的最近重入防重与 requeue trace，并让 sensitive access inbox 消费同一份 canonical execution focus 与 skill trace；后续又把 callback summary 解释下沉到后端 `callback_waiting_explanation`，并让 `fetchRunSnapshot` 对齐 execution focus。下一步优先推进批量治理结果、operator action outcome 与更多 run detail 入口的共享解释层。

3. **P0：继续加厚统一敏感访问控制闭环**
   - 继续补 target preset、审计语义，以及 inbox / run detail / publish detail 之间的统一 follow-up；批量审批 / 通知重试的 outcome explanation 已下沉，下一步重点转向 action detail 与更多治理面共享解释。
   - 保持统一治理主链，不新增第二套旁路模型。

4. **P1：继续提高 workflow editor 与 publish 的完整度**
   - 继续补 sensitive access policy 入口、advanced JSON / structured form 边界、字段级聚焦与 preflight 连续性。
   - 保持 editor 的结构化治理入口和后端真实语义对齐，不回退成只靠自由 JSON。

5. **P1：继续治理 run diagnostics / publish detail / skill trace 的共享解释层**
   - 继续统一 waiting、execution、operator action 与 published invocation detail 的解释模型。
- `execution_focus_explanation`、`callback_waiting_explanation`、敏感访问 operator `outcome_explanation` 与 action 级 `callback_blocker_delta` 已开始收口到后端事实链；单 run `run_snapshot`、批量 `run_follow_up`、publish activity list 与 `fetchRunSnapshot` 已进一步对齐，`callback cleanup` 与手动恢复结果也开始吃同一份 blocker / follow-up 事实链；本轮又把 compact focus evidence 接进 operator snapshot，让 action result 也能直接提示 artifact / raw_ref / backend 级证据。
- 本轮已把 publish activity list、sensitive access operator action result 与 inbox entry card 都补齐为 shared explanation / focus evidence contract 的消费方；下一步可继续把同类 contract 推进到更多 operator result 页面，减少双请求和页面级兜底拼装。
- 本轮又把 publish activity list / invocation detail 的 sampled run UI 补齐为真正消费 compact focus evidence：前端已开始复用统一 `OperatorFocusEvidenceCard` 展示 tool call / artifact preview 与 sampled count，不再停留在聚合计数；下一步可继续把相同 snapshot evidence contract 推进到更多 action detail / follow-up 页面，减少“有共享事实但入口仍只显示聚合计数”的残留断层。
- 本轮已把 sensitive access bulk governance card 从纯文字摘要推进为真正消费 `sampledRuns[].snapshot` 的 focus evidence 入口：批量治理结果现在会直接展示 sampled run 的 compact snapshot 摘要、focus node / waiting reason、artifact / tool / raw_ref 计数与 run detail 跳转，减少 operator 在 bulk action 后还要回退到 inbox / run detail 才能定位受影响 run 的断层。
- 本轮又把 callback waiting follow-up 的 skill trace 展示下沉到共享 `CallbackWaitingSummaryCard`：run overview blocker、inbox callback follow-up 与 publish callback section 现在统一复用同一份 skill trace / node-level load 解释模型；下一步可继续把相同 contract 往更多 callback / approval action detail 结果页推进，减少详情页外另起 skill trace 摘要卡片的残留断层。

6. **P1：继续治理 runtime、compat 与 editor 的真实热点文件**
   - 只在职责混杂、边界泄漏、改动传播过大时拆分热点模块。
   - 继续避免“为了看起来更整齐”而做非阻塞型重构。


