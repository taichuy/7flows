---
memory_type: tool
topic: git 按路径提交在含新文件且已有其他 staged 内容时会卡住
summary: 当仓库里已有其他 staged 内容时，执行 `git commit -m "..." -- <tracked-path> <newly-added-path>` 仍可能对新文件报“未匹配任何 git 已知文件”；已验证可用的解法是改用临时 `GIT_INDEX_FILE` 构造只包含目标文件的隔离提交。
keywords:
  - git
  - commit
  - pathspec
  - staged
  - GIT_INDEX_FILE
match_when:
  - 需要只提交部分路径
  - 目标提交里同时包含已跟踪文件和新建文件
  - 仓库当前还有其他 staged 内容不能一起提交
created_at: 2026-04-14 09
updated_at: 2026-04-14 09
last_verified_at: 2026-04-14 09
decision_policy: reference_on_failure
scope:
  - git
  - repository
---

# git 按路径提交在含新文件且已有其他 staged 内容时会卡住

## 时间

`2026-04-14 09`

## 失败现象

在仓库里已有其他 staged 内容时，执行：

```bash
git add -- web/AGENTS.md .memory/feedback-memory/repository/2026-04-14-web-agents-directory-rules-align-with-real-structure.md
git commit -m "docs(web): align frontend directory rules" -- web/AGENTS.md .memory/feedback-memory/repository/2026-04-14-web-agents-directory-rules-align-with-real-structure.md
```

Git 报：

```text
error: 路径规格 '.memory/feedback-memory/repository/2026-04-14-web-agents-directory-rules-align-with-real-structure.md' 未匹配任何 git 已知文件
```

## 触发条件

- 需要只提交部分路径；
- 提交目标同时包含已跟踪文件和新建文件；
- 仓库当前已经有其他 staged 内容，不能直接全量 `git commit`。

## 根因

普通按路径 `git commit -- <paths>` 在这种场景下仍会把新文件视为“非当前提交可直接匹配的 git 已知路径”，导致 pathspec 失败；而直接全量提交又会误带其他 staged 内容。

## 解法

- 使用临时 `GIT_INDEX_FILE` 创建隔离 index；
- `git read-tree HEAD` 初始化该 index；
- 只向临时 index `git add` 目标文件；
- 用临时 index 执行 `git commit`；
- 提交后再把当前工作区对应文件 `git restore --source=HEAD --staged --worktree -- <paths>`，避免主 index 出现假脏状态。

## 验证方式

- `env GIT_INDEX_FILE=/tmp/1flowbase-web-agents.index git read-tree HEAD`
- `env GIT_INDEX_FILE=/tmp/1flowbase-web-agents.index git add -- web/AGENTS.md .memory/feedback-memory/repository/2026-04-14-web-agents-directory-rules-align-with-real-structure.md`
- `env GIT_INDEX_FILE=/tmp/1flowbase-web-agents.index git commit -m "docs(web): align frontend directory rules"`
- `git show --stat --oneline -1 05497d2e`
- `git restore --source=HEAD --staged --worktree -- web/AGENTS.md .memory/feedback-memory/repository/2026-04-14-web-agents-directory-rules-align-with-real-structure.md`

## 复现记录

- `2026-04-14 09`：在 `1flowbase` 仓库中为 `web/AGENTS.md` 和一条新反馈记忆做隔离提交时复现；普通按路径提交失败，改用临时 index 成功。
