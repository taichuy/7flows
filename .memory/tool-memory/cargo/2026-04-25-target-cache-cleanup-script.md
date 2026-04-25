---
memory_type: tool
topic: Rust workspace target 目录膨胀时使用清理脚本
summary: 本仓库 `api/target` 可能因 workspace test/debug、incremental 和 llvm-cov 产物膨胀到数十 GiB；已新增 `scripts/node/clean-artifacts.js` 做状态查看与分层清理。
keywords:
  - cargo target
  - api/target
  - incremental
  - llvm-cov-target
  - clean-artifacts
match_when:
  - `api/target` 膨胀到数十 GiB
  - 需要清理 Rust 编译缓存但保留部分回归速度
  - 需要查看编译临时产物体积
created_at: 2026-04-25 20
updated_at: 2026-04-25 20
last_verified_at: 2026-04-25 20
decision_policy: reference_on_failure
scope:
  - cargo
  - api/target
  - scripts/node/clean-artifacts.js
---

# Rust workspace target 目录膨胀时使用清理脚本

## 失败现象

本仓库后端频繁运行 `cargo test --workspace`、`cargo clippy --all-targets`、`cargo llvm-cov` 后，`api/target` 会持续膨胀。2026-04-25 实测主要来源：

- `api/target/debug/deps`
- `api/target/debug/incremental`
- `api/target/llvm-cov-target`

## 根因

Cargo 不会自动 GC 旧 test/debug/hash 产物；workspace 级测试、clippy 和 coverage 会叠加多套产物。脚本门禁虽对部分命令设置 `CARGO_INCREMENTAL=0`，但不会删除历史 incremental 缓存。

## 解法

使用仓库脚本：

```bash
node scripts/node/clean-artifacts.js status
node scripts/node/clean-artifacts.js backend-cache
node scripts/node/clean-artifacts.js backend-cache --apply
```

profile 选择：

- `backend-cache`：清 `api/target/debug/incremental`、`api/target/llvm-cov-target`、`api/target/tmp`，保留 `debug/deps`，兼顾瘦身与回归速度。
- `deep`：清 `api/target`，回收最多，但下一轮后端编译明显变慢。

## 验证方式

```bash
PATH=/home/taichu/.nvm/versions/node/v22.12.0/bin:$PATH node scripts/node/test-scripts.js clean-artifacts
```

2026-04-25 验证：新增 4 个脚本测试通过。
