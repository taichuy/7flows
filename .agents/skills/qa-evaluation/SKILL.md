---
name: qa-evaluation
description: Use when evaluating 1Flowse task outcomes or current project quality and need an evidence-driven QA report instead of direct implementation
---

# QA Evaluation

## Overview

`qa-evaluation` 不是另一个开发 Skill，而是 1Flowse 的质量评估器。它用于验证当前任务是否过关，或在用户明确要求时审计项目现状，并默认只产出问题报告与修正方向，不直接改代码。

## When to Use

- 功能完成后，需要对当前任务做质量回归
- 改了共享组件、共享状态或公共 API，需要检查变化传播
- 用户明确要求“全量评估项目现状代码”
- 需要输出结构化 QA 报告，而不是直接进入修复
- 需要判断 UI、流程、响应式、API、状态和架构边界是否仍然成立

**不要用于**

- 直接实现或修复功能
- 纯代码风格讨论
- 没有范围和验收场景的泛泛“看一眼”

## The Iron Law

没有直接证据，不得下 QA 结论。默认只报告，不直接修。

## Quick Reference

- 默认 `task mode`；只有用户明确要求全量审计时才进入 `project evaluation mode`
- 评估前先读 `docs/userDocs/AGENTS.md`、`docs/userDocs/user-memory.md`、项目记忆、反馈记忆和相关 spec
- `task mode` 必查：验收场景、交互流、变化传播、状态 / API / 数据映射、关键回归
- `project evaluation mode` 必查：UI 一致性、流程逻辑、响应式降级、API 契约、状态数据一致性、架构边界、测试缺口
- 前端层级、入口、L0 / L1 / L2 / L3 问题：联动 `frontend-logic-design`
- 后端契约、状态入口、边界污染问题：联动 `backend-development`
- 无法验证时必须明确写：`未验证，不下确定结论`

## Implementation

- Mode selection and session bias: `references/modes.md`
- Task-scoped checks: `references/task-mode-checklist.md`
- Full-project checks: `references/project-evaluation-checklist.md`
- Report output: `references/report-template.md`
- Severity rules: `references/severity-rules.md`
- Anti-patterns: `references/anti-patterns.md`

## Common Mistakes

- 把 QA 当成修复流程
- 没有证据就下结论
- 把代码审查写成 QA 报告
- 小任务也直接上全量审计
- 只挑视觉问题，不看契约和状态
- 只看当前改动点，不看被影响的其他消费者
