# 7Flows 文档索引

当前文档用于沉淀 7Flows 的产品与架构设计基线。

## 文档列表

- [7Flows 产品设计方案](./product-design.md)
- [7Flows 开源与商业策略基线](./open-source-commercial-strategy.md) — 对外切口、版本分层、开源/商业边界、传播对象与付费对象
- [7Flows 技术设计补充文档](./technical-design-supplement.md) — 插件兼容性代理、插件 UI 协议、安全模型、变量传递、节点调试、值缓存，以及 sandbox backend 协议边界
- [Dev 文档索引](./dev/README.md)
- [ADR 索引](./adr/README.md)
- `docs/.taichuy/`：本地开发设计讨论素材与文案草稿，默认不进 Git，也不作为仓库事实入口
- `docs/.private/`：当前开发者自己的本地私有笔记目录与按日期开发留痕目录，默认不进 Git，也不作为仓库事实入口
- `docs/dev/`：当前有效索引，例如 `runtime-foundation.md`、`team-conventions.md`
- `docs/adr/`：架构与长期协作决策记录
- `docs/history/`：不再作为共享 history 使用，当前只保留迁移说明
- `docs/expired/`：废弃但保留历史价值的文档
- `.agents/skills/`：AI 协作开发时优先复用的元流程 skill、专项流程、审查规则和参考资料，例如持续自治开发、开发收尾、审查、测试和组件拆分

## 本地可以可以参考项目仓库和代码：
E:\code\taichuCode\dify
E:\code\taichuCode\n8n
E:\code\taichuCode\openclaw-main
E:\code\taichuCode\xyflow

## 说明

- 当前仓库处于项目启动阶段，`docs` 先采用轻量 Markdown 结构。
- 产品/技术基线、开源/商业策略、当前事实索引和本地私有留痕应继续分层维护，避免把目标设计、当前实现和个人过程记录混写成同一事实源。
- 当前共享仓库中的重点文档、ADR、skills 与新增治理条目默认使用中文；如果关键入口里仍有英文且影响检索，应优先翻回中文。
- 涉及 sandbox / execution 方向时，优先区分“社区默认轻执行”“开放的 sandbox backend 协议”和“当前代码是否已真正落地”，不要把目标设计误写成当前事实。
- AI 协作开发默认先读 `AGENTS.md`、产品/技术/策略基线、`docs/dev/` 当前事实，再判断是否需要“元流程 skill + 领域 skill”组合。
