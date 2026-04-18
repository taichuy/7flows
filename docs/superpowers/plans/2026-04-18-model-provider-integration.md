# Model Provider Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在主仓库内把模型供应商接入从“设计已确认、CLI 脚手架已存在”推进到第一版可执行闭环：宿主具备 provider plugin 产物安装与分配、workspace 级 provider instance 配置与模型发现、`plugin-runner` 最小 provider runtime host、`openai_compatible` 官方参考插件，以及 `Settings / 模型供应商` 与 `agentFlow LLM` 节点的真实消费链路。

**Architecture:** 这轮固定按“后端先落、前端后跟”的顺序推进。后端先把 `plugin-framework -> plugin-runner -> control-plane -> storage-pg -> api-server -> orchestration-runtime` 的 contract、状态流转、安装任务、模型发现、调用事件与编译期校验收口，再初始化 `../1flowbase-official-plugins/models/openai_compatible` 参考插件。前端页面在后端 options / schema / validate / models / runtime contract 稳定后再接入 `Settings` 与 `LlmModelField`，并在前端任务完成时同步维护文件索引，方便后续继续调整页面时快速定位 owner 文件。

**Tech Stack:** Rust workspace (`plugin-framework`, `control-plane`, `storage-pg`, `orchestration-runtime`, `plugin-runner`, `api-server`), PostgreSQL, `sqlx`, `axum`, React 19, TypeScript, TanStack Query, Ant Design 5, existing `@1flowbase/api-client`, Node-based `plugin CLI`, sibling repo `../1flowbase-official-plugins`

**Source Spec:** `docs/superpowers/specs/1flowbase/2026-04-18-model-provider-integration-design.md`, `docs/superpowers/specs/1flowbase/modules/08-plugin-framework/README.md`, `docs/superpowers/specs/1flowbase/modules/05-runtime-orchestration/README.md`

**Execution Note:** 本计划固定先做 Task 1-6 的后端与参考插件，再做 Task 7-8 的前端页面与节点编辑器；不要把前端选择器提前到后端 options / validate / models contract 之前。前端任务每完成一个阶段，都要同步更新本文末尾的“Frontend File Index”，写明文件负责什么、这一轮具体改了什么，避免后续页面二次调整时重新摸路径。

**Out Of Scope:** 多家官方 provider 一次性交付、embedding / moderation / speech 闭环、成本计费看板、完整 marketplace UI、灰度升级策略、任意第三方语言构建平台、真实 `demo dev` 可视化 debug 控制台

---

## File Structure

### Backend: provider contract, runner host, control plane

- Create: `api/crates/plugin-framework/src/error.rs`
  - 统一 provider plugin 产物校验、contract 解析和运行时错误类型。
- Create: `api/crates/plugin-framework/src/provider_contract.rs`
  - 定义 model discovery、标准输入、流事件、最终输出、能力声明、错误语义。
- Create: `api/crates/plugin-framework/src/provider_package.rs`
  - 解析 provider plugin 产物中的 `manifest / provider schema / models / i18n / readme`。
- Create: `api/crates/plugin-framework/src/installation.rs`
  - 表达 installation、assignment、task、catalog cache 的状态对象。
- Modify: `api/crates/plugin-framework/src/lib.rs`
- Create: `api/crates/plugin-framework/src/_tests/provider_contract_tests.rs`
- Create: `api/crates/plugin-framework/src/_tests/provider_package_tests.rs`
- Modify: `api/crates/plugin-framework/src/_tests/mod.rs`
- Create: `api/apps/plugin-runner/src/provider_host.rs`
  - 本地 package `load / reload / validate / list_models / invoke_stream` 宿主。
- Create: `api/apps/plugin-runner/src/package_loader.rs`
  - 包路径校验、入口解析和最小沙箱化加载适配。
- Modify: `api/apps/plugin-runner/src/lib.rs`
- Create: `api/apps/plugin-runner/tests/provider_runtime_routes.rs`

### Backend: persistence, service, route, compile/runtime

- Create: `api/crates/domain/src/model_provider.rs`
  - provider installation、task、instance、model option、catalog cache 领域对象。
- Modify: `api/crates/domain/src/lib.rs`
- Create: `api/crates/control-plane/src/plugin_management.rs`
  - 安装、启用、分配、任务查询 service。
- Create: `api/crates/control-plane/src/model_provider.rs`
  - provider catalog、instance CRUD、validate、models、options service。
- Modify: `api/crates/control-plane/src/lib.rs`
- Modify: `api/crates/control-plane/src/ports.rs`
- Create: `api/crates/control-plane/src/_tests/plugin_management_service_tests.rs`
- Create: `api/crates/control-plane/src/_tests/model_provider_service_tests.rs`
- Modify: `api/crates/control-plane/src/_tests/mod.rs`
- Create: `api/crates/storage-pg/migrations/20260418120000_create_provider_kernel_tables.sql`
- Create: `api/crates/storage-pg/migrations/20260418123000_create_model_provider_instance_tables.sql`
- Create: `api/crates/storage-pg/src/plugin_repository.rs`
- Create: `api/crates/storage-pg/src/model_provider_repository.rs`
- Create: `api/crates/storage-pg/src/mappers/plugin_mapper.rs`
- Create: `api/crates/storage-pg/src/mappers/model_provider_mapper.rs`
- Modify: `api/crates/storage-pg/src/lib.rs`
- Modify: `api/crates/storage-pg/src/mappers/mod.rs`
- Create: `api/crates/storage-pg/src/_tests/plugin_repository_tests.rs`
- Create: `api/crates/storage-pg/src/_tests/model_provider_repository_tests.rs`
- Modify: `api/crates/storage-pg/src/_tests/mod.rs`
- Create: `api/apps/api-server/src/routes/plugins.rs`
- Create: `api/apps/api-server/src/routes/model_providers.rs`
- Modify: `api/apps/api-server/src/routes/mod.rs`
- Modify: `api/apps/api-server/src/openapi.rs`
- Modify: `api/apps/api-server/src/lib.rs`
- Modify: `api/apps/api-server/src/config.rs`
- Create: `api/apps/api-server/src/_tests/plugin_routes.rs`
- Create: `api/apps/api-server/src/_tests/model_provider_routes.rs`
- Modify: `api/apps/api-server/src/_tests/mod.rs`
- Modify: `api/crates/orchestration-runtime/src/compiled_plan.rs`
- Modify: `api/crates/orchestration-runtime/src/compiler.rs`
- Modify: `api/crates/orchestration-runtime/src/execution_engine.rs`
- Modify: `api/crates/orchestration-runtime/src/preview_executor.rs`
- Modify: `api/crates/control-plane/src/orchestration_runtime.rs`
- Modify: `api/crates/domain/src/flow.rs`

### Reference plugin and frontend

- Create: `../1flowbase-official-plugins/models/openai_compatible/manifest.yaml`
- Create: `../1flowbase-official-plugins/models/openai_compatible/provider/openai_compatible.yaml`
- Create: `../1flowbase-official-plugins/models/openai_compatible/provider/openai_compatible.js`
- Create: `../1flowbase-official-plugins/models/openai_compatible/models/llm/_position.yaml`
- Create: `../1flowbase-official-plugins/models/openai_compatible/models/llm/openai_compatible_chat.yaml`
- Create: `../1flowbase-official-plugins/models/openai_compatible/i18n/en_US.json`
- Create: `../1flowbase-official-plugins/models/openai_compatible/_assets/.gitkeep`
- Create: `../1flowbase-official-plugins/models/openai_compatible/i18n/zh_Hans.json`
- Create: `../1flowbase-official-plugins/models/openai_compatible/readme/README_en_US.md`
- Create: `../1flowbase-official-plugins/models/openai_compatible/demo/index.html`
- Create: `../1flowbase-official-plugins/models/openai_compatible/demo/styles.css`
- Create: `../1flowbase-official-plugins/models/openai_compatible/demo/app.js`
- Create: `../1flowbase-official-plugins/models/openai_compatible/scripts/demo.runner.example.json`
- Create: `web/packages/api-client/src/console-plugins.ts`
- Create: `web/packages/api-client/src/console-model-providers.ts`
- Modify: `web/packages/api-client/src/index.ts`
- Modify: `web/packages/flow-schema/src/index.ts`
- Create: `web/app/src/features/settings/api/model-providers.ts`
- Create: `web/app/src/features/settings/components/model-providers/ModelProviderCatalogPanel.tsx`
- Create: `web/app/src/features/settings/components/model-providers/ModelProviderInstancesTable.tsx`
- Create: `web/app/src/features/settings/components/model-providers/ModelProviderInstanceDrawer.tsx`
- Create: `web/app/src/features/settings/components/model-providers/model-provider-panel.css`
- Modify: `web/app/src/features/settings/pages/SettingsPage.tsx`
- Modify: `web/app/src/features/settings/lib/settings-sections.tsx`
- Modify: `web/app/src/app/router.tsx`
- Create: `web/app/src/features/settings/_tests/model-providers-page.test.tsx`
- Modify: `web/app/src/features/settings/_tests/settings-page.test.tsx`
- Modify: `web/app/src/routes/_tests/section-shell-routing.test.tsx`
- Create: `web/app/src/features/agent-flow/api/model-provider-options.ts`
- Modify: `web/app/src/features/agent-flow/components/detail/fields/LlmModelField.tsx`
- Modify: `web/app/src/features/agent-flow/lib/model-options.ts`
- Modify: `web/app/src/features/agent-flow/lib/node-definitions/nodes/llm.ts`
- Modify: `web/app/src/features/agent-flow/lib/validate-document.ts`
- Modify: `web/app/src/features/agent-flow/schema/agent-flow-view-renderers.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/node-detail-panel.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/node-inspector.test.tsx`
- Create: `web/app/src/features/agent-flow/_tests/llm-model-provider-field.test.tsx`
- Modify: `web/app/src/style-boundary/registry.tsx`
- Modify: `web/app/src/style-boundary/scenario-manifest.json`

## Task 1: Define Provider Package Boundary And Runtime Contract

**Files:**
- Create: `api/crates/plugin-framework/src/error.rs`
- Create: `api/crates/plugin-framework/src/provider_contract.rs`
- Create: `api/crates/plugin-framework/src/provider_package.rs`
- Create: `api/crates/plugin-framework/src/installation.rs`
- Modify: `api/crates/plugin-framework/src/lib.rs`
- Create: `api/crates/plugin-framework/src/_tests/provider_contract_tests.rs`
- Create: `api/crates/plugin-framework/src/_tests/provider_package_tests.rs`

- [x] 把 provider plugin 产物真值收口成 Rust 类型：installation、assignment、task、catalog entry、model discovery mode、标准事件、标准错误。
- [x] 明确 `i18n/` 默认语言回退、`provider/*.yaml` schema 解析、`models/llm/*.yaml` 静态索引和 `manifest` 唯一标识规则。
- [x] 在 `plugin-framework` 单测中锁住：`static / dynamic / hybrid` 发现模式、标准 usage 字段、错误归一化、assignment 约束和 i18n fallback。
- [x] 验证：`cd api && cargo test -p plugin-framework`

## Task 2: Build Minimal Provider Host In `plugin-runner`

**Files:**
- Create: `api/apps/plugin-runner/src/provider_host.rs`
- Create: `api/apps/plugin-runner/src/package_loader.rs`
- Modify: `api/apps/plugin-runner/src/lib.rs`
- Create: `api/apps/plugin-runner/tests/provider_runtime_routes.rs`

- [x] 把 `plugin-runner` 从当前健康检查骨架扩展为最小 provider host，提供包加载、局部 reload、validate、list models、invoke stream 五个入口。
- [x] 约束加载对象必须是产物目录或解包目录，不接受宿主直接执行源码仓根目录。
- [x] 用 fixture provider package 覆盖 `load -> list_models -> validate -> invoke_stream` 最小闭环，并验证 runner 只回传标准事件，不直接执行 tool / MCP。
- [x] 验证：`cd api && cargo test -p plugin-runner`

## Task 3: Persist Installation, Task, Assignment, Instance And Secret State

**Files:**
- Create: `api/crates/domain/src/model_provider.rs`
- Modify: `api/crates/domain/src/lib.rs`
- Modify: `api/crates/control-plane/src/ports.rs`
- Create: `api/crates/storage-pg/migrations/20260418120000_create_provider_kernel_tables.sql`
- Create: `api/crates/storage-pg/migrations/20260418123000_create_model_provider_instance_tables.sql`
- Create: `api/crates/storage-pg/src/plugin_repository.rs`
- Create: `api/crates/storage-pg/src/model_provider_repository.rs`
- Create: `api/crates/storage-pg/src/mappers/plugin_mapper.rs`
- Create: `api/crates/storage-pg/src/mappers/model_provider_mapper.rs`
- Modify: `api/crates/storage-pg/src/lib.rs`
- Modify: `api/crates/storage-pg/src/mappers/mod.rs`
- Create: `api/crates/storage-pg/src/_tests/plugin_repository_tests.rs`
- Create: `api/crates/storage-pg/src/_tests/model_provider_repository_tests.rs`
- Modify: `api/apps/api-server/src/config.rs`

- [x] 新增 `plugin_installations / plugin_assignments / plugin_tasks / provider_instance_model_catalog_cache / model_provider_instances / model_provider_instance_secrets` 表和对应领域对象。
- [x] 把 `draft / ready / invalid / disabled`、任务终态、catalog cache 刷新状态和引用保护规则固化到 repository 与 service 输入输出。
- [x] 给 `api-server` 配置新增 provider secret 主密钥读取入口，并在持久化层只存加密后的 secret JSON，不把敏感字段混进普通 metadata。
- [x] 验证：`cd api && cargo test -p storage-pg model_provider_repository_tests`，`cd api && cargo test -p storage-pg plugin_repository_tests`

## Task 4: Add Console Services And Routes For Plugins And Model Providers

**Files:**
- Create: `api/crates/control-plane/src/plugin_management.rs`
- Create: `api/crates/control-plane/src/model_provider.rs`
- Modify: `api/crates/control-plane/src/lib.rs`
- Modify: `api/crates/control-plane/src/ports.rs`
- Create: `api/crates/control-plane/src/_tests/plugin_management_service_tests.rs`
- Create: `api/crates/control-plane/src/_tests/model_provider_service_tests.rs`
- Modify: `api/crates/control-plane/src/_tests/mod.rs`
- Create: `api/apps/api-server/src/routes/plugins.rs`
- Create: `api/apps/api-server/src/routes/model_providers.rs`
- Modify: `api/apps/api-server/src/routes/mod.rs`
- Modify: `api/apps/api-server/src/openapi.rs`
- Modify: `api/apps/api-server/src/lib.rs`
- Create: `api/apps/api-server/src/_tests/plugin_routes.rs`
- Create: `api/apps/api-server/src/_tests/model_provider_routes.rs`

- [x] 落 `plugins catalog / install / enable / assign / tasks` 和 `model providers catalog / list / create / update / validate / models / refresh / delete / options` 两组控制面 service。
- [x] 校验 `view` 与 `manage` 权限边界，保证 secret 永不出现在普通列表响应里，`validate` 和删除冲突都写审计。
- [x] 让 `GET /api/console/model-providers/options` 返回 `LLM` 节点直接消费的 `ready provider instances + models` 结构，避免前端自行拼装多接口。
- [x] 验证：`cd api && cargo test -p control-plane`，`cd api && cargo test -p api-server`

执行备注（`2026-04-18 15:16`）：
- `control-plane` 已新增 `PluginManagementService`、`ModelProviderService` 及对应 service tests。
- `api-server` 已新增 `plugins`、`model-providers` routes、OpenAPI 暴露与 route tests，并接入内嵌 `ProviderHost` runtime adapter。

## Task 5: Wire Compile-Time Validation And Runtime Consumption

**Files:**
- Modify: `api/crates/orchestration-runtime/src/compiled_plan.rs`
- Modify: `api/crates/orchestration-runtime/src/compiler.rs`
- Modify: `api/crates/orchestration-runtime/src/execution_engine.rs`
- Modify: `api/crates/orchestration-runtime/src/preview_executor.rs`
- Modify: `api/crates/control-plane/src/orchestration_runtime.rs`
- Modify: `api/crates/domain/src/flow.rs`

- [x] 让 `compiled plan` 冻结 `provider_instance_id / provider_code / protocol / model` 最小运行元信息，并在编译阶段产出缺失实例、实例失效、模型不可用等 compile issue。
- [x] 让调试执行和真实运行都走 `plugin-runner` 的标准 contract，统一消费 `text_delta / tool_call_commit / mcp_call_commit / usage / finish / error`。
- [x] 在 `node_run` 诊断里保留 provider 维度的错误类别和原始摘要，但严格脱敏，不回显完整 secret 或认证头。
- [x] 验证：`cd api && cargo test -p orchestration-runtime`，`cd api && cargo test -p control-plane orchestration_runtime`

执行备注（`2026-04-18 16:43`）：
- `orchestration-runtime` 已新增 provider-aware `CompiledPlan` / `compile_issues`、异步 provider invoker、`llm` 节点真实 runtime 调用、provider 事件与脱敏错误诊断。
- `control-plane` / `api-server` 已接入 workspace provider compile context、运行时实例/secret 装配、provider stream event 落库，以及 application runtime route/tests 的真实 provider fixture。

## Task 6: Initialize The Official `openai_compatible` Reference Plugin

**Files:**
- Create: `../1flowbase-official-plugins/models/openai_compatible/manifest.yaml`
- Create: `../1flowbase-official-plugins/models/openai_compatible/provider/openai_compatible.yaml`
- Create: `../1flowbase-official-plugins/models/openai_compatible/provider/openai_compatible.js`
- Create: `../1flowbase-official-plugins/models/openai_compatible/models/llm/_position.yaml`
- Create: `../1flowbase-official-plugins/models/openai_compatible/models/llm/openai_compatible_chat.yaml`
- Create: `../1flowbase-official-plugins/models/openai_compatible/i18n/en_US.json`
- Create: `../1flowbase-official-plugins/models/openai_compatible/_assets/.gitkeep`
- Create: `../1flowbase-official-plugins/models/openai_compatible/i18n/zh_Hans.json`
- Create: `../1flowbase-official-plugins/models/openai_compatible/readme/README_en_US.md`
- Create: `../1flowbase-official-plugins/models/openai_compatible/demo/index.html`
- Create: `../1flowbase-official-plugins/models/openai_compatible/demo/styles.css`
- Create: `../1flowbase-official-plugins/models/openai_compatible/demo/app.js`
- Create: `../1flowbase-official-plugins/models/openai_compatible/scripts/demo.runner.example.json`

- [x] 用现有 `node scripts/node/plugin.js init` 和 `demo init` 生成参考插件骨架，再补齐 `manifest / provider schema / model yaml / i18n / readme`。
- [x] 参考插件只覆盖 `base_url + api_key (+ organization/project/api_version/default_headers)` 和 `OpenAI-compatible` 协议，不在首轮引入第二个官方 provider。
- [x] 让参考插件能被 Task 2 的 runner host 和 Task 4 的控制面安装链路直接消费，作为端到端验证 fixture。
- [x] 验证：`node scripts/node/plugin.js demo init ../1flowbase-official-plugins/models/openai_compatible`，`node scripts/node/plugin.js demo dev ../1flowbase-official-plugins/models/openai_compatible --port 4310`

执行备注（`2026-04-18 17:11`）：
- `../1flowbase-official-plugins/models/openai_compatible` 已补齐 `manifest / provider schema / provider runtime / static model yaml / i18n / readme / demo / runner example`，协议收敛为 `OpenAI-compatible`，首轮仅覆盖 `base_url + api_key (+ organization/project/api_version/default_headers)`。
- `node scripts/node/plugin.js demo init ../1flowbase-official-plugins/models/openai_compatible` 已成功重建 demo 骨架，`node scripts/node/plugin.js demo dev ../1flowbase-official-plugins/models/openai_compatible --port 4310` 已验证本地 demo 可直接启动并指向 `plugin-runner`。

## Task 7: Build `Settings / 模型供应商` Page And Client Contract

**Files:**
- Create: `web/packages/api-client/src/console-plugins.ts`
- Create: `web/packages/api-client/src/console-model-providers.ts`
- Modify: `web/packages/api-client/src/index.ts`
- Create: `web/app/src/features/settings/api/model-providers.ts`
- Create: `web/app/src/features/settings/components/model-providers/ModelProviderCatalogPanel.tsx`
- Create: `web/app/src/features/settings/components/model-providers/ModelProviderInstancesTable.tsx`
- Create: `web/app/src/features/settings/components/model-providers/ModelProviderInstanceDrawer.tsx`
- Create: `web/app/src/features/settings/components/model-providers/model-provider-panel.css`
- Modify: `web/app/src/features/settings/pages/SettingsPage.tsx`
- Modify: `web/app/src/features/settings/lib/settings-sections.tsx`
- Modify: `web/app/src/app/router.tsx`
- Create: `web/app/src/features/settings/_tests/model-providers-page.test.tsx`
- Modify: `web/app/src/features/settings/_tests/settings-page.test.tsx`
- Modify: `web/app/src/routes/_tests/section-shell-routing.test.tsx`

- [x] 在 `Settings` 下新增 `model-providers` section，把 catalog 和 instance list 放在同一页面骨架里，不做卡片墙式堆叠。
- [x] 表单按 provider schema 驱动，支持保存、验证、查看模型列表和刷新模型缓存，并复用现有 `SectionPageLayout` / `settings` 路由模式。
- [x] 前端只消费 `api-client` 合同，不在组件内直接写请求函数；`view` 用户只能看到 metadata 与状态，`manage` 用户才能执行保存、验证、删除。
- [x] 验证：`pnpm --dir web/app test -- src/features/settings/_tests/model-providers-page.test.tsx src/features/settings/_tests/settings-page.test.tsx src/routes/_tests/section-shell-routing.test.tsx`

执行备注（`2026-04-18 17:11`）：
- `SettingsPage` 已接入 `model-providers` section，页面骨架固定为左侧 provider catalog + 右侧 instance table，并通过 schema-driven drawer 承载新建/编辑表单，不回退到卡片墙布局。
- `web/packages/api-client/src/console-model-providers.ts`、`web/packages/api-client/src/console-plugins.ts` 和 `web/app/src/features/settings/api/model-providers.ts` 已把 provider/plugin 控制面 transport、query key 和 mutation 统一收敛到前端合同层。
- 计划里的 `pnpm --dir web/app test -- ...` 命令已执行并通过；由于 `web/app` 的 `test` script 会落到整包 `vitest --run`，该命令实际跑了完整 `web/app` 测试集，但目标文件 `model-providers-page`、`settings-page`、`section-shell-routing` 均在结果中通过。

## Task 8: Upgrade `LlmModelField` To Provider-Aware Selection

**Files:**
- Modify: `web/packages/flow-schema/src/index.ts`
- Create: `web/app/src/features/agent-flow/api/model-provider-options.ts`
- Modify: `web/app/src/features/agent-flow/components/detail/fields/LlmModelField.tsx`
- Modify: `web/app/src/features/agent-flow/lib/model-options.ts`
- Modify: `web/app/src/features/agent-flow/lib/node-definitions/nodes/llm.ts`
- Modify: `web/app/src/features/agent-flow/lib/validate-document.ts`
- Modify: `web/app/src/features/agent-flow/schema/agent-flow-view-renderers.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/node-detail-panel.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/node-inspector.test.tsx`
- Create: `web/app/src/features/agent-flow/_tests/llm-model-provider-field.test.tsx`

- [x] 把当前硬编码 `openai` 模型列表替换成后端 `options` 合同，选择器固定为“先选 provider instance，再选 model”的两段式。
- [x] 节点 document 需要显式持有 `provider_instance_id` 与 `model`，并在 inspector、node card、校验错误态和最后运行诊断里统一展示。
- [x] “模型供应商设置”按钮直接跳到 `/settings/model-providers`；当当前节点引用的实例失效或不再 `ready` 时，面板显示正式错误态而不是静默回退。
- [x] 验证：`pnpm --dir web/app test -- src/features/agent-flow/_tests/llm-model-provider-field.test.tsx src/features/agent-flow/_tests/node-detail-panel.test.tsx src/features/agent-flow/_tests/node-inspector.test.tsx`

执行备注（`2026-04-18 17:11`）：
- `LlmModelField` 已改为通过 `GET /api/console/model-providers/options` 消费 `ready provider instances + models`，交互固定为“先选 provider instance，再选 model”的两段式弹层。
- `flow-schema` 默认文档、LLM 节点 schema、前端校验、只读 renderer、最后运行元数据和节点运行诊断都已透出 `provider_instance_id + model + provider metadata`，不再静默回退到硬编码 `openai`。
- 计划里的 `pnpm --dir web/app test -- ...` 命令已执行并通过；与 Task 7 一样，该命令实际跑了完整 `web/app` 测试集，但目标文件 `llm-model-provider-field`、`node-detail-panel`、`node-inspector` 均在结果中通过。

## Task 9: Sync Frontend File Index And Run Full Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-04-18-model-provider-integration.md`
- Modify: `web/app/src/style-boundary/registry.tsx`
- Modify: `web/app/src/style-boundary/scenario-manifest.json`

- [x] 按实际落地结果回填本文“Frontend File Index”，逐条写清文件责任和本轮改动，不允许只保留计划态目录猜测。
- [x] 把 `page.settings` 和 `page.application-detail` 的 `style-boundary` 场景更新到新页面结构和新 provider-aware 节点 UI。
- [x] 跑完整后端、前端和文本校验，确认 `openai_compatible` 参考插件能完成安装、分配、建实例、validate、list models、节点绑定和 debug run 最小链路。
- [x] 验证：`node scripts/node/verify-backend.js`，`pnpm --dir web lint`，`pnpm --dir web test`，`pnpm --dir web/app build`，`node scripts/node/check-style-boundary.js page page.settings`，`node scripts/node/check-style-boundary.js page page.application-detail`，`git diff --check`

执行备注（`2026-04-18 17:11`）：
- `Frontend File Index` 已按真实落地结果回填到文件级 owner 与本轮改动，不再停留在计划态占位说明。
- `node scripts/node/verify-backend.js`、`pnpm --dir web test`、`pnpm --dir web/app build`、`node scripts/node/check-style-boundary.js page page.settings`、`node scripts/node/check-style-boundary.js page page.application-detail`、`git diff --check` 均已通过。
- `pnpm --dir web lint` 已以退出码 `0` 通过；当前保留 2 条已有 `react-refresh/only-export-components` warning（`NodeInspector.tsx`、`store/editor/provider.tsx`），未阻塞本轮交付。
- `pnpm --dir web test` 通过时保留了若干现有测试 warning（主要是 `antd Tooltip overlayInnerStyle` deprecation 与一个 `act(...)` 提示），但 49 个测试文件 / 165 个测试全部通过，不影响本轮 provider integration 闭环验证。

## Frontend File Index

执行前的起始索引如下；进入 Task 7-9 后必须按真实落地结果持续回填“本轮改动”列。

| Path | Responsibility | 本轮改动 |
| --- | --- | --- |
| `web/packages/api-client/src/console-plugins.ts` | 控制面 plugin 安装、分配、任务 transport 契约 | 新建 `catalog / install / enable / assign / tasks` client，供模型供应商设置链路消费宿主插件状态 |
| `web/packages/api-client/src/console-model-providers.ts` | 控制面 provider catalog、instance、models、options 底层 transport 契约 | 新建 DTO、query 和 mutation 合同，覆盖 catalog、instances、validate、models、refresh、delete、options |
| `web/app/src/features/settings/api/model-providers.ts` | settings feature 内的 provider query/mutation 消费层 | 新建 query key、queryFn 和 mutation wrapper，并把 instance 改动后的 options 缓存失效同步给 agentFlow |
| `web/app/src/features/settings/pages/SettingsPage.tsx` | `Settings` 容器页与 section 分发 | 新增 `model-providers` section 容器，组合 catalog panel、instances table、schema-driven drawer 和行级管理 mutation |
| `web/app/src/features/settings/lib/settings-sections.tsx` | settings rail 导航真值 | 新增 `model-providers` section，并按 `state_model.*` 权限控制可见性与默认跳转 |
| `web/app/src/features/settings/components/model-providers/ModelProviderCatalogPanel.tsx` | provider catalog 展示区 | 新建 provider 元数据、协议、模型发现模式和“从安装项创建实例”入口 |
| `web/app/src/features/settings/components/model-providers/ModelProviderInstancesTable.tsx` | provider instance 列表与行级操作 | 新建实例状态、模型数量和 `edit / validate / refresh / delete` 行级动作，区分 view-only 与 manage 用户 |
| `web/app/src/features/settings/components/model-providers/ModelProviderInstanceDrawer.tsx` | provider schema-driven create/edit drawer | 新建按 schema 渲染字段、提交 config/secret、复用 create/edit 模式的表单抽屉 |
| `web/app/src/features/settings/components/model-providers/model-provider-panel.css` | provider 页面私有样式 | 新建 settings 页面两栏布局、表格、抽屉和正式状态块样式，不回退到卡片墙 |
| `web/app/src/features/agent-flow/api/model-provider-options.ts` | agentFlow 读取 provider options 的请求消费层 | 新建应用侧 `options` query，对接控制面 `ready provider instances + models` 合同 |
| `web/packages/flow-schema/src/index.ts` | 默认 flow document 与共享 schema | 默认 LLM 节点 `config` 补齐 `provider_instance_id + model` 真值，避免初始文档与新 contract 脱节 |
| `web/app/src/features/agent-flow/components/detail/fields/LlmModelField.tsx` | LLM 节点实例与模型两段式选择器 | 从静态模型列表升级为 provider instance -> model 两段式弹层，保留参数调优并补正式错误态与设置跳转 |
| `web/app/src/features/agent-flow/lib/model-options.ts` | options 到 selector UI 的适配层 | 从硬编码 `openai` 列表改成 provider instance/model mapper、tag 适配和 lookup helper |
| `web/app/src/features/agent-flow/lib/node-definitions/nodes/llm.ts` | LLM 节点 schema 配置入口 | 把 `config.provider_instance_id` 纳入 schema 要求，并调整模型字段语义为 provider-aware 配置 |
| `web/app/src/features/agent-flow/lib/validate-document.ts` | agentFlow 文档前端校验 | 新增 provider 实例缺失、实例失效、模型不匹配等正式校验 issue |
| `web/app/src/features/agent-flow/schema/agent-flow-view-renderers.tsx` | node card 与 detail 只读展示 | 补充 provider instance、model 和失效态展示，避免只读视图继续假定 `openai` |
| `web/app/src/features/agent-flow/components/detail/last-run/NodeRunMetadataCard.tsx` | 节点最后运行元数据卡片 | 新增 provider instance/code/protocol/finish reason 等运行时诊断字段 |
| `web/app/src/style-boundary/registry.tsx` | settings / application-detail 场景渲染入口 | 加入 provider catalog、instances、options mock，并 seed provider-aware agentFlow 文档供场景回归 |
| `web/app/src/style-boundary/scenario-manifest.json` | style-boundary 场景与 impact files 真值 | 追加 provider 页面和 provider-aware agentFlow UI 的影响文件映射与边界断言 |
