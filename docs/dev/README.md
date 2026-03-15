# 7Flows Dev Docs

这里记录面向研发落地的实现说明、约束和后续演进建议。

## 文档列表

- `runtime-foundation.md`
  说明当前已经落地的数据库迁移、运行态模型、最小工作流执行链路，以及 Docker / 本地开发如何使用。
- `user-preferences.md`
  记录开发过程中确认的长期有效用户偏好，供后续实现、文档维护和 skill 优化复用。

## 关联入口

- `docs/open-source-commercial-strategy.md`
  说明 OpenClaw-first 对外切口、开源/商业边界、版本分层与传播/付费对象。
- `.agents/skills/`
  说明 AI 在后端 review、前端 review、组件重构、前端测试和合同优先等任务上的专项工作流。

## 文档维护约定

- `docs/dev/` 只保留当前有效索引文档，不再存放带日期的阶段性开发记录。
- 带日期的开发记录统一写入 `docs/history/`。
- 已废弃但仍有历史价值的文档统一归档到 `docs/expired/`。
- 开发记录需要回答“为什么这样做、影响哪里、如何验证”，避免只写结果不写原因。

## 当前优先级

- 当前研发优先级不再在本页重复维护，统一以 `runtime-foundation.md` 的“下一步规划”为准。
- 如果任务涉及产品切口、版本分层、开源/商业边界或 OpenClaw 场景，应先补读 `docs/open-source-commercial-strategy.md`。
- 如果任务由 AI 协作推进，应按模块读取 `.agents/skills/` 中对应的 skill，而不是只靠单轮对话上下文判断。
