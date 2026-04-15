---
memory_type: tool
topic: 在仓库根直接用 find 扫描会命中 docker/volumes 权限目录
summary: 在 `1flowse` 仓库根执行未限域的 `find . ...` 时，可能命中 `docker/volumes/postgres`、`docker/volumes/redis/appendonlydir` 并报 `权限不够`；已验证应优先改用 `rg --files`，或在 `find` 中显式 prune 掉 `docker/volumes`。
keywords:
  - shell
  - find
  - docker
  - permission
  - rg
match_when:
  - 需要从仓库根批量查文件或目录
  - `find .` 输出包含 `权限不够`
  - 命中 `docker/volumes/postgres` 或 `docker/volumes/redis/appendonlydir`
created_at: 2026-04-15 10
updated_at: 2026-04-15 10
last_verified_at: 2026-04-15 10
decision_policy: reference_on_failure
scope:
  - shell
  - docker/volumes
  - repository root
---

# 在仓库根直接用 find 扫描会命中 docker/volumes 权限目录

## 时间

`2026-04-15 10`

## 失败现象

执行未限域的仓库根扫描命令时，终端会出现：

- `find: ‘./docker/volumes/postgres’: 权限不够`
- `find: ‘./docker/volumes/redis/appendonlydir’: 权限不够`

## 触发条件

- 在仓库根直接执行 `find . ...`
- 没有先把搜索范围收敛到目标子目录
- 没有排除 `docker/volumes`

## 根因

仓库内存在本地容器数据卷目录，当前 shell 对其中部分子目录没有读取权限；`find` 从根开始递归时会把这些目录也扫进去。

## 解法

- 优先使用 `rg --files <target-dir>` 代替仓库根 `find .`
- 如果必须用 `find`，显式排除数据卷目录，例如：

```bash
find . -path './docker/volumes' -prune -o -name 'AGENTS.md' -print
```

## 验证方式

- 改为 `rg --files web .memory` 或带 `-prune` 的 `find` 后，不再出现权限报错。

## 复现记录

- `2026-04-15 10`：为定位 Scalar 相关文件和依赖安装路径，在仓库根直接执行 `find .`，命中 `docker/volumes` 权限目录；随后改为限域搜索恢复正常。
