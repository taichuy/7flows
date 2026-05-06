# 2026-05-06 22 Dependabot Alerts Quality Follow-up

## Context

质量门禁 `verify` 已在 GitHub 上通过，但 `git push` 返回 GitHub Dependabot 提示：默认分支仍有 19 个 open vulnerability alerts。

本文件初始记录了 `2026-05-06` 的 Dependabot 摘要。`2026-05-07 01` 的离线质量值守已处理其中可直接修的 high / critical / npm medium 项：

- `web/package.json` 增加 `pnpm.overrides`：`protobufjs@7.5.5`、`glob@10.5.0`、`postcss@8.5.10`、`dompurify@3.4.0`。
- `tmp/demo/package.json` 增加 `postcss@8.5.10` override，修复历史 demo lockfile 中的 postcss alert。
- `api/Cargo.lock` 将 `rustls-webpki 0.103.11` 更新到 `0.103.13`，修复 high alert #31。
- 定向验证：`pnpm --dir web audit --audit-level high --registry=https://registry.npmjs.org` 与 `pnpm --dir tmp/demo audit --audit-level moderate --registry=https://registry.npmjs.org` 均返回 `No known vulnerabilities found`。

## Remaining User Decision

仍剩低危 Rust 传递依赖 alert，需要用户决定是否进入单独依赖升级任务，因为它们不是单个 patch lockfile 就能完整收口：

- `rustls-webpki 0.101.7`：由 `rustls 0.21.12 -> aws-smithy-http-client / hyper-rustls / tokio-rustls` 链路引入。
- `rand 0.8.5`：由 `sqlx-postgres 0.8.6` 链路引入，patched version 是 `0.8.6`。
- `lru 0.12.5`：由 `aws-sdk-s3 1.119.0` 链路引入，patched version 是 `0.16.3`。

## Suggested Decision

建议单独开一轮低危 Rust 依赖治理任务：

1. 先评估是否升级 AWS SDK / Smithy / SQLx 相关父依赖，避免用 `[patch]` 或强行 override 破坏 semver 边界。
2. 优先处理仍在 default branch 打开的 Dependabot alert，处理后通过 GitHub `verify` 跑远端质量门禁。
3. 若用户决定低危 alert 不进入近期范围，则保持本文件，等依赖栈自然升级时再清理。

## Stop Condition

未确认低危 Rust 依赖治理范围前，不做 AWS SDK / SQLx 父依赖大范围升级。
