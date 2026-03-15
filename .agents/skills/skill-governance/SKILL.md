---
name: skill-governance
description: 用于新增、优化或清理 7Flows 的 `.agents/skills`、AGENTS 协作规则和 skill 索引时，确保规则分层、触发描述、引用文档与项目现状保持一致。
---

# 7Flows Skill 治理

## 何时使用

当任务涉及以下任一场景时使用：

- 新增或重写 `.agents/skills/*/SKILL.md`
- 优化 AI 协作流程、项目开发体系或 AGENTS 规则
- 发现某类 review / testing / refactor / 收尾动作反复出现，值得沉淀成 skill
- 发现现有 skill 与 `docs/dev/runtime-foundation.md`、产品/技术基线或实际目录结构脱节

不要用于：

- 一次性的临时说明
- 只适用于单个文件、且不会复用的零散技巧

## 先读哪些事实

- `AGENTS.md`
- `docs/dev/user-preferences.md`
- `docs/dev/runtime-foundation.md`
- `docs/product-design.md`
- `docs/open-source-commercial-strategy.md`
- `docs/technical-design-supplement.md`
- 目标 skill 及其 `references/*`

## 规则应该落在哪一层

- 仓库级长期协作规则：`AGENTS.md`
- 可重复使用的专项流程：`.agents/skills/<name>/SKILL.md`
- 详细清单、样例、重参考材料：`.agents/skills/<name>/references/*`
- 当前仍成立的实现事实与优先级：`docs/dev/runtime-foundation.md`
- 带日期的决策和实现留痕：`docs/history/*.md`
- 用户明确表达且长期有效的偏好：`docs/dev/user-preferences.md`

不要把所有东西都塞进 skill，也不要把 skill 本该承载的流程退回到对话里。

## 设计原则

### 1. 先写触发条件，再写流程

- `description` 重点描述“什么时候该触发这个 skill”
- 不要在 `description` 里把完整流程提前讲完，避免 AI 只读描述不读正文

### 2. 保持双层结构

- 元流程 skill：负责计划、收尾、验证、skill 漂移治理等跨任务动作
- 领域 skill：负责后端 review、前端 review、组件重构、测试等模块性工作

不要把所有职责做成一个大 skill，也不要只有领域 skill 没有开发闭环。

### 3. 借鉴外部项目，但不要照搬不存在的基础设施

- 可以参考 `superpowers` 的“元流程 skill”思路
- 但不要把 subagent、git worktree、强 TDD 仪式或其他当前仓库默认不存在的机制硬搬进来
- 任何外部经验都要回到 7Flows 自己的 `7Flows IR`、runtime、OpenClaw-first 切口和 community license 边界

### 4. 精简正文，把重资料放到 references

- `SKILL.md` 负责流程和判断
- 大段参考材料、清单、模板放 `references/*`
- 避免直接复制 `AGENTS.md` 大段内容，优先引用仓库已有事实来源

## 改 skill 时必须同步的地方

如果新增、删除、重命名或实质重构 skill，至少检查：

- `AGENTS.md` 的 skill 列表和维护原则
- `README.md` 的 AI 协作与 Skills 说明
- `docs/README.md` 和 `docs/dev/README.md` 的索引入口
- 相关交叉引用的其他 skill
- `docs/dev/runtime-foundation.md` 是否需要同步“当前协作事实”
- `docs/history/*.md` 是否需要新增本轮优化留痕

## 验证要求

- 新 skill 的目录、文件路径、reference 路径必须真实存在
- 搜索旧 skill 名称，确认没有留下过期引用
- 新 skill 的 `description` 要能独立表达触发场景
- 如果这次优化改变了仓库默认协作方式，要补文档索引和历史记录

## 常见反模式

- 把项目当前事实只写在 skill 里，不同步到 `runtime-foundation.md`
- 把用户稳定偏好只写在 skill 里，不同步到 `user-preferences.md`
- 直接搬用 Dify、n8n、superpowers 的术语和目录，假装仓库已经有那套基础设施
- skill 名字在 README 里有，目录里没有；或者目录里有，索引里没人知道
