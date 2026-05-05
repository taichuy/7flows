---
created_at: 2026-05-05 23
topic: quality-audit-followups
status: needs_user_decision
updated_at: 2026-05-06 00
---

# 2026-05-05 质量审核待确认项

本轮已确认 `latest` 远端质量门禁通过，并补了低风险覆盖 / 模板质量缺口。下面这些属于结构性质量问题，改动范围较大，不适合在无人值守时直接搬迁大量文件。

## 2026-05-06 00 值守证据

- 最新远端质量门禁 issue：`#59`，`latest` / `6ad8dd9` / passed，已评论并关闭。
- GitHub Actions：`verify` run `25387033017` 成功，`CodeQL` run `25387029740` 成功。
- Artifact JSON：`status=passed`、`exitCode=0`、`warningFiles=[]`。
- Artifact 已下载到 `tmp/test-governance/remote-run-25387033017/`，该目录按 `.gitignore` 保持本地证据，不提交。

## 需要拍板的方向

1. 是否优先拆后端超大文件：
   - `api/crates/storage-durable/postgres/src/orchestration_runtime_repository.rs`：2601 行。
   - `api/crates/control-plane/src/orchestration_runtime/live_debug_run.rs`：1924 行。
   - `api/crates/control-plane/src/model_definition.rs`：1693 行。
   - 建议方向：按 repository / mapper / event-stream / service command 拆，先从 `orchestration_runtime_repository.rs` 开始。

2. 是否优先治理目录横向摊平：
   - `scripts/node` 当前 23 个文件。
   - `api/crates/control-plane/src` 当前 24 个文件。
   - `api/crates/storage-durable/postgres/src` 当前 19 个文件。
   - 建议方向：只在对应模块有业务改动时顺手收纳，不单独做纯搬迁，避免无效冲突。

3. 是否安排后端覆盖率专项：
   - 远端 artifact 显示 `storage-postgres` line coverage 为 77.08%。
   - 低覆盖文件包括 `member_repository.rs` 0%、`role_repository.rs` 10%、`repositories.rs` 40.70%、`application_mapper.rs` 41.30%。
   - 建议方向：先补 `member_repository.rs` / `role_repository.rs` 仓储测试，再决定是否提高后端覆盖率门槛。

4. 是否安排前端覆盖率专项：
   - 远端 artifact 显示前端总 line coverage 为 79.63%，function coverage 为 74.30%。
   - 本轮已补 `features/applications/api/runtime.ts` 定向测试。
   - 建议方向：继续优先补 feature API 适配层和纯函数，不先用 jsdom 覆盖复杂视觉组件。

## 本轮已处理

- 新增 `web/app/src/features/applications/_tests/applications-runtime-api.test.ts`。
- 覆盖 `applications/api/runtime.ts` 的 query key、read request base URL 传递、resume/callback mutation payload 映射。
- 调整 `scripts/node/plugin/manifest.js` 的 Rust provider scaffold，stdin 读取失败时显式 `stderr + exit(1)`，避免模板传播 `unwrap()` 式 panic。
- 补充 `scripts/node/plugin/_tests/core.test.js` 断言生成的 `src/main.rs` 不再包含 `.unwrap(`，并验证错误处理模板存在。
