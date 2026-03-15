# 7Flows Docs

当前文档用于沉淀 7Flows 的产品与架构设计基线。

## 文档列表

- [7Flows 产品设计方案](./product-design.md)
- [7Flows 开源与商业策略基线](./open-source-commercial-strategy.md) — 对外切口、版本分层、开源/商业边界、传播对象与付费对象
- [7Flows 技术设计补充文档](./technical-design-supplement.md) — 插件兼容性代理、插件 UI 协议、安全模型、变量传递、节点调试、值缓存
- [Dev 文档索引](./dev/README.md)
- `docs/.taichuy/`：本地开发设计讨论素材与文案草稿，默认不进 Git，也不作为仓库事实入口
- `docs/dev/`：当前有效索引，例如 `runtime-foundation.md`、`user-preferences.md`
- `docs/history/`：按日期归档的开发记录与阶段性决策
- `docs/expired/`：废弃但保留历史价值的文档
- `.agents/skills/`：AI 协作开发时优先复用的专项流程、审查规则和参考资料

## 本地可以可以参考项目仓库和代码：
E:\code\taichuCode\dify
E:\code\taichuCode\n8n
E:\code\taichuCode\openclaw-main
E:\code\taichuCode\xyflow

## 说明

- 当前仓库处于项目启动阶段，`docs` 先采用轻量 Markdown 结构。
- 产品/技术基线、开源/商业策略、当前事实索引和历史留痕应继续分层维护，避免把目标设计、当前实现和本地讨论草稿混写成同一事实源。
- AI 协作开发默认先读 `AGENTS.md`、产品/技术/策略基线、`docs/dev/` 当前事实，再按任务加载 `.agents/skills/` 中对应的 skill。
