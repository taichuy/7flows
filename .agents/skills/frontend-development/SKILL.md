---
name: frontend-development
description: Use when building or changing 1flowbase frontend/UI pages, page requirements, workspace flows, node development, schema UI, interactions, visual structure, or component boundaries, or when UI requests are vague, image-led, or need requirement refinement before implementation
---

# Frontend Development

## Overview

1flowbase 前端不是自由拼页，而是基于单一规则源的产品系统：`Ant Design` 壳层 + 薄 `Editor UI` + 固定工作区语法。本 Skill 用来在实现时守住页面边界、交互架构 gate、L1 详情模型、状态语义和组件职责，减少“写着写着变成另一套产品”的漂移。

## When to Use

- 新增或修改 `home / applications / settings / embedded-apps / tools` 页面，或 `orchestration / api / logs / monitoring` 应用详情 section
- 改动壳层列表、抽屉、编排画布、`Inspector`、节点组件等核心前端表面
- 新增节点类型，或调整节点详情、节点卡片、节点运行态、节点定义目录结构
- 改动 `schema ui` 合同、runtime、renderer registry、overlay shell 或节点 schema adapter
- 调整页面级流程、交互流、视觉结构或页面模块关系
- 需要决定入口、层级、下钻路径、`Drawer / Inspector / Page / Dialog` 等交互落点
- 评估是否拆文件、拆组件、拆 hooks，或处理前端职责边界漂移
- 页面状态开始散落，或同一文件同时承载展示、状态、协议、路由变化
- 同类对象出现不同点击结果、不同状态表达或不同移动端降级
- 前端需求模糊、图片驱动或依赖外部样本，需要先翻译成可执行页面需求
- 页面开发、页面改版、模块级 UI 开发需求，需要套用 1flowbase 的前端实现规则

**不要用于**

- 纯后端接口、状态机、核心业务规则设计
- 纯信息架构审查且不进入前端实现

## The Iron Law

在 1flowbase 中，先守 `DESIGN.md` 的任务域边界、L1 模型和状态语义，再决定组件拆分和视觉抛光。

## General Workflow

1. 先跑 `references/interaction-architecture-gate.md`，判断这次是否包含入口、层级、L0 / L1 / L2 / L3、详情容器或同类对象行为统一等交互架构决策；命中就先做 mini 诊断，必要时升级到 `frontend-logic-design`。
2. 再回到 `DESIGN.md` 判断任务域边界、L1 模型、状态语义和现有页面 recipe。
3. 如果属于页面 / UI 开发需求，先走 `references/requirement-refinement.md`；需要提炼方法时读 `references/extraction-framework.md`，需要直接套回复骨架时读 `references/skill-template.md`，需要看实际写法时读 `examples/`。随后输出面向用户的需求整理；至少覆盖页面目标、主要对象、关键动作、页面交互、关键状态和视觉约束。
4. 用 `references/communication-gate.md` 判断是默认直接实现，还是先集中提阻塞性产品分歧。
5. 再落实现：先定主路径、详情规则、反馈位置和模块协作，再拆组件、落结构、补样式。
6. 结束前按 `references/review-checklist.md` 做复查；涉及样式边界、浏览器运行态或共享 slot 时，走项目既有验证链路。

## Quick Reference

- 需求整理工作流与输出要求：[requirement-refinement.md](/home/taichu/git/1flowbase/.agents/skills/frontend-development/references/requirement-refinement.md)
- 交互架构 gate 与升级条件：[interaction-architecture-gate.md](/home/taichu/git/1flowbase/.agents/skills/frontend-development/references/interaction-architecture-gate.md)
- 需求提炼方法论：[extraction-framework.md](/home/taichu/git/1flowbase/.agents/skills/frontend-development/references/extraction-framework.md)
- 面向用户的回复模板：[skill-template.md](/home/taichu/git/1flowbase/.agents/skills/frontend-development/references/skill-template.md)
- 是否需要先沟通、哪些场景需要升级决策：[communication-gate.md](/home/taichu/git/1flowbase/.agents/skills/frontend-development/references/communication-gate.md)
- 页面 recipe、工作区语法与交互规则：[workspace-rules.md](/home/taichu/git/1flowbase/.agents/skills/frontend-development/references/workspace-rules.md)
- 目录落点、接口消费与 `schema ui` 分层：[placement-rules.md](/home/taichu/git/1flowbase/.agents/skills/frontend-development/references/placement-rules.md)
- 视觉基线与风格边界：[visual-baseline.md](/home/taichu/git/1flowbase/.agents/skills/frontend-development/references/visual-baseline.md)
- 浏览器级验证与运行态证据：[browser-verification.md](/home/taichu/git/1flowbase/.agents/skills/frontend-development/references/browser-verification.md)
- 复查清单与反模式：[review-checklist.md](/home/taichu/git/1flowbase/.agents/skills/frontend-development/references/review-checklist.md)、[anti-patterns.md](/home/taichu/git/1flowbase/.agents/skills/frontend-development/references/anti-patterns.md)
- 示例与压力场景：`examples/`
- 命中结构性问题后的完整信息架构诊断：`frontend-logic-design`
- 前端测试资源限制统一读取仓库根 `.1flowbase.verify.local.json`；调整 `turbo` 并发或 `vitest` worker 时，同步维护 `.1flowbase.verify.local.json.example`，不要把并发重新写死进 `package.json`

## Implementation

- Single source of truth: `DESIGN.md`
- Shell/UI baseline: `Ant Design` 负责 Shell Layer，`Editor UI` 只做薄封装，不另起一套视觉语言
- Page/UI request artifact: 实现前先产出一版面向用户的需求整理，至少覆盖页面目标、主要对象、关键动作、页面交互、关键状态、视觉约束
- Placement anchors: 页面和壳层落在 `app-shell / routes / features/* / shared/*`，feature 内部可按 `api / components / hooks / lib / pages / schema / store` 拆分，不要把页面、壳层、路由真值层和请求消费重新堆回一个文件
- API consumption chain: `api-client -> features/*/api -> shared/api`
- Schema UI split: `shared/schema-ui -> features/*/schema -> features/*/lib/node-definitions`
- Node implementation chain: `node-definitions -> schema fragments/registry -> renderer -> consumer`
- Interaction anchor: 先过交互架构 gate，定义主路径、详情规则、反馈位置和模块协作，再决定卡片、区块和装饰怎么落
- Style chain: `theme token -> first-party wrapper -> explicit slot -> stop`
- Verification chain: 共享样式或第三方 slot 走 `check-style-boundary`；浏览器级证据走 `Playwright / page-debug / style-boundary`
- Frontend test runtime chain: `web/package.json` 与 `web/app/package.json` 的测试入口应继续走仓库脚本包装器；本地资源限制统一从 `.1flowbase.verify.local.json` 读取，不要用裸 `pnpm exec vitest/turbo` 替代标准入口

## Common Mistakes

- 为了“统一”过早抽组件或 hooks
- 把外部灵感稿直接当成当前项目规范
- 页面根组件堆满状态、请求、弹窗和协议转换逻辑
- 把协议拼装、数据转换、渲染混写
- 把节点定义、schema contract、renderer registry、consumer UI 再次堆回同一文件
- 把第三方组件内部 DOM 当成自家 DOM 递归覆盖，或为了修单点视觉问题裸写 `.ant-*`
- 只改导航文案，不同步 `route id / path / selected state` 真值层
- 还没过交互架构 gate，就让列表、卡片、抽屉、按钮各自决定点击结果
- 在 Shell / Canvas 间混用 `Drawer` 和 `Inspector`
- 把状态色拿去表达类型、装饰或品牌
- 把真正的信息架构问题误当成样式问题
- 把需求整理只留在自己脑中，或者只罗列模块名，没有显式整理页面目标、交互路径、关键状态和模块关系
- 需求收敛阶段直接堆卡片和区块，没有先定义主路径、交互反馈和模块协作
