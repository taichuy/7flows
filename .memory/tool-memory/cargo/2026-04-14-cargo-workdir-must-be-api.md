---
memory_type: tool
topic: cargo 在仓库根执行会因缺少 Cargo.toml 直接失败
summary: 在 `1flowbase` 仓库根执行 `cargo test -p api-server ...` 会报 `could not find Cargo.toml`，因为 Rust workspace 根在 `api/`；应切到 `api/` 目录执行。`cargo fmt --manifest-path api/Cargo.toml` 可能报 `Failed to find targets`，格式化也优先在 `api/` 下跑 `cargo fmt --all`。
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
updated_at: 2026-05-06 05
last_verified_at: 2026-05-06 05
decision_policy: reference_on_failure
scope:
  - cargo
  - api
  - /home/taichu/git/1flowbase/api/Cargo.toml
---

# cargo 在仓库根执行会因缺少 Cargo.toml 直接失败

## 时间

`2026-04-14 21`

## 失败现象

- 在仓库根执行 `cargo test -p api-server _tests::openapi_docs_tests::category_spec_builder_keeps_all_category_operations_closed -- --exact` 直接失败。
- 报错为 `could not find Cargo.toml in /home/taichu/git/1flowbase or any parent directory`。

## 触发条件

- 把 `1flowbase` 仓库根误当成 Rust workspace 根，直接从 `/home/taichu/git/1flowbase` 执行 `cargo` 命令。

## 根因

- 当前 Rust workspace 的真实根目录是 `/home/taichu/git/1flowbase/api`，仓库根本身没有 `Cargo.toml`。

## 解法

- 默认把 `cargo` 的 `workdir` 设为 `/home/taichu/git/1flowbase/api`。
- 普通 `cargo test` / `cargo check` 如必须从仓库根执行，可显式传 `--manifest-path api/Cargo.toml`。
- `cargo fmt` 不走仓库根 `--manifest-path api/Cargo.toml`；遇到 `Failed to find targets` 时，切到 `api/` 后执行 `cargo fmt --all`。

## 验证方式

- 切到 `api/` 目录后执行 `cargo test -p api-server _tests::openapi_docs_tests::category_spec_builder_keeps_all_category_operations_closed -- --exact` 通过。

## 复现记录

- `2026-04-14 21`：为了回归 settings API docs 的后端 registry 测试，先在仓库根直接执行 `cargo test -p api-server ...`，命中 `could not find Cargo.toml`；改到 `api/` 目录后测试立即通过。
- `2026-04-15 16`：为执行 agentflow editor Task 7 的后端回归，先在仓库根执行 `cargo test -p api-server application_orchestration_routes -v`，再次命中 `could not find Cargo.toml`；切到 `api/` 目录后命令正常进入真实测试阶段。
- `2026-05-06 05`：在仓库根执行 `cargo fmt --manifest-path api/Cargo.toml` 命中 `Failed to find targets`；切到 `api/` 后执行 `cargo fmt --all` 通过。
