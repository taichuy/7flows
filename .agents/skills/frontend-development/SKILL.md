---
name: frontend-development
description: Use when building or changing 1Flowse frontend pages, workspace flows, interactions, visual structure, or component boundaries and need to preserve the project's page recipes, interaction contracts, and UI consistency
---

# Frontend Development

## Overview

1Flowse 前端不是自由拼页，而是基于单一规则源的产品系统：`Ant Design` 壳层 + 薄 `Editor UI` + 固定工作区语法。本 Skill 用来在实现时守住页面边界、L1 详情模型、状态语义和组件职责，减少“写着写着变成另一套产品”的漂移。

## When to Use

- 新增或修改 `overview / orchestration / api / logs / monitoring` 页面
- 改动壳层列表、抽屉、编排画布、Inspector、节点组件
- 调整页面级流程、交互流、视觉方案
- 评估是否拆文件、拆组件、拆 hooks
- 页面状态开始散落，或同一文件同时承载展示、状态、协议、路由变化
- 同类对象出现不同点击结果、不同状态表达或不同移动端降级
- 需要判断该直接做、复用现有实现，还是先问人

**不要用于**

- 纯后端接口、状态机、核心业务规则设计
- 纯信息架构审查且尚未进入实现

## The Iron Law

在 1Flowse 中，先守 `DESIGN.md` 的任务域边界、L1 模型和状态语义，再决定组件拆分和视觉抛光。

## Quick Reference

- 单一事实源：`./DESIGN.md`
- Shell Layer 优先复用 `Ant Design`；Editor UI 只做薄封装，不另起一套视觉语言
- 先判任务域边界，再判 L1 模型，再判状态语义，最后才是 token 和样式
- 样式改动固定按四层判断：`theme token -> first-party wrapper -> explicit slot -> stop`
- 风格和 UI 质量本身就是验收项，不接受“功能先通、样式以后再说”
- 第三方组件允许主题化，不允许无边界递归覆盖内部样式链
- 信息架构、层级、入口、导航问题：**REQUIRED COMPANION SKILL:** Use `frontend-logic-design`
- 新页面、新流程、交互流、视觉方案、页面内 AI 协作层：先问人
- 单点使用且变化原因单一：先别抽象
- 先复用现有组件和成熟依赖，再考虑新封装

## Implementation

- Single source of truth: `DESIGN.md`
- Visual baseline and layer rules: `references/visual-baseline.md`
- Workspace recipes and interaction rules: `references/workspace-rules.md`
- Ask-first gate: `references/communication-gate.md`
- Before/during/after review: `references/review-checklist.md`
- Anti-decay patterns: `references/anti-patterns.md`
- Pressure scenarios: `references/examples.md`

## Common Mistakes

- 为了“统一”过早抽组件或 hooks
- 把外部灵感稿直接当成当前项目规范
- 页面根组件堆满状态、请求、弹窗和协议转换逻辑
- 把协议拼装、数据转换、渲染混写
- 把第三方组件内部 DOM 当成自家 DOM 递归覆盖
- 为了修单点视觉问题，裸写 `.ant-*` 或跨多个内部 slot 写后代选择器
- 只改导航文案，不同步 `route id / path / selected state` 真值层
- 在 Shell / Canvas 间混用 `Drawer` 和 `Inspector`
- 把状态色拿去表达类型、装饰或品牌
- 把真正的信息架构问题误当成样式问题
