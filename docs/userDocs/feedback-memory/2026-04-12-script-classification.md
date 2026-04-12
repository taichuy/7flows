---
memory_type: feedback
topic: 脚本必须放在对应分类目录
summary: 新增或调整脚本入口时，必须放到对应分类目录，不要把具体脚本散落在根 scripts 目录。
keywords:
  - scripts
  - classification
  - node
  - shell
match_when:
  - 需要新增脚本入口
  - 需要调整 scripts 目录结构
created_at: 2026-04-12 16
updated_at: 2026-04-12 16
last_verified_at: 2026-04-12 16
decision_policy: direct_reference
scope:
  - scripts
  - scripts/node
  - scripts/shell
---

# 脚本必须放在对应分类目录

## 时间

`2026-04-12 16`

## 规则

- `scripts/` 下的脚本必须放进对应分类目录，不要把具体脚本入口随意放在根 `scripts/`。

## 原因

- 用户要求脚本目录按分类维护，避免入口文件散落在 `scripts/` 根目录，破坏目录语义。

## 适用场景

- 新增或调整本仓库脚本入口时。
- 需要在 `scripts/node`、`scripts/shell` 等分类目录下放置脚本时。

## 分类

- 团队协作偏好

## 备注

- 当前统一开发启动脚本入口应放在 `scripts/node/` 下。
