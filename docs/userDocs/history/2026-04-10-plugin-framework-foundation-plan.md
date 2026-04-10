# 2026-04-10 08 插件体系实现顺序

- `08` 已从讨论定稿切换到实施计划阶段。
- 当前不建议直接铺完整插件系统实现，而是拆为三段：
  - 插件后端基础
  - 控制面 API 与后台入口
  - 运行时与发布链路集成
- 首份实施计划已写入 `docs/superpowers/plans/2026-04-10-plugin-framework-foundation.md`。
- 第一阶段目标是先建立 Rust workspace 与 `plugin-framework` crate，并完成：
  - `manifest/schema` 校验
  - 生命周期与风险来源启用策略
  - 本机 `plugin-runner` RPC 契约
  - 团队安装与应用分配模型
