# 2026-04-10 后端/插件/部署设计冲突复核

- 对照现有 `userDocs`、模块设计稿与架构稿复核后，当前大方向兼容：P1 仍是 `Rust 模块化单体 api-server + 独立 plugin-runner + PostgreSQL + Redis + RustFS + Docker Compose`，运行时保留 `worker pool + recovery loop + callback requeue` 但不拆独立 `runtime-worker`。
- 直接冲突 1：控制台鉴权。较早文档仍写“参考 `Dify` 的 `Cookie Token(access/refresh/csrf)`”，但后续已确认 `服务端 Session + HttpOnly Cookie`，需以后者为正式基线并清理残留表述。
- 直接冲突 2：正式架构稿未把 `plugin-runner` 纳入总体部署与 Rust workspace 主结构，和插件模块已确认的“独立共享 runner”不一致。
- 直接冲突 3：插件宿主通信边界。插件模块已固定为 `local RPC`，但新设计草案中出现“本机 RPC/内网 HTTP + 固定密钥”表述，需明确 P1 主通道只保留一种。
- 表述冲突 4：代码插件语言边界。现有决策是 `Rust + Wasm`；新草案写法更像“只要求 `runner_wasm` 产物”，是否放宽为多语言编译到 Wasm 仍待明确。
- 建议：P1 继续采用 `服务端 Session`、`api-server <-> plugin-runner` 单一 RPC 主通道、代码插件先锁 `Rust + Wasm`；若未来要支持远程 runner / HTTP / 多语言 Wasm，再作为 P2 演进项单列。
