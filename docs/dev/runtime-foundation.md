# 运行时基础索引

## 文档定位

- 本文只保留当前仍成立、且对后续开发有直接指导作用的运行时事实、结构热点和优先级。
- 产品与技术基线见 `docs/product-design.md` 和 `docs/technical-design-supplement.md`。
- 开源 / 商业边界与对外切口见 `docs/open-source-commercial-strategy.md`。
- 稳定的用户偏好与自治开发偏好见 `docs/dev/user-preferences.md`。
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
- 发布与排障相关前端已经具备最小操作面，但仍处于“可继续扩展”的阶段，不应假装 UI 已经完全成品化。

### AI 与人协作层

- `runs / node_runs / run_events` 仍是运行事实主来源，run detail、execution overview、trace export、callback waiting summary 与 published invocation detail 已形成最小排障链路。
- `llm_agent` 已经在朝 phase pipeline 演进，assistant 仍只负责 evidence 提炼，不拥有流程控制权。
- Skill Catalog 最小链路已成立：`SkillDoc`、catalog API、phase binding、reference retrieval 与 runtime 注入主链已经存在。

### AI 治理层

- 敏感访问主链已覆盖 credential、context、tool 与 published detail 等关键入口，`SensitiveAccessRequest / ApprovalTicket / NotificationDispatch` 已经进入统一治理主链。
- callback waiting、approval pending、notification retry 等 operator 动作已经能够在当前页给出结果解释与 follow-up 摘要，但这部分仍需继续加厚。

### 运行基础 / 发布 / 兼容层

- 工作流定义已经具备最小结构校验、immutable version snapshot 与 compiled blueprint 绑定。
- Runtime 已支持 DAG 调度、条件 / 路由分支、join、edge mapping、waiting / resume、callback ticket、artifact 引用和统一事件落库。
- Published surface 已具备 native / OpenAI / Anthropic 三类协议入口，并接上 API key、缓存、调用审计与最小 SSE 能力。
- `execution class` 与 `sensitivity_level` 继续分离建模；`sandbox_code` 与高风险 tool / plugin 路径已经开始沿 capability-driven readiness 与 fail-closed 主链推进。
- system overview 与 editor preflight 已经能够暴露部分 sandbox readiness / governance gap，但强隔离链路还没有完全闭环。

### 协作文档层

- 当前共享仓库中的重点文档、skills、ADR 与新增治理条目默认使用中文。
- 稳定规则集中在 `AGENTS.md`、`docs/dev/team-conventions.md`、`docs/dev/user-preferences.md` 与本文；个人按日期过程留痕放入 `docs/.private/history/`。

## 当前愿景目标完整度

- 用户层：已有稳定骨架，正处于从“能操作”走向“更完整可持续使用”的阶段。
- AI 与人协作层：已有最小闭环，trace / diagnostics / operator 入口已建立，但 published detail、skill trace 与跨入口解释仍需继续统一。
- AI 治理层：已有最小主链，敏感访问、审批、通知与 waiting 解释已经进入同一治理方向，但 operator 实际工作面还不够厚。
- 运行基础 / 发布 / 兼容层：runtime 与 publish 主骨架稳定，compat 与 skill catalog 方向明确，但强隔离与统一高风险执行还没有完全闭环。
- 当前全局最大缺口：graded execution / 强隔离主链、`WAITING_CALLBACK` 的 durable resume 闭环，以及 editor / publish 剩余关键场景的完整度。

## 下一步规划

1. **P0：继续把 graded execution 扩成统一的高风险执行主链**
   - 继续把 `sandbox_code`、compat `tool/plugin`、native tool 的 execution capability、profile、dependency、backend readiness 与 fail-closed 语义收口到同一条事实链。
   - 让 system overview、editor preflight、runtime dispatch 与 trace explanation 使用同一份 execution / sandbox 事实，而不是各自维护不同口径。

2. **P0：继续补齐 `WAITING_CALLBACK` 的 durable resume 闭环**
   - 继续加厚 callback waiting、approval pending、notification retry 的 operator follow-up。
   - 优先推进后台唤醒、scheduler / callback bus 相关缺口，以及跨 run detail / publish detail / inbox 的统一 blocker explanation。

3. **P0：继续加厚统一敏感访问控制闭环**
   - 继续补审批、通知与批量治理的结果解释、target preset、审计语义和必要的操作边界。
   - 保持统一治理主链，不新增第二套旁路模型。

4. **P1：继续提高 workflow editor 与 publish 的完整度**
   - 继续补 sensitive access policy 入口、advanced JSON / structured form 边界、字段级聚焦与 preflight 连续性。
   - 保持 editor 的结构化治理入口和后端真实语义对齐，不回退成只靠自由 JSON。

5. **P1：继续治理 run diagnostics / publish detail / skill trace 的共享解释层**
   - 继续统一 waiting、execution、operator action 与 published invocation detail 的解释模型。
   - 让 published/operator 入口也能消费与 runtime 一致的 skill request / load trace。

6. **P1：继续治理 runtime、compat 与 editor 的真实热点文件**
   - 只在职责混杂、边界泄漏、改动传播过大时拆分热点模块。
   - 继续避免“为了看起来更整齐”而做非阻塞型重构。
