---
memory_type: project
topic: 插件消费语义与执行方式需要分轴建模
summary: 用户于 `2026-04-20 00` 继续追问 `HostExtension`、`RuntimeExtension`、`CapabilityPlugin` 的区别，核心混淆点在于当前命名同时承载了“插件被谁消费/如何选用”和“插件代码怎么执行/如何回收”两层语义。基于当前代码与 spec，后续插件体系应把 `consumption kind` 与 `execution mode` 明确拆开建模：`HostExtension` 表示系统级宿主扩展，`RuntimeExtension` 表示挂到宿主 runtime slot 的运行时扩展，`CapabilityPlugin` 表示需显式选用的用户能力贡献；而 `in_process / process_per_call / warm_worker / declarative_only` 应作为另一条独立执行维度。用户在同日后续讨论中进一步修正：`HostExtension` 不再把“官方白名单”写死进类型，而改为由部署侧 `source allowlist + signature policy` 决定准入；`v1` 仅允许 `filesystem_dropin` 来源，且暂不考虑热卸载。第三方代码不应进入主进程热加载/热卸载路径，以避免 Rust 动态库 TLS/static unload 风险。
keywords:
  - host-extension
  - runtime-extension
  - capability-plugin
  - execution-mode
  - plugin-runner
  - lifecycle
  - canvas-node
match_when:
  - 继续讨论三类插件的区别与生命周期
  - 需要判断节点插件应归类为 runtime 还是 capability
  - 需要设计插件回收、热加载、进程边界
  - 需要避免 Rust so/dll unload 风险
created_at: 2026-04-20 00
updated_at: 2026-04-20 22
last_verified_at: 2026-04-20 22
decision_policy: verify_before_decision
scope:
  - api/apps/plugin-runner/src/provider_host.rs
  - api/apps/plugin-runner/src/stdio_runtime.rs
  - api/crates/plugin-framework/src/assignment.rs
  - api/crates/runtime-core/src/resource_registry.rs
  - docs/superpowers/specs/1flowbase/modules/08-plugin-framework/README.md
---

# 插件消费语义与执行方式需要分轴建模

## 时间

`2026-04-20 00`

## 谁在做什么

- 用户正在收口 `1flowbase` 插件体系初期必须定好的分类、生命周期和回收边界。
- AI 基于当前代码与已有 spec，对三类插件语义和执行方式做分轴澄清。

## 为什么这样做

- 当前 `HostExtension / RuntimeExtension / CapabilityPlugin` 更像“消费语义”，不是完整的“进程模型”。
- 如果不单独补 `execution mode`，后续讨论节点插件、provider 插件和宿主扩展时会不断混淆“谁来选用”和“谁来执行/何时回收”。

## 为什么要做

- 这会直接影响安装启用、assignment、block selector、plugin-runner、热加载、版本切换和安全边界。
- 也是避免重走 Rust 进程内热卸载动态库问题的关键约束。

## 截止日期

- 无

## 当前评估结论

- `RuntimeExtension` 当前代码语义是：必须绑定到 `workspace` 或 `model`，并挂到宿主预定义 runtime slot。
- `CapabilityPlugin` 当前代码语义是：需要显式选中后才生效，适合画布节点、工具、触发器这类用户能力贡献。
- `HostExtension` 当前 spec 语义是：系统级扩展，可参与宿主级资源暴露；但当前仓库尚未实现正式 loader。
- 当前 provider `RuntimeExtension` 的真实执行方式并不是常驻子进程，而是 `plugin-runner` 先缓存 package，再在每次 `validate / list_models / invoke` 时临时拉起独立可执行文件，执行完成即退出。
- 因此“是否 in-process / 是否常驻子进程 / 是否需要回收 worker”不应继续塞进 `consumption kind` 里，而应新增独立 `execution mode` 维度。
- 初期建议的执行维度至少包含：
  - `in_process`
  - `process_per_call`
  - `warm_worker`
  - `declarative_only`
- 初期安全红线应固定为：
  - 第三方代码插件不进入主进程热加载/热卸载路径
  - `HostExtension` 若存在，应按宿主启动生命周期加载，不做热卸载
  - `HostExtension` 的来源准入不写死为“官方白名单”，而由部署侧 `source allowlist + signature policy` 控制
  - `HostExtension` `v1` 只允许 `filesystem_dropin`
  - 第三方可执行插件一律走 `plugin-runner` 进程外执行

## 用户确认

- 用户已确认接受：
  - `HostExtension` 不再把“官方白名单”写死进类型
  - `HostExtension` 准入改为部署侧 `source allowlist + signature policy`
  - `HostExtension` `v1` 只允许 `filesystem_dropin`
  - 初期暂不考虑热卸载
