---
memory_type: tool
topic: 检索兄弟仓库前先确认顶层目录，避免假设 src 存在
summary: 在当前工作区旁边检索兄弟仓库时，直接把 `../repo/src` 写进 `rg` 路径可能报“没有那个文件或目录”；已验证的做法是先 `ls` 或 `find` 确认仓库顶层结构，再按真实目录执行检索。
keywords:
  - rg
  - sibling-repo
  - missing-path
  - ls
  - find
match_when:
  - 需要检索当前仓库旁边的兄弟仓库
  - 需要用 rg 指定多个候选路径
  - rg 输出 no such file or directory
created_at: 2026-04-13 09
updated_at: 2026-04-13 09
last_verified_at: 2026-04-13 09
decision_policy: reference_on_failure
scope:
  - rg
  - ../*
---

# 检索兄弟仓库前先确认顶层目录，避免假设 src 存在

## 时间

`2026-04-13 09`

## 为什么做这个操作

为了核对本机 `../nocobase` 的数据建模与资源自动 CRUD 实现，先用 `rg` 在多个目录下查 `collection / database / repository / field` 相关代码。

## 为什么失败

命令里直接假设了 `../nocobase/src` 目录存在，但该仓库实际主要代码在 `../nocobase/packages` 下，因此 `rg` 返回 `No such file or directory`。

## 后续怎么避免

- 先对兄弟仓库执行 `ls -la ../repo` 或 `find ../repo -maxdepth 2 -type d`，确认真实顶层结构。
- 再把 `rg` 范围收敛到实际存在的目录，例如 `packages/`、`apps/`、`plugins/`。
- 对第三方或陌生仓库，不要先入为主假设有 `src/` 顶层。
