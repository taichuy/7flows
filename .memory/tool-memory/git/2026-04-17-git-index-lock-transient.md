---
memory_type: tool
tool: git
topic: git commit 瞬时命中 index.lock 时先检查锁是否仍存在再重试
decision_policy: reference_on_failure
created_at: 2026-04-17 21
updated_at: 2026-04-17 21
last_verified_at: 2026-04-17 21
keywords:
  - git
  - index.lock
  - commit
  - transient
problem_signature:
  - git commit 返回 无法创建 .git/index.lock 文件已存在
  - 随后 ls .git/index.lock 又显示文件不存在
  - 仓库内并没有持续运行中的 git 进程
verified_solution:
  - 先执行 ls -l .git/index.lock
  - 再执行 ps -ef | rg '[g]it'
  - 如果锁已经消失且没有活跃 git 进程，直接重试 git add / git commit
  - 不要在未确认前直接删除 index.lock
scope:
  - /home/taichu/git/1flowbase
---

# git commit 瞬时命中 index.lock 时先检查锁是否仍存在再重试

## 现象

- 执行 `git commit` 时返回：
  - `fatal: 无法创建 '.git/index.lock'：文件已存在`
- 紧接着检查：
  - `ls -l .git/index.lock` 提示文件不存在
  - `ps -ef | rg '[g]it'` 没有持续占用仓库的 git 进程

## 原因

- 这类情况更像瞬时锁竞争或刚释放的残留报错，不一定是真正的“锁文件卡死”。
- 如果直接删除锁文件，可能把正在结束的真实 git 操作误判成 stale lock。

## 已验证处理

1. 先检查锁文件是否仍存在。
2. 再检查是否有活跃 git 进程。
3. 若锁已消失且无活跃 git 进程，直接重试原命令。
4. 本次场景中，重新执行 `git add` 与 `git commit` 后成功提交。

## 后续建议

- 遇到 `index.lock` 时默认先做非破坏性检查。
- 只有在锁文件仍存在、且确认没有活跃 git 进程时，才考虑人工删除锁文件。
