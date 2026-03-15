# 2026-03-16 轻量 Skill Catalog 边界整理

## 背景

围绕 7Flows 是否要在当前阶段引入 SkillHub、通用 skill 管理和本地下载治理，项目讨论里出现了新的稳定结论：

- product skill 需要，但应保持轻量
- skill 本质上是给主 AI 节点注入认知与参考资料
- 真实环境操作仍由 OpenClaw / 本地助手完成
- `.agents/skills` 与产品 skill 不是同一层概念

这些边界此前主要停留在对话中，正式文档还没有完整承接。

## 目标

- 把轻量 product skill 的统一结构写入正式产品/技术基线
- 明确它与 OpenClaw、本地助手、`.agents/skills` 的职责边界
- 避免后续把这条方向误写成“已经要做重型 SkillHub / 本地下载市场”

## 本轮决策

### 1. Product Skill 采用最小统一结构

统一结构先收敛为：

- `name`
- `description`
- `body`
- `references`

其中 reference 复用同样的语义，只是在主 skill 中先暴露 `id / name / description`，正文按需再取。

### 2. Skill 是服务侧知识注入层，不是执行层

- skill 托管在 7Flows 服务侧
- 主要给 `llm_agent` 提供任务指引与参考资料
- 不成为新的 `NodeType`
- 不拥有流程推进权
- 不接管本地运行时、下载或安装

### 3. OpenClaw / 本地助手继续负责真实环境执行

- 7Flows skill 负责主 AI 的认知补强
- OpenClaw / 本地助手负责真实桌面、浏览器、文件和系统环境中的实际操作
- 当前不引入“skill 接管本地助手应用分发”的重模式

### 4. `.agents/skills` 与 product skill 保持分层

- `.agents/skills/*` 是仓库内 AI 协作开发资产
- product skill 是产品运行时资产
- 若未来需要复用仓库 skill 内容，应走显式 publish / adapt 流程，而不是直接把仓库文件当运行时事实源

## 影响范围

- `AGENTS.md`
- `docs/dev/user-preferences.md`
- `docs/product-design.md`
- `docs/technical-design-supplement.md`
- `docs/open-source-commercial-strategy.md`
- `docs/dev/runtime-foundation.md`

本轮没有直接修改 `.agents/skills/*`，因为当前需要沉淀的是产品与仓库基线边界，而不是调整现有协作 skill 的触发流程。

## 当前实现判断

- 当前代码还没有 product-level `SkillDoc` 模型
- 当前代码还没有 skill catalog API / MCP
- 当前代码还没有 `llm_agent` 的 skill 注入链

因此这次更新属于**正式设计基线补齐**，不是“能力已落地”的宣告。

## 验证

- 已执行 `git diff --check`，未发现空白错误或补丁格式问题

## 下一步

1. 先定义最小 `SkillDoc` / reference 数据模型与 workspace scope。
2. 收敛 API / MCP retrieval contract，以及 node 到 skill 的绑定方式。
3. 设计 `llm_agent` 的 skill 注入策略与 reference lazy fetch 触发点。
4. 暂不进入重型 SkillHub、本地下载治理或客户端接管实现。
