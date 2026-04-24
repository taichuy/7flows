---
name: backend-development
description: Use when building or changing backend APIs, state transitions, module boundaries, or core business logic and need to control coupling and consistency
---

# Backend Development

## Overview

后端最容易失控的原因，是把核心规则、外部协议、存储细节和状态改写入口混在一起。本 Skill 用来约束 API 设计、边界切分、状态入口和一致性，减少“一处改动牵一片”的后端腐化。

## When to Use

- 设计或修改接口、动作入口、模块边界
- 调整状态流转、关键模型或写路径
- 评估是否拆 service、handler、repository、adapter
- 发现多个模块都能直接改同一状态
- 需要判断该直接实现、先收敛边界，还是先问人

**不要用于**

- 纯视觉、交互、信息架构设计
- 纯项目事实同步或技术栈介绍

## The Iron Law

稳定核心决定“该不该做”；边界适配层负责“怎么做到”；关键状态只能从清晰唯一入口改变。

## Quick Reference

- 核心状态机、对外协议、权限策略、插件边界、核心对象定义：先问人
- 先分清稳定核心和边界适配层，再写代码
- 能力边界优先使用能力名，具体实现留在 adapter / repository / driver
- API 输入保持短、平、单动作
- 状态必须写清：状态集合、流转规则、动作约束
- 多个模块都能改同一关键状态：立即收口

## Implementation

- AI-friendly API rules: `references/api-design.md`
- State and consistency review: `references/state-and-consistency.md`
- Stable core vs adapter rules: `references/boundary-design.md`
- Anti-decay patterns: `references/anti-patterns.md`
- Pressure scenarios: `references/examples.md`

## Common Mistakes

- 业务规则直接依赖外部协议格式
- 多个入口同时写同一核心状态
- 一个接口塞进多个动作语义
- 为了“一次查全”造出深层嵌套结构
- 用隐式副作用完成状态变化
