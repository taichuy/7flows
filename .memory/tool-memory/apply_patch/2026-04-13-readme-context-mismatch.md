---
memory_type: tool
topic: apply_patch 修改 README 前先读取当前段落上下文
summary: 当 README 或文档段落结构与预期不一致时，直接按记忆中的标题片段执行 `apply_patch` 会因上下文不匹配失败；应先读取目标文件当前内容，再基于真实上下文补丁。
keywords:
  - apply_patch
  - context mismatch
  - README
  - patch failure
match_when:
  - `apply_patch` 提示 expected lines not found
  - 需要修改 README 或文档中的某个已有段落
created_at: 2026-04-13 07
updated_at: 2026-04-13 07
last_verified_at: 2026-04-13 07
decision_policy: reference_on_failure
scope:
  - apply_patch
  - README.md
  - docs
---

# apply_patch 修改 README 前先读取当前段落上下文

## 时间

`2026-04-13 07`

## 失败现象

- 试图直接把“本地开发”段落补丁写入 `README.md` 时，`apply_patch` 返回 `Failed to find expected lines`。

## 触发条件

- 根据印象假设 README 中已有某个标题或段落。
- 未先读取目标文件当前内容，就直接使用旧上下文或猜测上下文打补丁。

## 根因

- `apply_patch` 依赖目标文件中的精确上下文。
- 当前仓库 `README.md` 的实际结构是 `Bootstrap Quick Start`、`Frontend`、`Backend` 等段落，不存在预期中的“本地开发”段。

## 解法

1. 先读取目标文件当前内容：

```bash
sed -n '1,220p' README.md
```

2. 再按真实段落标题和邻近文本编写补丁，不要复用猜测的上下文。

## 复现记录

- `2026-04-13 07`：为 `mock-ui` 同步脚本补 README 入口时，先按记忆中的“本地开发”段落打补丁失败；重新读取 `README.md` 后，改在 `Frontend` 段落后追加 `Mock UI Sandbox` 小节，补丁成功。
- `2026-04-14 11`：更新 `.memory/project-memory/2026-04-14-account-settings-shared-shell-evaluation.md` 时，沿用旧版决策段落上下文补丁，因文件已被前一轮提交更新而匹配失败；重新 `sed` 当前文件后，按真实段落位置补丁成功。
