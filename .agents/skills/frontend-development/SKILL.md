---
name: frontend-development
description: Use when building or changing 1flowbase frontend/UI pages, page requirements, workspace flows, node development, schema UI, interactions, visual structure, or component boundaries, or when UI requests are vague, image-led, or need requirement refinement before implementation
---

# Frontend Development

## Overview

1flowbase 前端不是自由拼页，而是基于单一规则源的产品系统：`Ant Design` 壳层 + 薄 `Editor UI` + 固定工作区语法。本 Skill 用来在实现时守住页面边界、L1 详情模型、状态语义和组件职责，减少“写着写着变成另一套产品”的漂移。

## When to Use

- 新增或修改 `overview / orchestration / api / logs / monitoring` 页面
- 改动壳层列表、抽屉、编排画布、Inspector、节点组件
- 新增节点类型、调整节点详情、节点卡片、节点运行态或节点定义目录结构
- 改动 `schema ui` 合同、runtime、renderer registry、overlay shell 或节点 schema adapter
- 调整页面级流程、交互流、视觉方案
- 评估是否拆文件、拆组件、拆 hooks
- 页面状态开始散落，或同一文件同时承载展示、状态、协议、路由变化
- 同类对象出现不同点击结果、不同状态表达或不同移动端降级
- 用户需求模糊，只给目标词、截图、参考图或外部样本，需要先把页面需求讲清楚
- 用户提出页面开发、页面改版、模块级 UI 开发需求，需要先整理需求并把细化结果显式回复给用户
- 需要判断该直接做、复用现有实现，还是先问人

**不要用于**

- 纯后端接口、状态机、核心业务规则设计
- 纯信息架构审查且尚未进入实现

## The Iron Law

在 1flowbase 中，先守 `DESIGN.md` 的任务域边界、L1 模型和状态语义，再决定组件拆分和视觉抛光。

## General Workflow

1. 先回到 `DESIGN.md` 判断任务域边界、L1 模型、状态语义和现有页面 recipe。
2. 如果属于页面 / UI 开发需求，先输出面向用户的需求整理；至少覆盖页面目标、主要对象、关键动作、页面交互、关键状态和视觉约束。
3. 用 `references/communication-gate.md` 判断是默认直接实现，还是先集中提阻塞性产品分歧。
4. 再落实现：先定主路径、反馈位置和模块协作，再拆组件、落结构、补样式。
5. 结束前按 `references/review-checklist.md` 做复查；涉及样式边界、浏览器运行态或共享 slot 时，走项目既有验证链路。

## Quick Reference

### Purpose

- 把前端请求翻译成符合 1flowbase 边界、状态语义和交互语法的实现，而不是自由拼页。

### Requirements

#### Requirement: Frontend work stays grounded in 1flowbase rules

前端实现 SHALL 以 `./DESIGN.md` 为单一事实源，并保持 Shell、目录、接口消费与 `schema ui` 的既有分层。

##### Scenario: Standard page work follows project boundaries

- **WHEN** handling normal frontend page or module work
- **THEN** treat `./DESIGN.md` as the source of truth
- **AND** reuse `Ant Design` in Shell Layer
- **AND** keep page files, feature files, API consumers, and `schema ui` layers in their existing split

#### Requirement: Page and UI development starts with customer-facing requirement refinement

页面 / UI 开发需求 SHALL 先输出面向用户的需求整理，再进入实现。

##### Scenario: Page or UI development request requires upfront refinement

- **WHEN** the request is page development, page revision, module-level UI development, or image-led design work
- **THEN** first reply with requirement refinement before implementation
- **AND** cover page goal, primary object, key actions, page interaction, key states, and visual constraints
- **AND** continue implementation by default unless blocking product-level ambiguity remains

##### Scenario: Local UI bugfix keeps the lightweight path

- **WHEN** the request is a local style fix, pixel alignment change, copy update, or another UI bugfix that does not change page structure
- **THEN** skip the full requirement brief
- **AND** modify directly within the existing page recipe and interaction contract

#### Requirement: Page design is interaction-first, not card-first

页面设计 SHALL 先定义主路径、反馈位置和模块协作，再落卡片、区块和装饰。

##### Scenario: Page design avoids stacked-card drift

- **WHEN** shaping a new page, revising layout, or borrowing from a reference screenshot
- **THEN** define the main path, action feedback, and module coordination first
- **AND** avoid treating card stacking as the page design itself
- **AND** map borrowed structure and rhythm back to current `DESIGN.md` semantics

##### Scenario: Information architecture problems route to the companion skill

- **WHEN** the problem is really information architecture, hierarchy, entry points, or navigation logic
- **THEN** use `frontend-logic-design`
- **AND** resolve structural logic before styling or component polish

#### Requirement: High-risk frontend changes use the project verification chain

共享样式、第三方 slot、浏览器运行态和节点 / `schema ui` 变更 SHALL 走项目既有验证链路。

##### Scenario: Shared style or slot overrides require style-boundary verification

- **WHEN** changing shared styles, navigation, menus, shells, or third-party slots
- **THEN** run `node scripts/node/check-style-boundary.js ...`
- **AND** update `web/app/src/style-boundary/scenario-manifest.json` when the scenario map changes

##### Scenario: Browser-level evidence uses the existing runtime toolchain

- **WHEN** browser-level verification, screenshots, or runtime evidence is needed
- **THEN** use the existing `Playwright / page-debug / style-boundary` toolchain
- **AND** avoid ad-hoc one-off browser scripts

##### Scenario: Node and schema-ui changes preserve the split pipeline

- **WHEN** implementing node development or `schema ui` changes
- **THEN** preserve the `node-definitions -> schema fragments/registry -> renderer -> consumer` pipeline
- **AND** avoid merging those responsibilities back into a single file

## Implementation

- Single source of truth: `DESIGN.md`
- Visual baseline and layer rules: `references/visual-baseline.md`
- Workspace recipes and interaction rules: `references/workspace-rules.md`
- Directory, API, and utility placement rules: `references/placement-rules.md`
- Node development and schema UI changes must preserve the split between `node-definitions`, `schema registry/adapter`, and renderer consumers
- Ask-first gate: `references/communication-gate.md`
- Requirement refinement workflow for UI/page requests, vague briefs, or image-led requests: `references/requirement-refinement.md`
- Requirement extraction framework: `references/extraction-framework.md`
- Customer-facing requirement brief template: `references/skill-template.md`
- Browser verification defaults: `references/browser-verification.md`
- Before/during/after review: `references/review-checklist.md`
- Anti-decay patterns: `references/anti-patterns.md`
- Pressure scenarios and examples: `examples/`

## Common Mistakes

- 为了“统一”过早抽组件或 hooks
- 把外部灵感稿直接当成当前项目规范
- 页面根组件堆满状态、请求、弹窗和协议转换逻辑
- 把协议拼装、数据转换、渲染混写
- 把节点定义、schema contract、renderer registry、consumer UI 再次堆回同一文件
- 把第三方组件内部 DOM 当成自家 DOM 递归覆盖，或为了修单点视觉问题裸写 `.ant-*`
- 只改导航文案，不同步 `route id / path / selected state` 真值层
- 在 Shell / Canvas 间混用 `Drawer` 和 `Inspector`
- 把状态色拿去表达类型、装饰或品牌
- 把真正的信息架构问题误当成样式问题
- 把需求整理只留在自己脑中，或者只罗列模块名，没有显式整理页面目标、交互路径、关键状态和模块关系
- 需求收敛阶段直接堆卡片和区块，没有先定义主路径、交互反馈和模块协作
