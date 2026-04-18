---
memory_type: project
topic: 模型供应商接入计划前 3 个后端任务已落地完成
summary: `docs/superpowers/plans/2026-04-18-model-provider-integration.md` 已在 `2026-04-18 13` 完成 Task 1-3；当前仓库已具备 provider package/runtime contract、`plugin-runner` 最小 provider host，以及 `plugin_installations / plugin_assignments / plugin_tasks / model_provider_instances / model_provider_instance_secrets / provider_instance_model_catalog_cache` 的持久化基础。
keywords:
  - model-provider
  - plugin-framework
  - plugin-runner
  - storage-pg
  - api-server-config
  - tasks-1-3
  - implemented
match_when:
  - 需要继续执行模型供应商接入计划的 Task 4 以后内容
  - 需要确认 provider contract、runner host 和持久化底座是否已经落地
  - 需要确认当前已经通过哪些后端验证
created_at: 2026-04-18 13
updated_at: 2026-04-18 13
last_verified_at: 2026-04-18 13
decision_policy: verify_before_decision
scope:
  - docs/superpowers/plans/2026-04-18-model-provider-integration.md
  - api/crates/plugin-framework
  - api/apps/plugin-runner
  - api/crates/domain/src/model_provider.rs
  - api/crates/control-plane/src/ports.rs
  - api/crates/storage-pg/src/plugin_repository.rs
  - api/crates/storage-pg/src/model_provider_repository.rs
  - api/crates/storage-pg/migrations/20260418120000_create_provider_kernel_tables.sql
  - api/crates/storage-pg/migrations/20260418123000_create_model_provider_instance_tables.sql
  - api/apps/api-server/src/config.rs
---

# 模型供应商接入计划前 3 个后端任务已落地完成

## 时间

`2026-04-18 13`

## 谁在做什么

- AI 按 `2026-04-18-model-provider-integration.md` 已完成 Task 1、Task 2、Task 3，并同步回填计划勾选状态。
- 用户明确要求在当前会话里直接执行既有计划，不重新回到 design/spec 讨论。

## 为什么这样做

- 这一轮先把后端 contract、runner host 和持久化底座做实，后续控制面 service、route、运行时消费和前端页面才能直接站在稳定 contract 上继续推进。
- 如果在 Task 1-3 前就提前做控制面或前端，会把状态和协议形状分散到多个层次，后面返工成本会明显增大。

## 为什么要做

- 让 provider plugin 从“有 CLI 骨架和设计文档”推进到“宿主能识别 package、能最小调用 runtime、能把 installation/instance/secret 真正持久化”。
- 为 Task 4 之后的 catalog、实例管理、validate、models/options、编译期校验和 `openai_compatible` 参考插件提供稳定底座。

## 截止日期

- 无

## 决策背后动机

- 本轮已完成：
  - `plugin-framework` 中的 provider package 解析、`static / dynamic / hybrid` 发现模式、标准事件/usage/错误类型、`i18n` 默认回退和 `manifest` 唯一标识
  - `plugin-runner` 的 `load / reload / validate / list-models / invoke-stream` 五个入口，以及拒绝直接加载源码根目录的包加载器
  - `domain / control-plane ports / storage-pg / api-server config` 中的 installation、assignment、task、instance、catalog cache、encrypted secret 基础对象与仓储接口
  - provider secret 主密钥配置入口 `API_PROVIDER_SECRET_MASTER_KEY`
- 持久化层当前用仓储内置的最小加密封装保存 secret JSON，避免把明文 secret 混进普通 metadata 或普通实例记录。
- 当前已通过的验证：
  - `cd api && cargo test -p plugin-framework`
  - `cd api && cargo test -p plugin-runner`
  - `cd api && cargo test -p storage-pg plugin_repository_tests`
  - `cd api && cargo test -p storage-pg model_provider_repository_tests`
  - `cd api && cargo test -p api-server config_tests`
  - `git diff --check -- api/apps/plugin-runner api/crates/plugin-framework docs/superpowers/plans/2026-04-18-model-provider-integration.md`

## 关联文档

- `docs/superpowers/plans/2026-04-18-model-provider-integration.md`
- `.memory/project-memory/2026-04-18-model-provider-integration-plan-stage.md`
