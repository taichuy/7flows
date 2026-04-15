---
memory_type: tool
topic: cargo 后端数据库测试可能被本机 Postgres 端口映射重置连接
summary: 在当前环境内，`cargo test -p api-server` 或 `cargo test -p storage-pg` 访问 `127.0.0.1:35432` 时，可能在 `PgPool::connect` / `PgConnection::connect` 处报 `Connection reset by peer`，即使 `docker-db-1` 已 healthy；应先用 `docker exec` 验证容器内数据库正常，再把它判定为宿主端口映射环境问题，不要误改业务代码。
keywords:
  - cargo
  - postgres
  - connection reset
  - docker
  - host port
match_when:
  - `cargo test -p api-server` 或 `cargo test -p storage-pg` 在数据库连接初始化阶段失败
  - 报错包含 `Connection reset by peer`
  - 失败位置在 `support.rs` 或 `flow_repository_tests.rs` 的 `connect` 调用附近
created_at: 2026-04-15 16
updated_at: 2026-04-15 16
last_verified_at: 2026-04-15 16
decision_policy: reference_on_failure
scope:
  - cargo
  - api
  - postgres
  - docker-db-1
---

# cargo 后端数据库测试可能被本机 Postgres 端口映射重置连接

## 时间

`2026-04-15 16`

## 失败现象

- 执行 `cargo test -p api-server application_orchestration_routes -v` 时，在 `api/apps/api-server/src/_tests/support.rs:46` 的数据库连接阶段报 `Io(Os { code: 104, kind: ConnectionReset, message: "Connection reset by peer" })`。
- 执行 `cargo test -p storage-pg flow_repository_tests -v` 时，在 `api/crates/storage-pg/src/_tests/flow_repository_tests.rs:22` 的数据库连接阶段报同样错误。

## 触发条件

- 从宿主环境执行依赖本机 `Postgres` 的 `cargo test`。
- 连接目标是 `127.0.0.1:35432` 映射出来的 `docker-db-1`。

## 根因

- 当前会话里数据库容器本身是健康的，但宿主访问 `127.0.0.1:35432` 的端口映射不稳定；测试在建连阶段被宿主侧连接重置，不是 agentflow 代码断言失败。

## 解法

- 先执行 `docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'`，确认 `docker-db-1` 为 `healthy`。
- 再执行 `docker exec docker-db-1 pg_isready -U postgres -d sevenflows`。
- 再执行 `docker exec docker-db-1 psql -U postgres -d sevenflows -c 'select 1'`。
- 如果容器内检查通过、但宿主 `cargo test` 仍在 `127.0.0.1:35432` 报 `Connection reset by peer`，应把它视为宿主端口映射环境问题，暂停修改业务代码，先完成不依赖数据库的验证，再在能稳定访问本机端口的环境重跑后端测试。

## 验证方式

- `docker exec docker-db-1 pg_isready -U postgres -d sevenflows` 返回 `accepting connections`。
- `docker exec docker-db-1 psql -U postgres -d sevenflows -c 'select 1'` 返回单行结果 `1`。
- 在此之后，宿主侧 `cargo test` 依旧报 `Connection reset by peer`，可确认阻塞点不在业务代码。

## 复现记录

- `2026-04-15 16`：为执行 agentflow editor Task 7 最终回归，宿主侧运行 `cargo test -p api-server application_orchestration_routes -v` 与 `cargo test -p storage-pg flow_repository_tests -v` 时都在 PostgreSQL 建连阶段被重置；随后用 `docker exec docker-db-1 pg_isready ...` 与 `psql -c 'select 1'` 验证容器内数据库正常，确认是宿主端口映射环境阻塞而非代码回归。
