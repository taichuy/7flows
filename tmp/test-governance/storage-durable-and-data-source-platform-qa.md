# Storage Durable And Data Source Platform QA

## Scope

- 当前评估模式：`task mode`
- 评估范围：`storage-durable` 边界命名与宿主消费面、`storage-postgres` 持久化实现、data-source plugin contract / runner、control-plane data-source service、api-server data-source routes、checked-in template 与作者文档。
- 输入来源：
  - `docs/superpowers/plans/2026-04-23-storage-durable-and-external-data-source-platform-index.md`
  - `docs/superpowers/plans/2026-04-23-data-source-platform-domain-and-api.md`
  - `docs/superpowers/plans/2026-04-23-data-source-example-template-and-regression.md`
  - 本轮执行提交：`82cbd192`、`3f1ec7ca`、`946500df`、`a6160696`、`7520ba61`
- 路由抽样证据：
  - `api/apps/api-server/src/routes/plugins_and_models/data_sources.rs:211`
  - `api/apps/api-server/src/routes/plugins_and_models/data_sources.rs:231`
  - `api/apps/api-server/src/routes/plugins_and_models/data_sources.rs:261`
  - `api/apps/api-server/src/routes/plugins_and_models/data_sources.rs:285`
- service 写入口抽样证据：
  - `api/crates/control-plane/src/data_source.rs:98`
  - `api/crates/control-plane/src/data_source.rs:135`
  - `api/crates/control-plane/src/data_source.rs:199`
  - `api/crates/control-plane/src/data_source.rs:295`
- repository / runtime 抽样证据：
  - `api/crates/storage-postgres/src/data_source_repository.rs:87`
  - `api/crates/storage-postgres/src/data_source_repository.rs:88`
  - `api/crates/storage-postgres/src/data_source_repository.rs:254`
  - `api/apps/api-server/src/provider_runtime.rs:27`
  - `api/apps/api-server/src/provider_runtime.rs:118`

## Commands Run

- `cargo test --manifest-path api/Cargo.toml -p storage-durable -- --nocapture`
  - PASS, `4 passed; 0 failed`
- `cargo test --manifest-path api/Cargo.toml -p storage-postgres data_source_repository_tests -- --nocapture`
  - PASS, `2 passed; 0 failed`
- `cargo test --manifest-path api/Cargo.toml -p plugin-framework data_source_package -- --nocapture`
  - PASS, `1 passed; 0 failed`
- `cargo test --manifest-path api/Cargo.toml -p plugin-runner data_source_runtime_routes -- --nocapture`
  - 非有效 QA 证据，命令退出 `0` 但 `0 passed; 2 filtered out`
- `cargo test --manifest-path api/Cargo.toml -p plugin-runner --test data_source_runtime_routes -- --nocapture`
  - PASS, `2 passed; 0 failed`
- `cargo test --manifest-path api/Cargo.toml -p control-plane data_source_service_tests -- --nocapture`
  - PASS, `2 passed; 0 failed`
- `cargo test --manifest-path api/Cargo.toml -p api-server data_sources_routes -- --nocapture`
  - PASS, `1 passed; 0 failed`
- `cargo check --manifest-path api/Cargo.toml -p api-server`
  - PASS, exit code `0`
- `rg -n "storage-pg|storage_pg" api -g '!target'`
  - PASS, no hits, exit code `1`

## Conclusion

- 是否存在 `Blocking` 问题：否
- 是否存在 `High` 问题：否
- 当前是否建议继续推进：是，可收口
- 当前最主要的风险：本轮是面向本任务切片的 targeted regression，不等于整个 `api/` workspace 的全量回归
- 正式口径：主仓 durable backend 官方只支持 PostgreSQL；外部数据库、SaaS、HTTP/API 数据源统一通过 `data-source` runtime extension 接入，不能替代主仓 durable backend

## Findings

- 本轮未发现 `Blocking` / `High` 级问题。
- 路由层证据显示认证与 CSRF 仍由宿主管理，写请求没有绕过 service：`api/apps/api-server/src/routes/plugins_and_models/data_sources.rs:215-292`
- service 层证据显示权限、workspace 归属、assignment 检查、runtime 调度仍集中在 `control-plane`：`api/crates/control-plane/src/data_source.rs:98-313`
- repository 层证据显示 `storage-postgres` 仍只承担持久化读写，不承载权限或 HTTP 语义：`api/crates/storage-postgres/src/data_source_repository.rs:87-296`
- runtime 层证据显示 data-source host 仍通过宿主 runtime port 装配，没有引入 plugin 自管 HTTP 面：`api/apps/api-server/src/provider_runtime.rs:27-303`

## Uncovered Areas / Risks

- 未执行 `cargo test --workspace` 或 `node scripts/node/verify-backend.js`，因此结论只覆盖本次 durable-storage / data-source-platform 切片
- 工作树仍存在本任务之外的既有修改；本报告不对那些未纳入本轮提交与验证的改动下确定结论
- checked-in template 仍是 shell fixture，用于 contract / host load 回归，不代表生产级外部数据源适配实现
