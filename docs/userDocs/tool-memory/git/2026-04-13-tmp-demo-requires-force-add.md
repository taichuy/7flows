---
memory_type: tool
topic: tmp/demo 被 .gitignore 忽略时 git add 需要 -f
summary: 仓库根 `.gitignore` 使用 `tmp/*` 忽略整个 `tmp/demo`，因此提交该目录下的新文件或已跟踪文件修改时，普通 `git add` 会被拒绝；需要使用 `git add -f`。
keywords:
  - git
  - git add
  - ignored files
  - tmp/demo
  - force add
match_when:
  - 需要提交 `tmp/demo` 下的改动
  - `git add` 提示路径被 `.gitignore` 忽略
created_at: 2026-04-13 02
updated_at: 2026-04-13 02
last_verified_at: 2026-04-13 02
decision_policy: reference_on_failure
scope:
  - git
  - .gitignore
  - tmp/demo
---

# tmp/demo 被 .gitignore 忽略时 git add 需要 -f

## 时间

`2026-04-13 02`

## 失败现象

对 `tmp/demo` 下文件执行普通 `git add` 时会报：

```text
下列路径根据您的一个 .gitignore 文件而被忽略：
tmp/demo
```

## 触发条件

- 仓库根 `.gitignore` 包含 `tmp/*`
- 需要把 `tmp/demo` 下的文件加入提交

## 根因

`tmp/demo` 整个目录被忽略，普通 `git add` 不会递归收录该目录下的新文件或修改。

## 解法

- 对 `tmp/demo` 下需要提交的路径统一使用：

```bash
git add -f tmp/demo/...
```

- 仓库外其他未被忽略路径仍可用普通 `git add`

## 复现记录

- `2026-04-13 02`：提交 demo 迭代记录与源码改动时，普通 `git add tmp/demo/...` 被 `.gitignore` 拒绝；改用 `git add -f` 后成功提交。
