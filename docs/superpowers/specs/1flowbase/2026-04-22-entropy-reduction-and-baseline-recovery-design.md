# 1flowbase Entropy Reduction And Baseline Recovery Design

## Context

`2026-04-22` 的全局审查已经确认当前仓库存在三类同时发生的问题：

1. 质量基线失真：`test-contracts`、`test-frontend.js fast`、`test-backend.js` 都存在真实失败，且失败点覆盖前端 consumer、后端 route fixture、页面交互与测试超时，不是单点波动。
2. 兼容与历史残留继续放大复杂度：`plugin-runner` 仍接受 legacy invoke payload，`plugin-framework` 仍保留未被生产代码消费的旧 provider manifest 类型。
3. 核心模块膨胀：`control-plane` 的 `orchestration_runtime.rs`、`plugin_management.rs`，以及前端 `SettingsPage.tsx` 已经明显超过“单文件单职责”的当前治理目标。

当前项目阶段按开发初期处理，优先完整一致性，默认不保留兼容路径，除非用户明确要求。

## Goal

把仓库从“基线已红、兼容层未收口、核心文件持续膨胀”的状态，收敛到“关键门禁恢复、过时代码开始退出、后续拆分有明确入口”的状态。

## Non-Goals

- 本轮不追求一次性把所有超长文件全部拆完。
- 本轮不做与当前失败和熵增无关的 UI 美化或命名重写。
- 本轮不引入新的兼容层、迁移桥接层或双写逻辑。

## Approved Direction

用户已确认采用以下顺序：

1. 先恢复门禁基线。
2. 再清理兼容层和过时代码。
3. 然后拆分神文件与职责混叠模块。
4. 最后补齐和稳固测试。

## Approach Options

### Option A: 先做大重构，再回头修测试

- 好处：可以一次性把结构做“漂亮”。
- 风险：当前门禁已红，缺少可信反馈链路；重构时很容易把真实回归和历史红灯混在一起。

### Option B: 先恢复基线，再分阶段去兼容和拆分

- 好处：每一阶段都有可验证出口，能持续降低熵，而不是扩大 blast radius。
- 风险：文档、计划和执行会比“直接改代码”多一点前置工作。

### Option C: 只修红灯，不动结构

- 好处：短期最快。
- 风险：会把当前的巨型文件、双协议入口和死代码继续保留下来，后续熵会更高。

## Recommendation

采用 Option B。

原因：

- 当前真实失败已经证明仓库缺的不是单点 patch，而是“先恢复反馈链路，再收敛结构”的顺序纪律。
- 去兼容和拆分都需要依赖可靠测试，否则只是把风险从运行时搬到 merge 后。

## Phase Design

### Phase 1: Baseline Recovery

- 修正前端 settings model-provider options consumer/test 与共享 fixture 的口径漂移。
- 修正后端 node contribution route test 中落后于 migration 的 `plugin_installations.enabled` fixture。
- 复跑 `test-contracts`、`test-frontend.js fast`、`test-backend.js`，确认当前真实红灯清单缩小到剩余问题。

### Phase 2: Compatibility Removal

- 删除 `plugin-framework` 中未被生产路径消费的旧 provider manifest 类型。
- 收紧 `plugin-runner` 的 legacy invoke fallback，至少把它从默认成功路径中移出，避免继续静默吞契约错误。

### Phase 3: Structural Split

- 后端优先拆 `orchestration_runtime.rs` 与 `plugin_management.rs`。
- 前端优先拆 `SettingsPage.tsx` 的 model provider orchestration。
- 测试 fixture 和 builder 从生产文件中下沉到专用 `_tests` 支撑层。

### Phase 4: Test Stabilization

- 收敛共享 fixture 真相源。
- 减少依赖中文文案的脆弱选择器。
- 对超时测试做根因修复，而不是统一加 timeout。

## Constraints

- 测试目录继续对齐 `_tests`。
- warning 与 coverage 产物继续统一落到 `tmp/test-governance/`。
- 后端 `cargo` 验证保持串行。
- 单轮改动优先服务当前阶段目标，不夹带无关重构。

## Acceptance

当以下条件同时满足时，Phase 1 视为完成：

1. `node scripts/node/test-contracts.js` 通过。
2. `node scripts/node/test-backend.js` 不再被已知的 `plugin_installations.enabled` 过期 fixture 阻塞。
3. 前端快检的剩余失败项不再包含 settings contract 漂移这一类“共享真相源已变、consumer/test 未同步”的问题。
4. 已写明 Phase 2 的具体切入口和受影响文件。
