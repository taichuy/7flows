---
memory_type: tool
topic: 并行执行 git 状态和提交会触发 index.lock 冲突
summary: 在同一仓库里并行执行 `git status` 与 `git add`/`git commit` 会竞争 `.git/index.lock`；已验证的做法是把会写索引的 git 命令串行执行。
keywords:
  - git
  - index.lock
  - parallel
  - commit
match_when:
  - 需要同时查看状态并提交改动
  - git 报“无法创建 .git/index.lock”
created_at: 2026-04-13 09
updated_at: 2026-04-13 09
last_verified_at: 2026-04-13 09
decision_policy: reference_on_failure
scope:
  - git
  - .git
---

# 并行执行 git 状态和提交会触发 index.lock 冲突

## 时间

`2026-04-13 09`

## 失败现象

并行执行 `git status --short` 和 `git add -f ... && git commit ...` 时，提交命令报：

```text
fatal: 无法创建 '/home/taichu/git/1flowse/.git/index.lock'：文件已存在。
```

## 触发条件

对同一仓库并行执行一个只读 git 命令和一个会写索引的 git 命令。

## 根因

`git add` / `git commit` 需要持有 `.git/index.lock`，并行的另一个 git 进程会造成锁竞争，即使它只是短时读取状态。

## 解法

不要并行执行会操作同一仓库索引的 git 命令。先跑 `git status`，再单独执行 `git add` / `git commit`。

## 验证方式

确认 `.git/index.lock` 实际不存在后，串行重跑 `git add` / `git commit` 成功。

## 复现记录

- `2026-04-13 09`：在 1flowse 仓库并行执行状态检查和提交，触发 `index.lock` 冲突；改为串行执行后恢复正常。
