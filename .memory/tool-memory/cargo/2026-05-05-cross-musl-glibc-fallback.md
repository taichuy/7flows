---
memory_type: tool
topic: cross musl dry-run 因 glibc 版本不匹配失败时的 fallback
summary: `cross build --target x86_64-unknown-linux-musl` 可能因本地 cross 退回 host 或复用不兼容 build-script 产物而报 GLIBC 版本缺失；已验证可直接用 host `cargo build --target x86_64-unknown-linux-musl` 构建，再把该 target binary 传给 plugin package。
keywords:
  - cargo
  - cross
  - x86_64-unknown-linux-musl
  - GLIBC_2.34
  - plugin-package
match_when:
  - provider package dry-run 需要 musl target binary
  - `cross build` 报 `GLIBC_2.32`、`GLIBC_2.33`、`GLIBC_2.34` 或 `GLIBC_2.39` not found
  - `cross --version` 提示 falling back to `cargo` on the host
created_at: 2026-05-05 02
updated_at: 2026-05-05 02
last_verified_at: 2026-05-05 02
decision_policy: reference_on_failure
scope:
  - /home/taichu/git/1flowbase-official-plugins
  - runtime-extensions/model-providers/deepseek/Cargo.toml
  - scripts/node/plugin.js
---

# cross musl dry-run 因 glibc 版本不匹配失败时的 fallback

## 时间

`2026-05-05 02`

## 失败现象

在官方插件仓库执行：

```bash
cross build --manifest-path runtime-extensions/model-providers/deepseek/Cargo.toml --release --target x86_64-unknown-linux-musl
```

失败信息包含：

```text
version `GLIBC_2.32' not found
version `GLIBC_2.33' not found
version `GLIBC_2.34' not found
version `GLIBC_2.39' not found
```

同时 `cross --version` 输出里提示：

```text
[cross] note: Falling back to `cargo` on the host.
```

## 触发条件

- provider CI dry-run package 需要 `x86_64-unknown-linux-musl` target binary；
- 本地已经安装 `x86_64-unknown-linux-musl` rust target；
- 本地 `cross` 没有正常走容器隔离，而是退回 host cargo 或复用不兼容的 target build-script 产物。

## 根因

当前本地 `cross` 执行环境没有按 CI 的容器路径稳定构建 musl target，导致 build script 二进制与实际运行环境 glibc 版本不匹配。

## 解法

先确认本机已有 musl target：

```bash
rustup target list --installed
```

然后直接用 host cargo 构建 musl target：

```bash
cargo build --manifest-path runtime-extensions/model-providers/deepseek/Cargo.toml --release --target x86_64-unknown-linux-musl
```

再按 package CLI 要求显式传 target：

```bash
node /home/taichu/git/1flowbase/scripts/node/plugin.js package \
  runtime-extensions/model-providers/deepseek \
  --out dist \
  --runtime-binary runtime-extensions/model-providers/deepseek/target/x86_64-unknown-linux-musl/release/deepseek-provider \
  --target x86_64-unknown-linux-musl
```

## 验证方式

`2026-05-05 02` 已验证 host cargo target build 成功，package dry-run 生成：

```text
dist/1flowbase@deepseek@0.1.0@linux-amd64@1ca93539f1f894cdd4076b22618d34b4e576cee9a1c83f71ec5c41c5b411a3c3.1flowbasepkg
```

## 复现记录

- `2026-05-05 02`：DeepSeek provider package dry-run 时复现 `cross build` glibc 版本错误；改用 host `cargo build --target x86_64-unknown-linux-musl` 后，package dry-run 通过。
