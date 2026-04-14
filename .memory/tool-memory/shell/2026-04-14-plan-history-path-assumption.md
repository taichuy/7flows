---
memory_type: tool
topic: 读取设计或计划文档前先确认文件是否已归档到 history 目录
summary: 直接按旧路径读取 `docs/superpowers/plans/<file>.md` 可能因为文档已迁移到 `docs/superpowers/plans/history/` 而报“没有那个文件或目录”；应先用 `find` 或 `rg --files` 确认真实路径再读取。
keywords:
  - shell
  - sed
  - docs
  - plans
  - history
  - path
match_when:
  - 需要读取 `docs/superpowers/plans` 或 `docs/superpowers/specs` 下的历史文档
  - 直接 `sed -n` 某个计划或设计文件时报 “没有那个文件或目录”
  - 不确定文档还在主目录还是已归档到 `history/`
created_at: 2026-04-14 10
updated_at: 2026-04-14 10
last_verified_at: 2026-04-14 10
decision_policy: reference_on_failure
scope:
  - shell
  - docs/superpowers/plans
  - docs/superpowers/specs
---

# 读取设计或计划文档前先确认文件是否已归档到 history 目录

## 时间

`2026-04-14 10`

## 失败现象

直接执行：

```bash
sed -n '1,260p' docs/superpowers/plans/2026-04-13-backend-governance-phase-two.md
```

返回：

```text
sed: 无法读取 docs/superpowers/plans/2026-04-13-backend-governance-phase-two.md: 没有那个文件或目录
```

## 触发条件

- 计划或设计文档已经被整理进 `history/` 目录
- 仍按主目录旧路径直接读取

## 根因

对文档当前收纳位置做了路径想当然，未先确认它是否已从主目录迁移到 `history/`。

## 已验证做法

先确认真实路径，再读取：

```bash
find docs/superpowers/plans -maxdepth 2 -type f | sort
rg --files docs/superpowers/plans docs/superpowers/specs
```

确认后再执行 `sed -n`、`rg -n` 或 `git show`。
