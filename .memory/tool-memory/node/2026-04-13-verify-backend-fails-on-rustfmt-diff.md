---
memory_type: tool
topic: verify-backend 会先卡 rustfmt diff 后再继续后端门禁
summary: `node scripts/node/verify-backend.js` 在后端代码未格式化时会直接输出 `Diff in ...` 并以失败退出；先对提示文件执行 `cargo fmt`，再重跑脚本即可继续完成完整后端验证。
keywords:
  - node
  - verify-backend
  - rustfmt
  - diff
  - formatting
match_when:
  - 执行 `node scripts/node/verify-backend.js`
  - 输出 `Diff in ...`
  - 失败发生在 Rust 文件格式检查阶段
created_at: 2026-04-13 16
updated_at: 2026-04-13 16
last_verified_at: 2026-04-13 16
decision_policy: reference_on_failure
scope:
  - node
  - scripts/node/verify-backend.js
  - api/apps/api-server
---

# verify-backend 会先卡 rustfmt diff 后再继续后端门禁

## 时间

`2026-04-13 16`

## 失败现象

执行：

```bash
node scripts/node/verify-backend.js
```

时，脚本先输出：

```text
Diff in .../openapi_alignment.rs
Diff in .../runtime_models.rs
Diff in .../health_routes.rs
```

随后以非零状态退出，没有继续完成后续验证。

## 触发条件

- 已修改后端 Rust 文件；
- 这些文件尚未通过 rustfmt；
- 直接运行统一后端门禁脚本。

## 根因

`verify-backend.js` 把 Rust 格式一致性作为前置门禁；只要存在 rustfmt diff，脚本就会提前失败，不会继续执行完整测试链路。

## 解法

- 根据脚本输出的 diff 文件列表，先运行 `cargo fmt` 格式化对应 Rust 文件；
- 然后重新执行 `node scripts/node/verify-backend.js`。

## 验证方式

- 首次执行脚本，复现 `Diff in ...` 失败；
- 对提示文件完成格式化后重跑脚本，完整后端检查与测试全部通过。

## 复现记录

- `2026-04-13 16`：执行 backend route/OpenAPI 对齐计划的 Task 3 时，`verify-backend.js` 首次因 `openapi_alignment.rs`、`runtime_models.rs`、`health_routes.rs` 的 rustfmt diff 失败；格式化后重跑通过。
- `2026-04-14 00`：执行 settings docs 的后端统一门禁时，脚本先对 `openapi_docs.rs`、`lib.rs`、`src/_tests/support.rs` 的 rustfmt diff 报错并提前退出；先运行 `cd api && cargo fmt` 后，再次执行 `node scripts/node/verify-backend.js` 全量通过。
