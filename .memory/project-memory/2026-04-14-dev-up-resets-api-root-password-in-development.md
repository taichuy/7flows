---
memory_type: project
topic: dev-up 会在开发态启动前重置 api root 密码
summary: 自 `2026-04-14 09` 起，标准本地启动入口 `node scripts/node/dev-up.js` 在 `api-server` 的 `API_ENV` 非 production 时，会先执行 `reset_root_password`，把持久化开发库里的 root 密码同步回 `api/apps/api-server/.env` 中的 `BOOTSTRAP_ROOT_PASSWORD`。
keywords:
  - dev-up
  - api-server
  - root password
  - development
  - auth
match_when:
  - 需要排查本地 `root / change-me` 登录失败
  - 需要确认 dev-up 是否会自动同步开发态 root 密码
  - 需要判断持久化开发库的 root 密码为何会与 `.env` 漂移
created_at: 2026-04-14 09
updated_at: 2026-04-14 09
last_verified_at: 2026-04-14 09
decision_policy: verify_before_decision
scope:
  - scripts/node/dev-up/core.js
  - scripts/node/dev-up/_tests/core.test.js
  - api/apps/api-server/src/bin/reset_root_password.rs
---

# dev-up 会在开发态启动前重置 api root 密码

## 时间

`2026-04-14 09`

## 谁在做什么

- 用户反馈本地使用 `root / change-me` 登录控制台持续返回 `not_authenticated`。
- AI 排查后把修复落在标准本地启动入口 `node scripts/node/dev-up.js`，而不是改动生产态 bootstrap 语义。

## 为什么这样做

- `api-server` 的 bootstrap 只负责“首次补种 root”，不会覆盖已存在 root 用户的密码。
- 持久化开发数据库一旦有人改过 root 密码，后续即使 `.env` 仍是 `BOOTSTRAP_ROOT_PASSWORD=change-me`，登录也会持续失败。
- 生产环境不应在每次启动时自动重置 root 密码，因此不能直接把这个行为塞进通用启动路径。

## 为什么要做

- 本地开发的标准入口已经固定为 `dev-up`，开发态需要可预测、开箱即用的 root 登录体验。
- 把 root 密码同步限制在 `API_ENV` 非 production 的 dev-up prestart 阶段，可以修复本地体验，又不扩大生产风险。

## 截止日期

- 无

## 决策背后动机

- 保持生产启动语义稳定：生产仍只依赖显式环境配置，不自动改 root 密码。
- 让开发态 root 凭据回到 `.env` 单一真值源，避免 UI 登录问题反复落到数据库历史状态上。
- 继续复用已有的 `api-server` 工具 `reset_root_password`，不再引入第二套重置逻辑。
