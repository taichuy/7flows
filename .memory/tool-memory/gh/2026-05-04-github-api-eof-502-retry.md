---
memory_type: tool
topic: gh GitHub API transient EOF and 502 can be retried
summary: `gh run view/list/watch`, `gh workflow run`, `gh issue close` 在网络代理或 GitHub 边缘层不稳定时可能返回 `unexpected EOF`、`EOF` 或 `502 Bad Gateway`；本轮重试同一命令后成功，不应把这类错误直接判断为门禁失败。
keywords:
  - gh
  - GitHub API
  - EOF
  - 502
  - quality-gate
match_when:
  - gh run view/list/watch 返回 EOF
  - gh workflow run 返回 EOF
  - gh issue close 返回 502 Bad Gateway
  - 需要判断 GitHub Actions 或 issue 操作是否真实失败
created_at: 2026-05-04 16
updated_at: 2026-05-04 16
last_verified_at: 2026-05-04 16
decision_policy: reference_on_failure
scope:
  - gh
  - GitHub Actions
  - GitHub Issues
---

# gh GitHub API transient EOF and 502 can be retried

## 失败现象

`2026-05-04 16` 质量门禁处理期间出现过三类瞬时失败：

- `gh workflow run quality-gate.yml ...` 返回 `EOF`
- `gh run watch/view ...` 返回 `unexpected EOF` 或 `EOF`
- `gh issue close 21 ...` 返回 `502 Bad Gateway`

## 已验证解法

直接重试同一条 `gh` 命令即可恢复：

- workflow 第二次触发成功，返回 run `25327717119`
- run 状态改用 `gh run list` 或重试 `gh run view` 可继续确认
- issue close 第二次执行成功，`#21` 最终关闭

## 判断边界

- `EOF` / `502` 只说明 GitHub API 或代理链路瞬时失败，不说明 workflow 或 issue 操作语义失败。
- 如果第一次命令可能已经产生副作用，重试前先用 `gh run list`、`gh issue view/list` 核对当前状态。
