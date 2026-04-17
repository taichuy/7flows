---
memory_type: tool
topic: bash 中对仓库根目录执行 find 可能命中受限卷并报权限不足
summary: 在仓库根目录直接跑 `find .` 时，若仓库内存在如 `docker/volumes/postgres` 这类受限目录，会出现 `权限不够`；将搜索范围缩到目标目录，或对错误输出做重定向，可稳定避免噪声。
keywords:
  - bash
  - find
  - permission denied
  - docker volume
match_when:
  - 在仓库根目录运行 `find .`
  - 输出出现 `权限不够` 或 `Permission denied`
created_at: 2026-04-13 06
updated_at: 2026-04-17 18
last_verified_at: 2026-04-17 18
decision_policy: reference_on_failure
scope:
  - bash
  - find
  - docker/volumes/postgres
---

# bash 中对仓库根目录执行 find 可能命中受限卷并报权限不足

## 时间

`2026-04-13 06`

## 失败现象

执行：

```bash
find . -type d \( -name draft -o -name history -o -name legacy-memory-root \) | sort
```

时出现：

```text
find: ‘./docker/volumes/postgres’: 权限不够
```

## 触发条件

- 在仓库根目录直接扫描全量目录
- 仓库内包含受限的本地卷或系统生成目录

## 根因

`find .` 会递归进入所有可见子目录；仓库内的 `docker/volumes/postgres` 权限不足，导致搜索结果被错误输出污染。

## 解法

- 优先把搜索范围缩到真实目标目录，例如 `.memory`、`docs`
- 如果只是做存在性排查，可加 `2>/dev/null` 屏蔽无关权限噪声

## 验证方式

- `find .memory -maxdepth 3 -type d | sort`
- `find docs -maxdepth 2 -type d | sort`

以上命令可正常返回目标结果，且不再出现权限报错。

## 复现记录

- `2026-04-13 06`：在仓库根目录搜索旧记忆目录时首次触发，随后通过缩小搜索范围验证规避方案有效。
- `2026-04-13 08`：在仓库根目录执行 `find . -name AGENTS.md -print | sort` 时再次命中 `./docker/volumes/postgres` 权限不足；随后改用 `rg --files -g 'AGENTS.md'` 直接完成目标搜索，避免进入受限卷目录。
- `2026-04-15 19`：在 `1flowse` 仓库中扫描相邻仓库 `../dify` 的 `AGENTS.md` 时，`find ../dify -path '*/AGENTS.md' ...` 命中 `../dify/docker/volumes/db/data/pgdata` 权限不足；后续应优先缩小到 `../dify/api ../dify/web` 这类真实目标目录，或对错误输出做重定向。
- `2026-04-17 18`：在仓库根目录执行 `find . -type f | rg 'config-sections-flattened|node-detail-config|flattened'` 时再次命中 `./docker/volumes/postgres` 与 `./docker/volumes/redis/appendonlydir` 权限不足；后续应优先缩小到 `.memory` 这类真实目标目录，或直接用 `rg --files` 避免进入受限卷。
