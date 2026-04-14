---
memory_type: tool
topic: sqlx migration 文件改动后在共享数据库上触发 checksum 不一致
summary: 当修改 `api/crates/storage-pg/migrations` 下已执行过的 migration 文件时，直接对共享数据库运行 `run_migrations` 会报 `previously applied but has been modified`；已验证的解法是让相关测试改用独立 schema 的数据库 URL。
keywords:
  - sqlx
  - migrations
  - checksum
  - schema
match_when:
  - Rust/backend 测试在 `run_migrations` 阶段报 `previously applied but has been modified`
  - 需要修改 `api/crates/storage-pg/migrations` 后重跑依赖数据库的测试
created_at: 2026-04-14 16
updated_at: 2026-04-14 16
last_verified_at: 2026-04-14 16
decision_policy: reference_on_failure
scope:
  - sqlx
  - api/crates/storage-pg/migrations
  - api/crates/storage-pg/src/_tests
---

# sqlx migration 文件改动后在共享数据库上触发 checksum 不一致

## 时间

`2026-04-14 16`

## 失败现象

测试在 `run_migrations(&pool)` 阶段失败，报错为 `migration 20260412183000 was previously applied but has been modified`。

## 触发条件

已经改动过 `api/crates/storage-pg/migrations` 里的历史 migration 文件后，再对共享数据库或共享默认 schema 直接执行测试。

## 根因

`sqlx` 会校验当前 migration 文件内容与数据库里已记录的已执行 migration checksum；共享数据库之前已经跑过旧版本 migration，所以修改文件后会触发不一致。

## 解法

让依赖 migration 的测试改用独立 schema：

1. 用管理连接创建新的随机 schema。
2. 通过 `?options=-csearch_path%3D<schema>` 生成隔离数据库 URL。
3. 用该 URL 建立连接并执行 `run_migrations`。

## 验证方式

在 `storage-pg` 相关测试中采用独立 schema 后，以下验证已通过：

- `cargo test -p storage-pg _tests::migration_smoke::migration_smoke_creates_workspace_tables_and_workspace_scoped_indexes -- --exact`
- `cargo test -p storage-pg _tests::physical_schema_repository_tests::create_runtime_model_table_always_uses_scope_id_column -- --exact`
- `cargo test -p storage-pg -- --test-threads=1`

## 复现记录

- `2026-04-14 16`：`physical_schema_repository_tests` 在共享数据库上修改 migration 后触发 checksum 失败，切到独立 schema 后恢复稳定。
