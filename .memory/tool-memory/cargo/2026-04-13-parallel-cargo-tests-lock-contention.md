---
memory_type: tool
topic: 并发运行多条 cargo test 会争 package 和 artifact 锁
summary: 在本仓库里用 `multi_tool_use.parallel` 同时启动多条 `cargo test` 时，会频繁出现 `Blocking waiting for file lock on package cache` 或 `artifact directory`，导致拿不到稳定结果；改为串行执行后可正常完成。
keywords:
  - cargo
  - test
  - parallel
  - file lock
  - artifact directory
match_when:
  - 需要同时跑多条 cargo test
  - cargo 输出 `Blocking waiting for file lock on package cache`
  - cargo 输出 `Blocking waiting for file lock on artifact directory`
created_at: 2026-04-13 07
updated_at: 2026-04-14 00
last_verified_at: 2026-04-14 00
decision_policy: reference_on_failure
scope:
  - cargo
  - multi_tool_use.parallel
  - api
---

# 并发运行多条 cargo test 会争 package 和 artifact 锁

## 时间

`2026-04-13 07`

## 失败现象

在同一轮里并发启动多个 `cargo test` 后，终端持续输出：

- `Blocking waiting for file lock on package cache`
- `Blocking waiting for file lock on artifact directory`

结果是测试反馈被串行化得更慢，而且中途难以判断哪条命令真正失败。

## 为什么当时要这么做

当时想并行拿到多个红灯测试的结果，加快 Task 1 和 Task 4 的定位速度。

## 为什么失败

`cargo` 的依赖缓存和构建产物目录需要独占锁；同一工作区同时跑多条测试命令时，多个进程会互相等待，反而放大等待时间。

## 后续避免建议

- 同一工作区内的 `cargo test`、`cargo check`、`cargo clippy` 默认串行跑。
- 只有确定命令不会竞争同一 target / cache 时，才考虑并行。
- 如果已经出现锁等待，不要继续追加新的 `cargo` 进程，直接等现有进程结束或改成串行。

## 复现记录

- `2026-04-13 07`：在 Task 1 / Task 4 想并行拿多个红灯测试时首次触发，随后确认串行执行可稳定消除锁等待。
- `2026-04-13 12`：在后端计划续做时并发启动 `cargo fmt --all`、`cargo test -p runtime-core ...`、`cargo test -p storage-pg ...`，再次出现 package cache / artifact directory 锁等待；随后改回串行执行并完成验证。
- `2026-04-13 16`：执行 backend QA access-control closure 的 Task 1 红灯阶段时，并发启动 `cargo test -p control-plane ...` 和 `cargo test -p api-server ...`，再次看到 `Blocking waiting for file lock on package cache`；停止第二条命令并改成串行后，红绿测试恢复稳定。
- `2026-04-13 18`：执行 backend QA runtime registry closure 的 Task 3 时，并发启动两条 `cargo test -p api-server ... --exact --nocapture`，再次看到 `Blocking waiting for file lock on package cache`；等待当前进程结束后改回串行读取结果，验证恢复稳定。
- `2026-04-14 00`：执行 backend governance phase two 的 Task 5 聚焦测试时，用 `multi_tool_use.parallel` 同时跑两条 `cargo test -p plugin-framework --lib ... -- --exact`，再次出现 `Blocking waiting for file lock on package cache` 和 `artifact directory` 等待；随后恢复串行验证并完成后续全量门禁。
