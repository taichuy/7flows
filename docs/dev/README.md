# 7Flows 开发文档索引

这里记录面向研发落地的实现说明、约束和后续演进建议。

## 文档列表

- `runtime-foundation.md`
  说明当前已经落地的数据库迁移、运行态模型、最小工作流执行链路，以及 `worker-first` 默认执行边界、sandbox backend 现状和 Docker / 本地开发如何使用。
- `team-conventions.md`
  记录共享协作约定、审查守则与团队级工程偏好。
- `user-preferences.md`
  记录稳定的用户偏好、自治开发偏好与默认汇报口径。

## 关联入口

- `docs/open-source-commercial-strategy.md`
  说明 OpenClaw-first 对外切口、开源/商业边界、版本分层与传播/付费对象。
- `docs/adr/`
  记录需要跨回合长期保留“背景 / 决策 / 后果”的架构与协作决策。
- `.agents/skills/`
  说明 AI 在持续自治开发、开发收尾、skill 治理、后端 review / testing、前端 review / testing、组件重构和合同优先等任务上的专项工作流。

## 文档维护约定

- `docs/dev/` 只保留当前有效索引文档，不再存放带日期的阶段性开发记录。
- `docs/.private/` 只用于当前开发者的本地私有记忆，默认 git ignore，不进入共享仓库。
- 当前开发者自己的按日期开发记录统一写入 `docs/.private/history/`。
- 需要长期站住的架构 / 协作 / 审查决策统一写入 `docs/adr/`。
- 已废弃但仍有历史价值的文档统一归档到 `docs/expired/`。
- 开发记录需要回答“为什么这样做、影响哪里、如何验证”，避免只写结果不写原因。

## 当前优先级

- 当前研发优先级不再在本页重复维护，统一以 `runtime-foundation.md` 的“下一步规划”为准。
- 涉及 sandbox / execution 方向时，先区分“当前代码事实”“目标设计中的 sandbox backend 协议”“社区默认轻执行边界”，不要把三者混成同一层结论。
- 如果任务涉及产品切口、版本分层、开源/商业边界或 OpenClaw 场景，应先补读 `docs/open-source-commercial-strategy.md`。
- 如果任务由 AI 协作推进，应先判断是否命中开发收尾 / skill 治理这类元流程 skill，再按模块读取对应的领域 skill，而不是只靠单轮对话上下文判断。
