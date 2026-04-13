---
memory_type: tool
topic: 先确认路径存在且是文件，再用 sed 读取内容
summary: 在仓库里直接用 `sed` 读取猜测路径可能因为目标不存在或实际是目录而失败；已验证做法是先用 `find`、`ls -ld` 或 `file` 确认路径存在且为普通文件，再读取目标文件。
keywords:
  - bash
  - sed
  - missing-file
  - is-a-directory
  - find
match_when:
  - 需要读取脚本目录里的辅助文档或说明文件
  - 使用 `sed` 打开猜测路径时报“没有那个文件或目录”
  - 使用 `sed` 读取路径时报“是一个目录”
created_at: 2026-04-13 08
updated_at: 2026-04-13 21
last_verified_at: 2026-04-13 21
decision_policy: reference_on_failure
scope:
  - bash
  - sed
  - find
  - ls
  - docs/superpowers
  - api/apps/api-server/src
  - scripts/node/verify-backend
---

# 先确认路径存在且是文件，再用 sed 读取内容

## 时间

`2026-04-13 08`

## 失败现象

执行 `sed` 读取猜测路径时，可能返回“没有那个文件或目录”或“是一个目录”。

## 触发条件

在探索仓库目录时，主观假定某个路径就是文档文件，直接按猜测路径读取，没有先确认它是否存在、是否其实是目录，或者真实内容是否已经搬到别的文件。

## 根因

失败来自路径假设，而不是权限或编码问题：

- 某些路径根本不存在；
- 某些路径存在，但实际是目录；
- 某些职责已经挪到相邻文件，例如 OpenAPI 聚合放在 `lib.rs`，并不存在单独的 `openapi.rs`。

## 解法

先用 `find <dir> -maxdepth 2 -type f`、`ls -ld <path>` 或 `file <path>` 确认目录内容和路径类型，再对确认存在的普通文件执行 `sed` / `cat`。

## 验证方式

先执行目录或文件类型检查，再读取真实文件：

- `find scripts/node/mock-ui-sync -maxdepth 2 -type f`
- `find docs/superpowers/specs/1flowse/modules/01-user-auth-and-team -maxdepth 2 \\( -name 'AGENTS.md' -o -type f \\)`
- `ls -ld api/apps/api-server/src/lib.rs`

## 复现记录

- `2026-04-13 08`：在 `scripts/node/mock-ui-sync` 目录假定存在 `plan.md` 失败，改为先列目录后已成功读取实际文件。
- `2026-04-13 14`：读取 `docs/superpowers/specs/1flowse/modules/01-user-auth-and-team*` 时命中目录本身，`sed` 返回“是一个目录”；改为先用 `find` 列出目录中的真实文件，再读取 `README.md` 成功。
- `2026-04-13 14`：主观假定 `api/apps/api-server/src/openapi.rs` 存在，`sed` 返回“没有那个文件或目录”；改为检索 `#[openapi(` 后确认 OpenAPI 聚合定义实际在 `api/apps/api-server/src/lib.rs`。
- `2026-04-13 21`：在后端 QA 时主观假定 `scripts/node/verify-backend/index.js` 存在，`sed` 返回“没有那个文件或目录”；改为先读取 `scripts/node/verify-backend.js` 并用 `ls scripts/node` 确认脚本入口后完成验证。
- `2026-04-13 21`：拼接 `rg` 搜索范围时误写成不存在的复合路径 `api/crates/storage-pg/src/api/apps/api-server/src`，命令直接报路径不存在；后续应先分目录确认真实搜索根，再执行检索。
