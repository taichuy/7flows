---
memory_type: feedback
feedback_category: repository
topic: 新增项目级测试或调试工具后应同步更新相关技能文档
summary: 当仓库新增可复用的项目级测试、调试或运行时证据工具后，不应只停留在脚本实现本身；需要同步更新对应 domain skill 和 QA skill，让后续 agent 默认会用这条链路。
keywords:
  - skill
  - testing tool
  - debug tool
  - qa
  - frontend
match_when:
  - 新增项目级测试工具
  - 新增项目级调试脚本
  - 新增浏览器验收或证据采集工具
  - 需要决定是否同步更新 skill
created_at: 2026-04-18 12
updated_at: 2026-04-18 12
last_verified_at: 2026-04-18 12
decision_policy: direct_reference
scope:
  - .agents/skills
  - .memory/feedback-memory/repository
---

# 新增项目级测试或调试工具后应同步更新相关技能文档

## 时间

`2026-04-18 12`

## 规则

- 当仓库新增可复用的项目级测试、调试或运行时证据工具后，必须同步检查并更新对应 domain skill 与 QA skill。
- 至少要同步两类内容：
  - 触发条件与默认动作；
  - 证据口径、推荐命令和失败后的回退路径。

## 原因

- 如果只实现脚本、不更新 skill，后续 agent 仍会沿用旧链路，继续手写一次性脚本或走更低效的人工验证路径。
- skill 是项目级默认工作流入口；新工具不进入 skill，就很难稳定被复用。

## 适用场景

- 新增 `page-debug` 这类前端运行时调试 / 证据工具
- 新增后端回归、接口验收、数据审计等项目级脚本
- 新增能替代旧默认链路的浏览器级或 QA 级工具
