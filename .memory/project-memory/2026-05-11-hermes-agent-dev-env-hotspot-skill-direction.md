---
memory_type: project
topic: Hermes agent 开发环境热点复盘应沉淀到 skills
summary: 用户确认 Hermes 的 agent 开发环境优化方向：分析昨天/今天热点代码修改时，应把高频修改内容抽象为 AI 开发逻辑和 skills 更新，目标是让 AI 下次避免同类错误，而不是只给具体代码修复建议。
keywords:
  - Hermes
  - agent development environment
  - hotspot churn
  - skills
  - AI coding efficiency
  - quality gates
created_at: 2026-05-11 13
updated_at: 2026-05-11 13
last_verified_at: 2026-05-11 13
decision_policy: verify_before_decision
scope:
  - .agents/skills
  - .memory
  - scripts/node
  - AGENTS.md
  - web/AGENTS.md
  - api/AGENTS.md
---

# Hermes Agent 开发环境热点复盘应沉淀到 Skills

## 谁在做什么

用户要求后续做热点修改复盘时，把反复修改暴露出的逻辑问题沉淀到项目 skills、AGENTS、质量脚本或代码环境规则中。

## 为什么这样做

热点文件被多次修改，真正的问题往往不是某一行代码，而是 AI 在进入任务前缺少判断规则：例如 UI 信息架构未先冻结、运行态真值未先定义、质量门禁反馈太晚。

## 为什么要做

目标是提高 Hermes / AI agent 开发环境的代码编程效率，减少下一次相同类型任务中的反复返工。

## 截止日期

未单独约定；命中热点修改复盘、AI 开发效率优化或 skills 更新时立即适用。

## 决策背后动机

把“昨天/今天改了很多次”的事实转化为可复用的 agent 行为约束：先识别 churn 热点，再归因到 skill 缺口，最后给出或直接更新 skills / 规则 / 门禁。
