# 2026-03-16 sandbox 协议与文档边界对齐

## 背景

- 最近几轮 execution 相关实现已经形成了 `RuntimeExecutionAdapterRegistry`、ToolGateway execution-aware dispatch、compat adapter capability guard 与 host-side honest fallback 的主链。
- 用户进一步收敛了 sandbox 的产品表达：社区 / 开源默认继续轻执行，不把默认沙箱作为硬前置；但 sandbox 协议、能力声明和扩展接入点必须默认开放。
- 同时需要把几个容易漂移的点写清楚：高风险强隔离路径的 `fail-closed`、sandbox backend 与 compat adapter 的职责分离，以及企业第三方依赖细节不要直接污染核心 IR。

## 目标

- 让 AGENTS、产品/技术基线、开源/商业策略、当前事实索引、README 和高频 skill 使用同一套 sandbox 术语。
- 避免后续把“目标设计中的 sandbox backend 协议”误写成“当前代码已完整落地”。
- 给后续 backend/frontend 的实现、review 和 testing 都加上默认检查项，减少执行边界继续跑偏。

## 决策

### 1. 明确 `OSS / Community` 默认轻执行

- 社区 / 开源默认继续保持 `worker-first`，普通 workflow 节点不把 sandbox 当作开箱前提。
- sandbox 协议、能力声明和接入点默认开放，便于官方、社区和企业沿统一 contract 扩展。

### 2. 强隔离路径目标上采用 `fail-closed`

- 对 `sandbox_code`、高风险 `tool/plugin` 或显式要求受控 `sandbox / microvm` 的路径，目标设计上要求：如果没有兼容且健康的 sandbox backend，就应 blocked / unavailable。
- 不能把“目标上需要强隔离”的路径静默回退成宿主轻执行，再假装风险等级没有变化。

### 3. sandbox backend 与 compat adapter 分层

- compat adapter 负责外部生态桥接。
- sandbox backend 负责隔离执行。
- 两者的注册、health、capability 形态可以相似，但不能混成同一种运行时对象。

### 4. 企业依赖细节不直接进入核心 IR

- 7Flows core 只需要理解最小 sandbox contract，例如 `profile`、`language`、运行时限制、依赖引用和 capability 声明。
- 镜像、挂载、私有 registry、wheelhouse、bundle 安装等细节，优先留在 backend/profile/admin 扩展中。
- 官方默认 / reference backend 若存在，只维护少量官方受控 builtin package set，不承担企业第三方依赖环境维护。

## 影响范围

- `AGENTS.md`
- `docs/dev/user-preferences.md`
- `docs/product-design.md`
- `docs/technical-design-supplement.md`
- `docs/open-source-commercial-strategy.md`
- `docs/dev/runtime-foundation.md`
- `README.md`
- `docs/README.md`
- `docs/dev/README.md`
- `docker/README.md`
- `services/compat-dify/README.md`
- `.agents/skills/backend-code-review/SKILL.md`
- `.agents/skills/backend-testing/SKILL.md`
- `.agents/skills/frontend-code-review/SKILL.md`
- `.agents/skills/frontend-testing/SKILL.md`

## 验证

- 本轮为文档 / skill / README 对齐，没有修改运行时代码或前端逻辑。
- 计划验证：
  - `git diff --check`
  - 复核 README / skill 索引和新术语引用是否一致

## 下一步

1. 先把独立的 `SandboxBackendRegistration / SandboxExecution` 协议设计和最小实现落到代码，而不是继续让 host subprocess 承担正式产品路径。
2. 把高风险 `tool/plugin` 与 `sandbox_code` 收口到统一 sandbox backend 主链，并在缺失 backend 时形成 capability-driven 的 blocked / unavailable 语义。
3. 再把 editor / diagnostics 的 capability 表达补成“默认轻执行 + backend capability + 强隔离 unavailable”三态一致的前后端体验。
