---
created_at: 2026-05-05 23
topic: quality-audit-followups
status: needs_user_decision
updated_at: 2026-05-06 03
---

# 2026-05-05 质量审核待确认项

本轮已确认 `latest` 远端质量门禁通过，并补了低风险覆盖 / 模板质量缺口。下面这些属于结构性质量问题，改动范围较大，不适合在无人值守时直接搬迁大量文件。

## 2026-05-06 01 值守证据

- 最新远端质量门禁 issue：`#60`，`latest` / `db5e4fd` / passed，已评论并关闭。
- GitHub Actions：`verify` run `25389415294` 成功，`CodeQL` run `25389414651` 成功。
- Artifact JSON：`status=passed`、`exitCode=0`、`warningFiles=[]`。
- Artifact 已下载到 `tmp/test-governance/remote-25389415294/`，该目录按 `.gitignore` 保持本地证据，不提交。

## 2026-05-06 02 值守证据

- 最新远端质量门禁 issue：`#61`，`latest` / `ceb42f7` / passed，已评论并关闭。
- GitHub Actions：`verify` run `25391498159` 成功，`CodeQL` run `25391496705` 成功。
- Artifact JSON：`status=passed`、`exitCode=0`、`warningFiles=[]`。
- Artifact 已下载到 `tmp/test-governance/remote-run-25391498159/`，该目录按 `.gitignore` 保持本地证据，不提交。

## 2026-05-06 03 值守证据

- 最新远端质量门禁 issue：`#63`，`latest` / `af73c21` / passed，已评论并关闭。
- GitHub Actions：`verify` run `25396463387` 成功，`CodeQL` run `25396459993` 成功。
- Artifact JSON：`status=passed`、`exitCode=0`、`warningFiles=[]`。
- Artifact 已下载到 `tmp/test-governance/remote-run-25396463387/`，该目录按 `.gitignore` 保持本地证据，不提交。

## 2026-05-06 06 值守证据

- 最新远端质量门禁 issue：`#66`，`latest` / `1806bec` / passed，已评论并关闭。
- GitHub Actions：`verify` run `25403877772` 成功，`CodeQL` run `25403877789` 成功。
- Artifact JSON：`status=passed`、`exitCode=0`、`warningFiles=[]`。
- Artifact 已下载到 `tmp/test-governance/remote-run-25403877772-2300/`，该目录按 `.gitignore` 保持本地证据，不提交。

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
   - 低覆盖文件仍包括 `repositories.rs` 40.70%、`application_mapper.rs` 41.30% 等。
   - `2026-05-06 01` 已补 `member_repository.rs` / `role_repository.rs` 仓储测试，覆盖默认建成员、成员角色替换、workspace 默认角色切换、角色权限替换。
   - 建议方向：先观察下一次远端 coverage artifact 的 `storage-postgres` 改善幅度，再决定是否继续补 `repositories.rs` / mapper 覆盖或提高后端覆盖率门槛。

4. 是否安排前端覆盖率专项：
   - 远端 artifact 显示前端总 line coverage 为 79.63%，function coverage 为 74.30%。
   - 本轮已补 `features/applications/api/runtime.ts` 定向测试。
   - 建议方向：继续优先补 feature API 适配层和纯函数，不先用 jsdom 覆盖复杂视觉组件。

## 本轮已处理

- 新增 `web/app/src/features/applications/_tests/applications-runtime-api.test.ts`。
- 覆盖 `applications/api/runtime.ts` 的 query key、read request base URL 传递、resume/callback mutation payload 映射。
- 调整 `scripts/node/plugin/manifest.js` 的 Rust provider scaffold，stdin 读取失败时显式 `stderr + exit(1)`，避免模板传播 `unwrap()` 式 panic。
- 补充 `scripts/node/plugin/_tests/core.test.js` 断言生成的 `src/main.rs` 不再包含 `.unwrap(`，并验证错误处理模板存在。
- 补充 `api/crates/storage-durable/postgres/src/_tests/member_role_repository_tests.rs` 中成员 / 角色仓储边界测试：
  - 普通成员禁用和重置密码会更新状态、副作用和 `session_version`。
  - root 用户禁用 / 重置密码保持不可变保护。
  - 无效角色替换不会清空已有成员角色绑定。
  - 默认角色、已绑定角色和未使用自定义角色删除路径有明确回归覆盖。
- 拆分 `api/crates/control-plane/src/_tests/orchestration_runtime/support/repository.rs`：
  - `support/repository/mod.rs` 保留内存状态、构造器和测试 fixture seed helper。
  - `support/repository/flow_ports.rs` 收纳 Application / Flow / Model Definition / Plugin / Model Provider 端口 mock。
  - `support/repository/provider_runtime.rs` 收纳 provider / capability runtime mock。
  - `support/repository/runtime_repository.rs` 收纳 orchestration runtime repository mock 与其专属回归测试。
  - 原 2660 行单文件拆为 690 / 709 / 199 / 1068 行，均低于 1500 行预算。
- 补充 `web/app/src/features/agent-flow/_tests/api/data-model-options.test.ts`：
  - 覆盖 `agent-flow/api/data-model-options.ts` 的稳定 query key、Data Model 状态到选项状态的映射、字段排序 / 标题兜底和 base URL 调用契约。
  - 本地验证：`pnpm --dir web/app test -- src/features/agent-flow/_tests/data-model-options.test.ts` 触发前端 fast 套件，71 个测试文件 / 322 个测试通过；移动到 `_tests/api/` 后用 `scripts/node/exec-with-real-node.sh scripts/node/run-frontend-vitest.js run src/features/agent-flow/_tests/api/data-model-options.test.ts` 窄范围复核通过，1 个测试文件 / 3 个测试通过。
