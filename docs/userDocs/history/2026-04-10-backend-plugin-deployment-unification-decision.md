# 2026-04-10 后端/插件/部署统一口径决策

- 控制台鉴权正式基线采用 `服务端 Session + HttpOnly Cookie + CSRF`；此前提到的 `Dify Cookie Token(access/refresh/csrf)` 仅作为安全设计参考，不作为我方正式实现。
- `plugin-runner` 仍属于 Rust 后端体系的一部分，但它不是对外主业务单体；更准确的表述应为：`一个对外主入口 api-server + 一个仅内网可达的 plugin-runner 内部执行进程`。
- 因此“系统对外还是一个后端入口”和“系统内部存在 RPC”并不冲突。RPC 是否成立取决于是否跨进程，而不是是否跨机器。
- P1 对 `api-server -> plugin-runner` 的正式表述统一为：`内部 RPC 契约`；初版传输承载可采用 `内网 HTTP`。若未来部署演进，再按需要替换为其他传输方式，但契约层不变。
- P1 不再回到“插件进程内直接函数调用”路线，否则 `plugin-runner` 的隔离、热加载、超时治理、健康检查与崩溃隔离价值会明显下降。
- P1 代码插件运行模式保持 `runner_wasm`；官方支持语言先锁 `Rust`，不在当前阶段放宽为任意可编译到 Wasm 的多语言生态。
