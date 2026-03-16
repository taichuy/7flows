# 2026-03-16 开源默认轻执行与 Sandbox 扩展方向

## 背景

- 当前 runtime 已经形成 `RuntimeExecutionAdapterRegistry + ToolGateway execution-aware dispatch + compat adapter capability guard` 的主链，但真实 `sandbox / microvm` 执行体仍在推进中。
- 仓库现状已经明确不走“所有节点默认重沙箱化”，同时 `sandbox_code` 在 editor / persistence 层仍保持 `planned`，避免把 MVP 预研执行链误写成正式产品能力。
- 本轮用户进一步收敛了社区版默认体验：普通 workflow 节点继续轻执行，高风险节点再隔离执行；代码节点可以有受控的默认能力，但不把任意依赖安装变成默认沙箱职责。

## 目标

- 明确“工作流运行节点”和“不可信代码执行节点”的职责边界。
- 把社区 / 开源默认形态收敛为 `worker-first`、可扩展的执行架构，而不是要求所有部署先配齐默认沙箱。
- 为 `sandbox_code` 与高风险 `tool/plugin` 的统一 `SandboxAdapter` 演进补充更清晰的默认能力边界。

## 决策

### 1. 社区版默认继续走轻执行主链

- 普通 workflow 节点默认仍在 worker / 进程内执行，保持更接近 n8n / Dify 主流实践的 lightweight orchestration 体验。
- sandbox 继续保留为高风险节点和可选扩展能力，而不是社区版默认的硬前置部署要求。

### 2. Sandbox 继续按高风险节点聚焦

- `sandbox_code`、高风险 `tool`、高风险 `plugin script`、浏览器 / 文件写入等能力，后续优先收口到统一 `SandboxAdapter`。
- 这条 adapter 主链允许后续接不同后端，例如现有 Docker sandbox、未来的 OpenSandbox provider、甚至更强隔离池，但不反向改变 `7Flows IR` 或 workflow orchestration ownership。

### 3. 代码节点默认能力保持受控

- JS / Python 代码节点首轮只开放一组仓库维护的常用内置依赖，避免把任意依赖安装、任意系统环境漂移和供应链风险直接带入默认 OSS 体验。
- 更重的自定义依赖、长期环境维护、特殊系统库和复杂运行时，优先通过插件、自定义节点或用户自建 sandbox backend 解决。

## 影响范围

- `docs/dev/user-preferences.md`
- `docs/dev/runtime-foundation.md`
- 后续 `sandbox_code` / `SandboxAdapter` 设计
- ToolGateway 高风险执行路径与 compat plugin execution boundary
- 社区版默认部署说明与 editor capability 表达

## 验证

- 本轮为方向收敛与文档同步，无代码变更，未新增自动化测试。
- 相关实现事实仍以当前 runtime 与既有 execution/sandbox 测试为准。

## 下一步

1. 先把 `sandbox_code` 从 host-subprocess MVP 升级为真实可替换的 sandbox backend，而不是继续把宿主子进程当默认正式路径。
2. 让高风险 `tool/plugin` 复用同一条 `SandboxAdapter`，避免 `sandbox_code` 独占隔离主链。
3. 在默认 code sandbox 稳定前，继续保持“受控内置依赖 + 重依赖走插件 / 自定义节点”的边界，不提前开放任意依赖安装。
