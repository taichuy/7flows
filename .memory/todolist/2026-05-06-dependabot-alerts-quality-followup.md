# 2026-05-06 22 Dependabot Alerts Quality Follow-up

## Context

质量门禁 `verify` 已在 GitHub 上通过，但 `git push` 返回 GitHub Dependabot 提示：默认分支仍有 19 个 open vulnerability alerts。

已用 `gh api repos/taichuy/1flowbase/dependabot/alerts` 读取摘要：

- Critical: 1
  - `protobufjs`, `web/pnpm-lock.yaml`, alert #23, "Arbitrary code execution in protobufjs"
- High: 2
  - `rustls-webpki`, `api/Cargo.lock`, alert #31, "Denial of service via panic on malformed CRL BIT STRING"
  - `glob`, `web/pnpm-lock.yaml`, alert #16, "Command injection via -c/--cmd executes matches with shell:true"
- Medium: 12
  - 多数集中在 `dompurify`、`postcss`、`protobufjs` 等 npm 依赖
- Low: 4
  - `rand`、`rustls-webpki`、`lru` 等 Rust 依赖

## Why This Needs User Decision

这些 alert 不属于当前 `quality-gate` 的 pass/fail 条件；修复通常需要升级 npm / Rust lockfile 依赖，可能触发较大范围依赖解析变化。

## Suggested Decision

建议单独开一轮依赖安全治理任务，先处理 critical/high：

1. 前端：定位 `protobufjs`、`glob` 来源，优先升级最小 transitive dependency 或相关 direct package。
2. 后端：定位 `rustls-webpki` 由哪些 crate 引入，优先用 `cargo update -p rustls-webpki` 或升级上游依赖。
3. 每次锁文件更新后，通过 GitHub `verify` 跑远端质量门禁，不用本地全局门禁替代。

## Stop Condition

用户确认是否把 Dependabot alert 纳入下一轮质量门禁目标；确认前本轮只记录，不擅自做大范围依赖升级。
