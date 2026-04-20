# 1flowbase Model Provider Contract Gate Design

## 背景

截至 `2026-04-20`，`1flowbase` 的 model provider 契约治理状态分成两半：

- 主链已经修复。`latest main` 中，settings 对 `/api/console/model-providers/catalog` 的消费已经从“直接把响应当数组”改为“读取 wrapper response 的 `entries`”。
- 断口仍然存在。`style-boundary` 的 settings 场景还保留旧 `/catalog` 数组 mock，定向 `vitest` 已经可以复现 `catalogEntries is not iterable`。
- 共享契约门禁仍然缺失。当前 `verify-repo` 和 `verify-ci` 只是组合既有 full gate 与 coverage gate，还没有专门针对共享 API 契约的独立失败面。
- 跨仓库校验仍然是单向。`1flowbase-official-plugins` 改动时会检出主仓做干跑打包，但主仓改到高风险 provider/plugin 路径时，不会反向要求插件仓库回归。

本轮已经确认的实施范围是：

1. 先修 `style-boundary` 等 consumer 的旧 mock 与旧替身。
2. 同时落第一版 `contract gate`。
3. 把最小必要的测试说明与 QA/skill 口径一起更新。
4. `cross-repo gate` 本轮只完成设计，不进入实现计划。

## 目标

本设计要同时满足四个目标：

1. 恢复 latest `main` 上 model provider 相关前端 full gate 的一致性。
2. 为 `/api/console/model-providers/catalog` 与 `/options` 新增独立 `contract gate`，让共享契约有单独失败面。
3. 把“真相源”从零散 mock 收口成仓库内一组共享 fixture，而不是继续让 page test、style-boundary、feature test 各自手写形状。
4. 提前定义 `cross-repo gate` 的 Blocking 规则和触发边界，避免后续实现时再次争论门禁语义。

## 决策摘要

### 1. 本轮只实现 Phase A，Phase B 先写设计

本轮正式实现的范围固定为 `Phase A`：

- 修复 `style-boundary` settings 场景的旧 mock。
- 新增 `test-contracts` 入口。
- 把 contract gate 接入 `verify-repo`。
- 更新最小必要的 README、测试说明和 QA 口径。

`Phase B` 只在 spec 中固定规则，不在本轮 implementation plan 中执行：

- 主仓按路径命中的 `cross-repo gate`
- 第一阶段直接 `Blocking`
- 只在命中高风险 provider/plugin 路径时才反向验证 `1flowbase-official-plugins`

这样做的理由是明确的：

- 本轮的真实阻塞是主仓内 shared contract 仍没有独立门禁；
- 如果现在把跨仓库 gate 一起做掉，改动会同时跨 `web`、`scripts/node`、GitHub Actions 和外部仓库，返工风险明显更高；
- 先把主仓内 contract gate 做稳，再把它作为 cross-repo gate 的前置基础，整体成本更低。

### 2. 真相源不放在 `web/app`，而放在 `scripts/node/testing/contracts/model-providers/`

共享 fixture 的真相源固定放在：

- `scripts/node/testing/contracts/model-providers/catalog.multiple-providers.json`
- `scripts/node/testing/contracts/model-providers/options.multiple-providers.json`

不放在 `web/app/src/test/fixtures/...` 的原因：

- `web/app` 是消费方，不应该拥有 repo-level gate 的真相源。
- 这份 fixture 不只给 settings page 用，还会被 `style-boundary`、`test-contracts` 和必要的 agent-flow provider options tests 复用。
- 后续 `cross-repo gate` 也会从 `scripts/node/*` 这一层扩展，contract fixture 放在同一控制面更自然。

目录名使用 `model-providers` 而不是具体单个 provider，是为了明确这是一组 console API 契约快照，不是某一个插件的私有测试数据。

fixture 文件名固定包含 `multiple-providers`，要求 fixture 至少覆盖两个 provider，避免 contract gate 从第一天起就被单一 `openai_compatible` 视角绑死。

### 3. web 侧通过共享纯数据模块消费 fixture，不直接把 `web/app` 变成真相源

虽然真相源放在 `scripts/node/testing/contracts/model-providers/`，但 `style-boundary` 和 `web/app` tests 仍需要直接使用同一份数据。

本轮的共享方式固定为：

- 在 `scripts/node/testing/contracts/model-providers/` 下新增一个纯数据导出模块。
- `web/app` 通过显式 alias 引用这个纯数据模块，而不是使用深层相对路径。
- 如果 Vite 对 repo-external 文件访问有限制，则在 `web/app/vite.config.ts` 补 `server.fs.allow`，只放开必要目录。

这样做的约束是：

- 共享模块必须只导出 JSON-compatible 的纯数据或纯数据构造函数。
- 禁止在共享模块中引入 `node:fs`、`process.cwd()` 或运行时副作用。
- `style-boundary`、settings tests、agent-flow tests 都只能作为这份共享数据的消费者，不再单独维护另一份“真相”.

### 4. 第一版 contract gate 只覆盖两个高风险 endpoint

本轮 `contract gate` 固定只覆盖：

- `/api/console/model-providers/catalog`
- `/api/console/model-providers/options`

覆盖规则固定为两层：

1. 顶层包装必须存在且类型正确：
   - `locale_meta`
   - `i18n_catalog`
   - `entries` 或 `instances`
2. 首个条目的关键字段集合必须稳定：
   - `catalog.entries[0]`
   - `options.instances[0]`

这样做的原因是：

- 当前缺口不是全仓 API 没有测试，而是高风险共享契约没有穿透到多个 consumer。
- `/catalog` 与 `/options` 已经证明是真实高风险接口，并且同时影响 settings 与 agent-flow。
- 第一版先把 failure surface 做窄，保证门禁可维护，再决定后续是否扩展到更多 console API。

### 5. `/options` 也要把包装层和关键字段锁住

`/options` 当前虽然运行时没有像 `/catalog` 那样直接炸掉，但它仍然是共享契约的一部分。

第一版 contract gate 必须锁住：

- 顶层 `locale_meta`
- 顶层 `i18n_catalog`
- `instances`
- `instances[0]` 的关键字段：
  - `provider_instance_id`
  - `provider_code`
  - `plugin_type`
  - `namespace`
  - `label_key`
  - `description_key`
  - `protocol`
  - `display_name`
  - `models`

这条规则的目的不是要求所有 consumer 现在立刻使用这些字段，而是阻止 DTO 和测试替身继续把它们静默丢掉。

### 6. `verify-repo` 接 `test-contracts`，`verify-ci` 继续通过 `verify-repo` 间接接入

本轮不会新造另一层 CI 语义。

门禁接入固定为：

- 新增 `scripts/node/test-contracts.js`
- `scripts/node/verify-repo.js` 顺序接入 `test-contracts`
- `scripts/node/verify-ci.js` 继续只做：
  - `verify-repo`
  - `verify-coverage all`

这保持了最近确认过的门禁语义：

- `verify-repo` 仍然是仓库级 full gate
- `verify-ci` 仍然是仓库级 CI 总入口
- `contract gate` 是 `verify-repo` 里的独立 failure surface，而不是覆盖率层或 GitHub Actions 内联逻辑

### 7. README、QA/skill 口径只做最小必要更新

本轮允许并要求同步更新最小必要说明，但不做大面积文档重写。

更新范围固定为：

- `README.md`
  - 增加 `test-contracts` 入口及其与 `verify-repo` / `verify-ci` 的关系
- 相关测试治理文档
  - 说明 contract gate 的职责和真相源目录
- `qa-evaluation`
  - 把“model provider 共享契约是否已进入独立 gate”纳入明确检查点

不在本轮范围内的内容：

- 重写所有 skill
- 引入 OpenAPI codegen
- 把所有 console API 一次性纳入 contract gate

## Phase A 文件设计

### 新增文件

- `scripts/node/testing/contracts/model-providers/catalog.multiple-providers.json`
  - `/catalog` 的 canonical shared fixture
- `scripts/node/testing/contracts/model-providers/options.multiple-providers.json`
  - `/options` 的 canonical shared fixture
- `scripts/node/testing/contracts/model-providers/index.js`
  - 统一导出 canonical fixture，供 `scripts/node` 与 `web/app` alias 复用
- `scripts/node/test-contracts.js`
  - contract gate 入口
- `scripts/node/test-contracts/_tests/cli.test.js`
  - 覆盖 contract gate 的命令编排和帮助输出

### 修改文件

- `scripts/node/verify-repo.js`
  - 接入 `test-contracts`
- `scripts/node/verify-repo/_tests/cli.test.js`
  - 断言 `verify-repo` 新的命令组合
- `web/app/vite.config.ts`
  - 为共享 contract fixture 模块增加 alias；如有必要，增加受控 `fs.allow`
- `web/app/src/style-boundary/registry.tsx`
  - 改为消费 canonical fixture，不再内联旧数组 shape
- `web/app/src/style-boundary/_tests/registry.test.tsx`
  - 确认 settings scene 在 canonical fixture 下通过
- `web/app/src/features/settings/api/_tests/settings-api.test.ts`
  - 改为围绕 canonical wrapper shape 断言
- `web/app/src/features/settings/_tests/model-providers-page.test.tsx`
  - 改为通过 canonical fixture 或其投影构造测试数据
- 必要的 agent-flow provider options tests
  - 确保 `/options` 的 canonical shape 在主要 consumer 上不被旧 mock 掩盖
- `README.md`
  - 补充 `test-contracts` 说明
- `.agents/skills/qa-evaluation/SKILL.md`
  - 补充 contract gate 的检查口径

## Canonical Fixture 设计

### 1. fixture 必须使用多 provider 数据

canonical fixture 不能只描述单一 provider。

第一版 fixture 至少同时覆盖：

- 一个当前已有的官方 provider，例如 `openai_compatible`
- 一个第二 provider，用来证明 gate 不是依赖单一 provider 的偶然形状

这样做的作用：

- 防止 consumer 逻辑只在“单 provider + 单 instance”下看起来正确
- 防止 `current_installation_id`、grouping、dedupe、fallback 等逻辑继续被单例视角掩盖

### 2. fixture 只表达共享契约，不混入 cross-repo release 链路语义

这组 fixture 只服务于 console model provider 契约。

它不负责表达：

- `official-registry.json` release 结构
- 插件打包产物选择
- 多平台 runtime artifact 选择
- `1flowbase-official-plugins` 仓库的发布链路

这些都属于未来 `cross-repo gate` 的独立责任，不应混进本轮 `model-providers` fixture。

### 3. fixture 必须带真实包装字段

`catalog.multiple-providers.json` 和 `options.multiple-providers.json` 都必须带：

- `locale_meta`
- `i18n_catalog`

即使当前某些 consumer 暂时不直接使用它们，也不能在测试替身里省略。

## Contract Gate 行为

`scripts/node/test-contracts.js` 的职责固定为两类检查：

1. 运行针对共享契约的定向测试：
   - settings API wrapper
   - settings page / model provider consumer
   - `style-boundary` settings scene
   - 必要的 agent-flow provider options consumer
2. 让这组测试以 canonical fixture 为唯一真相源运行，确保同一份包装结构穿透多 consumer。

第一版 contract gate 不额外引入浏览器 E2E、OpenAPI codegen 或全仓 schema diff。

第一版 contract gate 的成功标准不是“证明整个后端永远不会变”，而是：

- 当前主仓内所有关键 consumer 都和同一份 canonical shape 对齐；
- 当 shared contract 被 consumer 侧或替身侧破坏时，有单独且稳定的失败面。

## Phase B: Cross-Repo Gate 设计

`cross-repo gate` 不在本轮实现，但规则在本 spec 中固定如下。

### 1. 强度固定为 `Blocking`

主仓命中高风险路径时，反向插件仓库验证直接阻塞，不走 advisory 过渡。

理由：

- 当前阶段还早，收紧成本低；
- 如果现在允许 advisory 漂一段时间，后续等路径更多、consumer 更多时再收严，修复成本会更高。

### 2. 触发方式固定为主仓按路径命中

第一版建议命中范围包括：

- `scripts/node/plugin/**`
- `api/apps/plugin-runner/**`
- `api/crates/plugin-framework/**`
- `api/apps/api-server/src/routes/model_providers.rs`
- `api/crates/control-plane/**` 中 provider / plugin / runtime-profile 相关路径
- `web/packages/api-client/src/console-model-providers.ts`
- `web/app/src/features/settings/**` 的 provider / plugin 安装链
- 官方 registry / release 相关 workflow 与脚本

### 3. 反向校验目标固定为官方插件仓库的最小必要验证

命中路径后，主仓 CI 需要：

1. 检出 `1flowbase-official-plugins`
2. 执行该仓库最小必要的 provider / registry / packaging 回归
3. 失败则阻塞主仓 CI

它的目标不是重复插件仓库所有 CI，而是证明“主仓这次变更没有打坏官方插件消费链”。

## 非目标

本轮明确不做以下内容：

- 不引入 OpenAPI / Schema 驱动 TS codegen
- 不把全部 console API 一次性纳入 contract gate
- 不在本轮实现 `cross-repo gate`
- 不把 coverage 规则并回 `verify-repo`
- 不重写全部 skill 或测试文档

## 验证标准

本轮设计完成后的实施验收标准固定为：

1. `style-boundary` settings scene 在最新 contract shape 下通过。
2. `test-contracts.js` 可以单独运行并明确失败或通过。
3. `verify-repo` 已顺序接入 `test-contracts`。
4. `verify-ci` 语义保持不变，只通过 `verify-repo` 间接带上 contract gate。
5. canonical fixture 真相源位于 `scripts/node/testing/contracts/model-providers/`，且至少覆盖两个 provider。
6. README 与 QA/skill 说明已经补到能解释新的 gate 结构。
