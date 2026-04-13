---
memory_type: tool
topic: 查询设计草稿历史前先确认文件是否被 git 跟踪或忽略
summary: 直接对本地草稿同时使用 `git log --follow` 多路径或对未跟踪路径执行 `git blame` 会失败；应先确认路径是否被跟踪、是否被 `.gitignore` 忽略，再按单路径历史或工作区文件排查。
keywords:
  - git
  - git log --follow
  - git blame
  - git ls-files
  - git check-ignore
  - ignored files
  - draft
match_when:
  - 需要追查本地草稿文件来源
  - `git blame` 提示路径不在 HEAD
  - `git log --follow` 需要同时查多个候选路径
created_at: 2026-04-13 07
updated_at: 2026-04-13 07
last_verified_at: 2026-04-13 07
decision_policy: reference_on_failure
scope:
  - git
  - .gitignore
  - DESIGN.md
  - docs/draft
---

# 查询设计草稿历史前先确认文件是否被 git 跟踪或忽略

## 时间

`2026-04-13 07`

## 失败现象

- 对两个路径同时执行 `git log --follow -- DESIGN.md docs/draft/DESIGN.md` 时失败，提示 `--follow` 只支持单一路径。
- 对 `docs/draft/DESIGN.md` 直接执行 `git blame` 时失败，提示该路径不在 `HEAD`。

## 触发条件

- 需要追查某份设计草稿是否为正式规范来源。
- 候选文件里既有正式跟踪文件，也有本地草稿或被忽略目录下的文件。

## 根因

- `git log --follow` 只能跟踪一个路径，不能一次跟多个候选文件。
- `docs/draft/DESIGN.md` 被 `.gitignore` 中的 `docs/draft` 忽略，且不是 git 已知文件；直接对它执行历史归因命令没有意义。

## 解法

1. 先确认文件状态：

```bash
git ls-files --error-unmatch <path>
git check-ignore -v <path>
```

2. 对正式跟踪文件逐个查询历史，不要把多个路径一起传给 `--follow`：

```bash
git log --oneline --follow -- DESIGN.md
```

3. 如果路径未被跟踪且处于忽略目录下，直接检查工作区文件内容；如需追溯来源，改查历史上真实存在过的旧路径，例如：

```bash
git log --oneline --all --full-history -- docs/userDocs/draft/DESIGN.md
```

## 复现记录

- `2026-04-13 07`：排查 `docs/draft/DESIGN.md` 与 `DESIGN.md` 的主题来源时，误把两个路径一起交给 `git log --follow`，随后又对忽略目录下的本地草稿执行 `git blame`；改为先用 `git check-ignore -v`、`git ls-files --error-unmatch` 判断状态，再分别查询 `DESIGN.md` 与历史旧路径后完成排查。
