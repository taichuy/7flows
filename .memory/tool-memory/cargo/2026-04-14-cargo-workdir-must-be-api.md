---
memory_type: tool
topic: cargo 在仓库根执行会因缺少 Cargo.toml 直接失败
summary: 在 `1flowse` 仓库根执行 `cargo test -p api-server ...` 会报 `could not find Cargo.toml`，因为 Rust workspace 根在 `api/`；应切到 `api/` 目录执行，或显式带 `--manifest-path api/Cargo.toml`。
keywords:
  - cargo
  - workdir
  - Cargo.toml
  - api
  - workspace
match_when:
  - 需要在本仓库执行任何 `cargo test`、`cargo check`、`cargo fmt`
  - 命令在仓库根直接报 `could not find Cargo.toml`
created_at: 2026-04-14 21
updated_at: 2026-04-15 16
last_verified_at: 2026-04-15 16
decision_policy: reference_on_failure
scope:
  - cargo
  - api
  - /home/taichu/git/1flowse/api/Cargo.toml
---

# cargo 在仓库根执行会因缺少 Cargo.toml 直接失败

## 时间

`2026-04-14 21`

## 失败现象

- 在仓库根执行 `cargo test -p api-server _tests::openapi_docs_tests::category_spec_builder_keeps_all_category_operations_closed -- --exact` 直接失败。
- 报错为 `could not find Cargo.toml in /home/taichu/git/1flowse or any parent directory`。

## 触发条件

- 把 `1flowse` 仓库根误当成 Rust workspace 根，直接从 `/home/taichu/git/1flowse` 执行 `cargo` 命令。

## 根因

- 当前 Rust workspace 的真实根目录是 `/home/taichu/git/1flowse/api`，仓库根本身没有 `Cargo.toml`。

## 解法

- 默认把 `cargo` 的 `workdir` 设为 `/home/taichu/git/1flowse/api`。
- 如果必须从仓库根执行，则显式传 `--manifest-path api/Cargo.toml`。

## 验证方式

- 切到 `api/` 目录后执行 `cargo test -p api-server _tests::openapi_docs_tests::category_spec_builder_keeps_all_category_operations_closed -- --exact` 通过。

## 复现记录

- `2026-04-14 21`：为了回归 settings API docs 的后端 registry 测试，先在仓库根直接执行 `cargo test -p api-server ...`，命中 `could not find Cargo.toml`；改到 `api/` 目录后测试立即通过。
- `2026-04-15 16`：为执行 agentflow editor Task 7 的后端回归，先在仓库根执行 `cargo test -p api-server application_orchestration_routes -v`，再次命中 `could not find Cargo.toml`；切到 `api/` 目录后命令正常进入真实测试阶段。
