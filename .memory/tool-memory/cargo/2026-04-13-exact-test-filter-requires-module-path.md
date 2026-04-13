---
memory_type: tool
topic: cargo test 对 src 内单元测试使用 --exact 时需要带完整模块路径
summary: 对定义在 `src/_tests` 里的 Rust 单元测试使用 `cargo test ... -- --exact` 时，裸函数名不会命中任何用例；需要先用 `cargo test -- --list` 查看完整测试名，再传入如 `_tests::module::case_name` 的全路径。
keywords:
  - cargo
  - test
  - exact
  - unit test
  - module path
match_when:
  - 使用 `cargo test ... -- --exact`
  - 输出 `running 0 tests`
  - 预期存在的 src 内单元测试没有被命中
created_at: 2026-04-13 12
updated_at: 2026-04-13 15
last_verified_at: 2026-04-13 15
decision_policy: reference_on_failure
scope:
  - cargo
  - api
  - src/_tests
---

# cargo test 对 src 内单元测试使用 --exact 时需要带完整模块路径

## 时间

`2026-04-13 12`

## 失败现象

执行：

```bash
cargo test -p api-server model_definition_routes_manage_models_and_fields_without_publish -- --exact
```

或：

```bash
cargo test -p api-server runtime_model_routes_create_fetch_update_delete_and_filter_records -- --exact
```

时，`cargo` 显示：

```text
running 0 tests
test result: ok. 0 passed; 0 failed; ... filtered out
```

## 触发条件

- 测试定义在 crate 的 `src/_tests/*.rs`
- 命令使用了 `-- --exact`
- 过滤参数只传裸函数名，没有包含模块路径

## 根因

Rust 单元测试的真实测试名包含模块层级；`--exact` 会按完整名精确匹配。`src/_tests/model_definition_routes.rs` 中的测试实际名称是 `_tests::model_definition_routes::model_definition_routes_manage_models_and_fields_without_publish`，所以裸函数名不会命中。

## 解法

- 先运行 `cargo test -p <crate> -- --list` 找到真实测试名
- 对 unit test 使用完整模块路径，例如：

```bash
cargo test -p api-server --lib _tests::model_definition_routes::model_definition_routes_manage_models_and_fields_without_publish -- --exact
```

```bash
cargo test -p api-server --lib _tests::runtime_model_routes::runtime_model_routes_create_fetch_update_delete_and_filter_records -- --exact
```

## 验证方式

- `cargo test -p api-server -- --list`
- `cargo test -p api-server --lib _tests::model_definition_routes::model_definition_routes_manage_models_and_fields_without_publish -- --exact`
- `cargo test -p api-server --lib _tests::runtime_model_routes::runtime_model_routes_create_fetch_update_delete_and_filter_records -- --exact`

以上命令已验证可正确命中并执行目标测试。

## 复现记录

- `2026-04-13 12`：执行数据建模物理表 runtime 计划的 Task 4 聚焦测试时首次触发；改为先列出测试名并传入完整模块路径后，目标用例正常执行。
- `2026-04-13 15`：执行 `cargo test -p api-server delete_session_route_clears_current_session -- --exact` 时显示 `running 0 tests`；改为 `_tests::session_routes::delete_session_route_clears_current_session` 后命中真实用例并暴露 405 路由缺失。
