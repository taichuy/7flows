---
memory_type: project
topic: 04 editor 第一版前端方向已对标 Dify chatflow 收口
summary: 用户于 `2026-04-15 12` 确认 `04` 模块编辑器第一版前端方向整体对标 Dify chatflow，保留 `03` 应用壳层，只在无限画布内部承载标题、历史、发布、节点新增、配置面板和画布控制。
keywords:
  - module-04
  - editor
  - chatflow
  - dify
  - canvas
  - draft
match_when:
  - 需要继续讨论或实现 04 editor
  - 需要判断 agentFlow 编辑器第一版的页面骨架和交互挂点
created_at: 2026-04-15 12
updated_at: 2026-04-15 12
last_verified_at: 2026-04-15 12
decision_policy: verify_before_decision
scope:
  - docs/superpowers/specs/1flowbase/modules/04-chatflow-studio
  - web
---

# 04 editor 第一版前端方向已对标 Dify chatflow 收口

## 时间

`2026-04-15 12`

## 谁在做什么

- 用户继续推进 `04 agentFlow`，从 Draft / Version / Graph / 变量绑定边界，转入前端编辑器页面结构与交互设计。
- AI 根据用户明确要求，以 `../dify` 的 chatflow 为交互基准，整理 1flowbase 第一版 editor 的页面骨架和核心交互。

## 为什么这样做

- `03` 已完成应用内宿主壳层与编排入口，`04` 当前最缺的不是数据边界，而是“编辑器具体长什么样、操作挂在哪里”的前端真值。
- 用户明确要求第一版直接对标成熟的 Dify chatflow，而不是继续发散多个结构方向。

## 为什么要做

- 避免后续在画布标题条、节点新增、节点配置、历史发布入口这些高频交互上重复讨论。
- 让后续 web 实现可以直接围绕一套固定骨架拆组件，而不是先做壳层再返工交互层。

## 截止日期

- 未指定

## 决策背后动机

- `03` 应用壳层保持不动；`04` 只实现编排页内部的具体编辑器。
- 页面级不再新增独立顶栏；Flow 名称、自动保存状态、草稿历史、发布配置、Publish、Issues、画布控制全部挂在无限画布内部 overlay。
- 不保留常驻左侧节点库；新建 Draft 默认直接给出三个节点：`Start -> LLM -> Return`。
- 新增节点仅保留 Dify 式高频入口：
  - 节点后方加号
  - 拉线后弹出节点选择
  - 不做命令面板
- 节点点击后打开画布内配置浮层，按 Dify 的 node panel 思路处理；第一阶段先做通用面板骨架，再逐步把各节点 schema 接进去。
- 编辑器交互至少包含：
  - 多选
  - 缩放
  - 画布控制
  - 结构整理
  - 30 秒自动保存 Draft
  - 字段错误 + 节点角标 + 全局 issues
- 节点改名只影响显示名，不改 `id`。
- 草稿历史保留最近 `30` 个版本，入口放在画布 overlay 中。
- 发布配置采用画布内按钮弹出，不额外占应用级页面。
- 节点库分类按意图分组，而不是按技术类型分组。
- 移动端不做完整编辑，按受限访问或只读处理。
- 第一版性能目标按常见 `50` 节点流程设计；更大规模由后端环境变量继续放开。

## 关联文档

- `docs/superpowers/specs/1flowbase/modules/04-chatflow-studio/README.md`
- `docs/superpowers/specs/1flowbase/2026-04-10-orchestration-design-draft.md`
- `../dify/web/app/components/workflow-app`
