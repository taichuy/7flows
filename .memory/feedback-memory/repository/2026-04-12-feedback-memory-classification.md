---
memory_type: feedback
feedback_category: repository
topic: 反馈记忆应按 interaction 和 repository 分类
summary: feedback-memory 不再按个人或团队分类，统一按 interaction 和 repository 两类管理，并在 YAML front matter 中显式写明 feedback_category。
keywords:
  - feedback-memory
  - classification
  - interaction
  - repository
  - front matter
match_when:
  - 需要新增或整理 feedback-memory 下的反馈记忆
  - 需要判断某条反馈记忆应该放在哪个子目录
  - 需要更新反馈记忆模板或检索规则
created_at: 2026-04-12 21
updated_at: 2026-04-12 21
last_verified_at: 2026-04-12 21
decision_policy: direct_reference
scope:
  - docs/userDocs/AGENTS.md
  - docs/userDocs/feedback-memory
  - docs/userDocs/feedback-memory/template.md
---
# 反馈记忆应按 interaction 和 repository 分类

## 时间

`2026-04-12 21`

## 规则

- `feedback-memory` 不再按个人偏好或团队协作偏好分类。
- 反馈记忆统一按 `interaction/` 和 `repository/` 两类子目录维护。
- 每条反馈记忆都必须在 `YAML front matter` 中显式写 `feedback_category`。

## 原因

- 按个人或团队分类不利于后续维护，也不利于按任务场景检索。
- 按交互纠正和工程纠正分类，更接近实际命中场景，检索信号更稳定。
- 将分类前移到摘要层后，第一轮只看 `YAML front matter` 也能完成快速筛选。

## 适用场景

- 新增反馈记忆时。
- 迁移旧的反馈记忆结构时。
- 调整 `feedback-memory` 的模板、目录说明或检索规则时。

## 备注

- `interaction` 用于用户沟通、执行流程、记忆检索等 AI 行为纠正。
- `repository` 用于仓库结构、目录管理、脚本放置、版本控制等工程约束纠正。
