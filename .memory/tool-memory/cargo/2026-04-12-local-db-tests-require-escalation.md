---
memory_type: tool
topic: cargo 集成测试访问本机 Postgres Redis 时沙箱会拦截
summary: 在当前环境内，`cargo test` 触发 `api-server` 路由测试访问 `127.0.0.1:35432/36379` 时，沙箱内会报 `Operation not permitted`；提权后可正常跑通完整后端测试。
keywords:
  - cargo
  - test
  - postgres
  - redis
  - operation not permitted
match_when:
  - 在本仓库执行依赖本机 Postgres 或 Redis 的 `cargo test`
  - `api-server` 或 `storage-pg` 测试在沙箱内报 `Operation not permitted`
created_at: 2026-04-12 21
updated_at: 2026-04-13 15
last_verified_at: 2026-04-13 15
decision_policy: reference_on_failure
scope:
  - cargo
  - api
  - api/apps/api-server/src/_tests/support.rs
---

# cargo 集成测试访问本机 Postgres Redis 时沙箱会拦截

## 时间

`2026-04-12 21`

## 失败现象

- 在沙箱内执行 `cargo test` 时，`api-server` 路由测试初始化 `test_app()` 直接失败。
- 报错为 `Io(Os { code: 1, kind: PermissionDenied, message: "Operation not permitted" })`。

## 触发条件

- 命令需要访问本机 `Postgres` (`127.0.0.1:35432`) 或 `Redis` (`127.0.0.1:36379`)。
- 典型命令：
  - `cargo test -p api-server`
  - `cargo test -p storage-pg`
  - 全量后端测试命令

## 根因

- 当前运行环境的沙箱限制了测试进程访问本机数据库/缓存端口，即使目标服务运行在同一台机器上。

## 解法

- 对依赖本机 `Postgres/Redis` 的 `cargo test` 使用提权执行。
- 命令中同时显式传入：
  - `API_DATABASE_URL=postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows`
  - `API_REDIS_URL=redis://:sevenflows@127.0.0.1:36379`
  - `BOOTSTRAP_ROOT_ACCOUNT=root`
  - `BOOTSTRAP_ROOT_EMAIL=root@example.com`
  - `BOOTSTRAP_ROOT_PASSWORD=change-me`
  - `BOOTSTRAP_TEAM_NAME=1Flowse`

## 验证方式

- 提权后执行完整后端测试：
  - `cargo test -p domain -p access-control -p storage-pg -p storage-redis -p control-plane -p api-server -v`
- 验证结果：所有测试通过，包括 `api-server` 路由测试和 `storage-pg` migration smoke。

## 复现记录

- `2026-04-12 21`：沙箱内执行 `cargo test` 触发 `Operation not permitted`；提权重跑后通过。
- `2026-04-13 15`：执行 `cargo test -p api-server _tests::session_routes::delete_session_route_clears_current_session -- --exact` 时，沙箱内在 `api/apps/api-server/src/_tests/support.rs:37` 的 `PgPool::connect` 处报 `Operation not permitted`；提权重跑后才能进入真实路由断言。
