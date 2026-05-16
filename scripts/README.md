# 1flowbase Scripts

本目录收纳仓库级脚本。除特别说明外，命令都从仓库根目录执行。

## Runtime

- Node.js: `>=24.0.0`
- 前端依赖通过 `web/package.json` 管理，脚本内部需要前端工具时会从 `web/` 解析依赖。
- warning 与 coverage 产物统一写入 `tmp/test-governance/`。

## Dev Runtime

### `node scripts/node/dev-up.js [选项] [start|ensure|stop|status|restart]`

统一管理本地开发进程。默认动作是 `start`。

常用命令：

```bash
node scripts/node/dev-up.js
node scripts/node/dev-up.js --skip-docker
node scripts/node/dev-up.js restart --frontend-only
node scripts/node/dev-up.js restart --backend-only

node scripts/node/dev-up.js restart --frontend-only && node scripts/node/dev-up.js restart --backend-only

node scripts/node/dev-up.js status
node scripts/node/dev-up.js stop
```

说明：

- 默认管理前端、`api-server`、`plugin-runner`，并在全量动作下管理 `docker/docker-compose.middleware.yaml`。
- `--skip-docker` 只跳过 Docker 中间件，不影响前后端本地进程。
- `--frontend-only` 只管理前端。
- `--backend-only` 只管理 `api-server` 与 `plugin-runner`。
- 日志写入 `tmp/logs/`。
- pid 记录写入 `tmp/dev-up/pids/`。

## Test Scripts

### `node scripts/node/test.js <backend|contracts|frontend|scripts> [args]`

测试聚合入口。

```bash
node scripts/node/test.js backend
node scripts/node/test.js contracts
node scripts/node/test.js frontend fast
node scripts/node/test.js frontend full
node scripts/node/test.js scripts
```

### `node scripts/node/test-backend.js`

运行后端 Rust workspace 测试：

```bash
cargo test --workspace
```

实际并发参数由 `scripts/node/testing/verify-runtime.js` 的运行时配置控制。

### `node scripts/node/test-contracts.js`

运行跨消费者契约测试，当前聚焦模型供应商配置相关契约。

### `node scripts/node/test-frontend.js [fast|full]`

前端测试入口。

- `fast`: 运行 `web/app` 的快速测试，并写入 `tmp/test-governance/frontend-fast.log`。
- `full`: 运行前端 lint、workspace 测试、构建和样式边界检查。

`web/package.json` 中的 `test`、`test:fast`、`verify:full` 会调用该入口或相邻封装脚本。

### `node scripts/node/test-scripts.js [filter ...]`

运行 `scripts/node/**/_tests/*.js` 下的 Node 脚本测试。

```bash
node scripts/node/test-scripts.js
node scripts/node/test-scripts.js page-debug
node scripts/node/test-scripts.js verify-backend runtime-gate
```

## Verification Scripts

### `node scripts/node/verify.js <backend|ci|coverage|repo> [args]`

验证聚合入口。

```bash
node scripts/node/verify.js backend
node scripts/node/verify.js coverage all
node scripts/node/verify.js repo
node scripts/node/verify.js ci
```

### `node scripts/node/verify-backend.js`

后端完整门禁：

- `cargo fmt --all --check`
- `cargo clippy --workspace --all-targets -D warnings`
- `cargo test --workspace`
- `cargo check --workspace`

### `node scripts/node/verify-coverage.js [frontend|backend|all]`

仓库覆盖率门禁。覆盖率摘要写入 `tmp/test-governance/coverage-summary.log`，后端覆盖率需要本地安装 `cargo-llvm-cov`。

### `node scripts/node/verify-repo.js`

仓库级验证组合：

- 脚本测试
- 契约测试
- 前端 full gate
- 后端完整门禁

### `node scripts/node/verify-ci.js`

CI 组合入口，当前执行 `verify-repo` 与 `verify-coverage all`。

## Frontend Tooling

### `node scripts/node/check-style-boundary.js <component|page|file|all-pages> [target]`

检查样式影响边界。

```bash
node scripts/node/check-style-boundary.js component component.account-popup
node scripts/node/check-style-boundary.js page page.home
node scripts/node/check-style-boundary.js file web/app/src/styles/global.css
node scripts/node/check-style-boundary.js all-pages
```

脚本会按需确保前端开发服务可用，并通过 Playwright 读取样式边界场景。

### `node scripts/node/page-debug.js [snapshot|open|login] <route-or-url> [选项]`

页面调试和取证脚本。

```bash
node scripts/node/page-debug.js /workspace
node scripts/node/page-debug.js open /workspace --headless false
node scripts/node/page-debug.js login --account <account> --password <password>
```

默认产物写入 `tmp/page-debug/<timestamp>/`，包括截图、控制台日志、元数据和 DOM snapshot。

常用选项：

- `--web-base-url <url>`: 默认 `http://127.0.0.1:3100`
- `--api-base-url <url>`: 默认 `http://127.0.0.1:7800`
- `--out-dir <dir>`: 指定输出目录
- `--wait-for-selector <selector>`: 等待指定元素
- `--wait-for-url <url>`: 等待目标 URL

### `node scripts/node/runtime-gate.js <page-debug args>`

运行时页面检查入口，本质上是对 `page-debug` 的门禁封装。

## Workspace Tools

### `node scripts/node/mock-ui-sync.js [选项]`

从 `web/` 重建 mock UI 工作区。

```bash
node scripts/node/mock-ui-sync.js
node scripts/node/mock-ui-sync.js --source web --target tmp/mock-ui --port 3210
```

说明：

- 默认清空并重建 `tmp/mock-ui/`。
- 默认把 mock 副本前端端口改成 `3210`。
- 会排除 `node_modules`、`dist`、`coverage`、`.turbo`、`.vite`。

### `node scripts/node/claude-skill-sync.js [选项]`

将 `.agents/skills` 同步为 Claude 可识别的 `.claude/skills/<name>/SKILL.md` 结构。

```bash
node scripts/node/claude-skill-sync.js
node scripts/node/claude-skill-sync.js --source .agents/skills --target .claude/skills
```

### `node scripts/node/tooling.js <command> [args]`

工具聚合入口，支持：

- `check-style-boundary`
- `claude-skill-sync`
- `mock-ui-sync`
- `page-debug`
- `runtime-gate`

## Plugin CLI

### `node scripts/node/plugin.js <command> [options]`

宿主侧插件脚手架和打包工具。

```bash
node scripts/node/plugin.js init <plugin-path>
node scripts/node/plugin.js demo init <plugin-path>
node scripts/node/plugin.js demo dev <plugin-path> --port 4310
node scripts/node/plugin.js package <plugin-path> --out ./dist
```

说明：

- `init` 生成 model provider runtime extension 基础源码结构。
- `demo init` 在插件目录下生成本地 demo 页面和辅助脚本。
- `demo dev` 用 Node 内建静态服务启动 `demo/`，默认地址 `http://127.0.0.1:4310`。
- `package` 生成过滤 `demo/`、`scripts/`、`target/` 后的 `.1flowbasepkg` 安装产物，并返回 sha256 元数据。
- 可通过 `--runtime-binary`、`--target`、`--signing-key-pem-file`、`--signing-key-id`、`--issued-at` 写入 runtime binary 和官方签名元数据。

当前 demo dev 仍是本地 scaffold，不代表真实 `plugin-runner` debug runtime 已经打通。

## Artifact Cleanup

### `node scripts/node/clean-artifacts.js [profile] [--apply]`

查看或清理本地临时产物。默认 profile 是 `status`，只打印体积，不删除。

```bash
node scripts/node/clean-artifacts.js
node scripts/node/clean-artifacts.js light
node scripts/node/clean-artifacts.js light --apply
node scripts/node/clean-artifacts.js backend-cache --apply
node scripts/node/clean-artifacts.js all --apply
node scripts/node/clean-artifacts.js deep --apply
```

profile：

- `status`: 查看 `api/target`、coverage、前端构建和 `tmp` 目录体积。
- `light`: 清理前端构建缓存和运行态 `tmp` 目录。
- `backend-cache`: 清理 Cargo incremental、llvm-cov target 和 target/tmp，保留 debug/deps。
- `all`: 执行 `light + backend-cache`。
- `deep`: 清理 `light + api/target`，下一次后端编译会明显变慢。

## Runtime Helpers

- `scripts/node/exec-with-real-node.sh`: 从前端包脚本调用仓库 Node 脚本时，确保使用真实 Node runtime。
- `scripts/node/testing/*`: 脚本共享的运行时配置、warning capture、coverage threshold 和 Node runtime 解析工具。
