---
memory_type: feedback
feedback_category: repository
topic: project-skills-must-be-registered-in-consumer-dirs
summary: 更新项目 skills 时，不能只维护 `.agents/skills` 源目录；必须检查实际运行环境是否读取 `.claude/skills`、AionUI custom skills 或其他消费目录，并用同步脚本刷新，否则大模型只会看到旧 skill 或完全看不到项目 skill。
keywords:
  - skills
  - skill-trigger
  - frontend-development
  - backend-development
  - claude-skill-sync
  - AionUI
  - registration
match_when:
  - 新增或调整 `.agents/skills`
  - 排查 skill 不触发、触发率低或模型没有加载项目 skill
  - 修改 `frontend-development`、`backend-development`、`qa-evaluation` 或 `test-driven-development`
  - 维护项目 agent 运行环境、AionUI skills 或 Claude skills 镜像
created_at: 2026-05-13 23
updated_at: 2026-05-13 23
last_verified_at: 2026-05-13 23
decision_policy: direct_reference
scope:
  - .agents/skills
  - .claude/skills
  - /home/taichu/.config/AionUi-Dev/config/skills
  - scripts/node/claude-skill-sync.js
---

# Project Skills Must Be Registered In Consumer Dirs

## 规则

更新项目 skill 时，`.agents/skills` 只是源目录；完成后必须确认实际使用的 agent 运行面是否已经注册或同步到对应消费目录。当前至少要检查 `.claude/skills` 和 AionUI custom skills 目录 `/home/taichu/.config/AionUi-Dev/config/skills`。

## 原因

skill 是否触发主要由运行环境加载到的 frontmatter `name` / `description` 决定。只改源目录但不刷新消费目录，会导致模型读到旧描述、旧 reference，或者在 AionUI 里完全看不到 `frontend-development` / `backend-development` 等项目 skill。

## 适用场景

- 排查 `frontend-development`、`backend-development` 基本不触发。
- 更新 skill 触发描述、references、examples 或 companion skill 关系。
- 维护 `claude-skill-sync`、AionUI skills、Claude skills 或其他本地镜像注册链路。
