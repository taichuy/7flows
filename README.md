# 1flowbase

## Repo Layout

- `web/`: 前端根目录，`pnpm + Turbo` workspace，应用入口在 `web/app`，共享包在 `web/packages/*`
- `api/`: 后端根目录，Rust workspace，服务入口在 `api/apps/*`，共享 crate 在 `api/crates/*`
- `docker/`: 本地中间件与容器编排

前端命令在 `web/` 下执行，后端命令在 `api/` 下执行，不再把对应工具链放在仓库根目录。

## Bootstrap Quick Start

### Unified Dev Script

```bash
node scripts/node/dev-up.js
```

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

- 默认全量管理前端、`api-server`、`plugin-runner`，并在全量动作下管理 `docker/docker-compose.middleware.yaml`
- `--skip-docker` 只跳过 Docker 中间件，不影响前后端本地进程
- `--frontend-only` 只管理前端
- `--backend-only` 只管理 `api-server` 与 `plugin-runner`
- 日志写入 `tmp/logs/`
- pid 记录写入 `tmp/dev-up/pids/`

### Frontend

```bash
cd web
pnpm install
pnpm dev
```

前端默认监听 `0.0.0.0:3100`，可通过本机或局域网地址访问。

### Mock UI Sandbox

```bash
node scripts/node/mock-ui-sync.js
```

该命令会先清空 `tmp/mock-ui/`，再把 `web/` 重建到这里，并把 mock 副本的前端默认端口改成 `3210`。

### Plugin CLI Scaffold

```bash
node scripts/node/plugin.js --help
```

当前主仓内已提供第一版宿主侧 `plugin CLI`，用于生成 provider 插件源码骨架和本地 demo scaffold。

常用命令：

```bash
node scripts/node/plugin.js init <plugin-path>
node scripts/node/plugin.js demo init <plugin-path>
node scripts/node/plugin.js demo dev <plugin-path> --port 4310
```

说明：

- `plugin init` 生成 `manifest.yaml`、`provider/`、`models/llm/`、`i18n/`、`readme/`、`demo/`、`scripts/` 等基础结构
- `plugin demo init` 生成本地静态 demo 页面和示例 runner 配置文件
- `plugin demo dev` 用 Node 内建静态服务启动 `demo/`，默认地址为 `http://127.0.0.1:4310`
- 当前 `demo dev` 仍是本地 scaffold，不代表真实 `plugin-runner` debug runtime 已经打通；页面只预留 runner URL 配置位和后续接线边界

### Backend

```bash
cd api
cargo run -p api-server --bin api-server
cargo run -p plugin-runner --bin plugin-runner
```

如果使用 `node scripts/node/dev-up.js`，脚本会在首次启动时自动从 `api/apps/api-server/.env.example` 生成本地 `.env`。
如果直接执行 `cargo run`，请先自行准备 `api/apps/api-server/.env`。

后端默认地址：

- `api-server`: `0.0.0.0:7800`
- `plugin-runner`: `0.0.0.0:7801`

### Middleware

```bash
docker compose -f docker/docker-compose.middleware.yaml up -d
```

## Verification

### Repository

```bash
node scripts/node/test-scripts.js
node scripts/node/test-scripts.js page-debug
node scripts/node/verify-repo.js
```

说明：

- `node scripts/node/test-scripts.js` 统一执行 `scripts/node/**/_tests/*.js`。
- `node scripts/node/test-scripts.js <filter>` 支持按脚本路径片段做 targeted fast run，例如 `page-debug`、`verify-backend`。
- `node scripts/node/verify-repo.js` 是仓库级 full gate，会依次执行 `scripts/node` 测试、前端 `full` 门禁和后端 `verify-backend`。

### Coverage

```bash
node scripts/node/verify-coverage.js frontend
node scripts/node/verify-coverage.js backend
node scripts/node/verify-coverage.js all
```

说明：

- `frontend` 只执行前端 coverage gate，并校验 `agent-flow` 与 `settings` 高风险路径阈值。
- `backend` 只执行后端 coverage gate，并校验 `control-plane`、`storage-pg` 与 `api-server` 的行覆盖率阈值。
- `all` 顺序执行前后端 coverage gate，并统一输出覆盖率门禁结果。

### Frontend

```bash
node scripts/node/test-frontend.js fast
node scripts/node/test-frontend.js full
```

说明：

- `fast` 只跑前端快速验证，当前固定为 `web/app` 的 Vitest。
- `full` 跑前端全量质量门禁：`lint + full vitest + build + style-boundary`。
- 前端 package 也暴露了等价入口：`pnpm --dir web test:fast`、`pnpm --dir web verify:full`。

### Backend

```bash
node scripts/node/test-backend.js
node scripts/node/verify-backend.js
```

说明：

- `node scripts/node/test-backend.js` 是后端纯测试入口，只执行 `cargo test`。
- `node scripts/node/verify-backend.js` 是后端全量质量门禁，会执行格式化、静态检查、测试和 `check`，并默认把 `cargo` 并发限制在当前系统可用 CPU 的一半，避免全量验证时把机器资源打满。

### CI

```bash
node scripts/node/verify-ci.js
```

说明：

- `node scripts/node/verify-ci.js` 会按顺序执行 `verify-repo` 和 `verify-coverage all`，作为仓库自有的 CI 总入口。
- GitHub Actions `verify` workflow 只负责准备 Node、pnpm、Rust 与 `cargo-llvm-cov`，实际 lint / test / coverage 逻辑统一委托给仓库脚本。

### Runtime Gate

```bash
node scripts/node/runtime-gate.js snapshot /
```

说明：

- `runtime-gate` 当前统一代理到 `page-debug`，用于 release 或 nightly 级运行态烟测。
- 当前阶段 warning 不阻塞门禁；命令输出中的 warning 会统一落到 `tmp/test-governance/` 供后续治理。

## Local URLs

- Web: `http://127.0.0.1:3100` 或 `http://<本机IP>:3100`
- API Health: `http://127.0.0.1:7800/health` 或 `http://<本机IP>:7800/health`
- Console Health: `http://127.0.0.1:7800/api/console/health` 或 `http://<本机IP>:7800/api/console/health`
- OpenAPI JSON: `http://127.0.0.1:7800/openapi.json` 或 `http://<本机IP>:7800/openapi.json`
- API Docs: `http://127.0.0.1:7800/docs` 或 `http://<本机IP>:7800/docs`
- Plugin Runner Health: `http://127.0.0.1:7801/health` 或 `http://<本机IP>:7801/health`
