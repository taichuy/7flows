---
memory_type: tool
topic: cargo test 命令行位置只接受一个测试过滤参数
summary: 在 `cargo test [TESTNAME] -- [ARGS]` 里把多个测试名连续塞到 `cargo test` 主参数区，会直接报 `unexpected argument ... found`；需要拆成多条命令串行执行，或改用一次只传一个过滤名。
keywords:
  - cargo
  - test
  - filter
  - unexpected argument
match_when:
  - 执行 `cargo test`
  - 一条命令里写了多个测试名
  - 输出 `unexpected argument ... found`
created_at: 2026-04-14 00
updated_at: 2026-04-14 00
last_verified_at: 2026-04-14 00
decision_policy: reference_on_failure
scope:
  - cargo
  - api
---

# cargo test 命令行位置只接受一个测试过滤参数

## 时间

`2026-04-14 00`

## 失败现象

执行：

```bash
cargo test -p api-server openapi_docs_tests docs_routes_allow_root_and_granted_members session_route_returns_wrapped_actor_payload_and_csrf_token -- --nocapture
```

会直接报：

```text
error: unexpected argument 'docs_routes_allow_root_and_granted_members' found
```

## 为什么当时要这么做

想一次把本轮新增的三个后端红灯测试一起跑出来，减少命令往返。

## 为什么失败

`cargo test` 在 `--` 之前只接受一个可选的 `TESTNAME` 过滤参数；第二个测试名会被当成非法额外参数，而不是“再加一个过滤条件”。

## 后续避免建议

- `cargo test` 需要多个不同过滤条件时，拆成多条命令串行执行。
- 如果只是想跑整个模块，用单个模块路径过滤。
- 不要把多个裸测试名直接连续拼到同一条 `cargo test` 命令里。

## 复现记录

- `2026-04-14 00`：为验证 settings docs 的后端红灯测试，一次把 `openapi_docs_tests`、`docs_routes_allow_root_and_granted_members`、`session_route_returns_wrapped_actor_payload_and_csrf_token` 同时放进 `cargo test`，立即得到 `unexpected argument`；拆成三条串行命令后正常执行。
