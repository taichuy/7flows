# 2026-03-16 Workflow publish query split

## 背景

- `docs/dev/runtime-foundation.md` 已把 `web/lib/get-workflow-publish.ts` 明确列为需要持续治理的前端聚合热点之一。
- 当前 publish 页面已经同时承载 binding list、cache inventory、API key、invocation audit、detail drilldown 与 export URL；继续把类型定义、fetcher 和查询参数拼装堆在单文件里，会让后续 publish 侧治理语义和页面联动越来越难维护。
- 本轮不扩张 published surface 的业务语义，而是先把现有读取层收成更清晰的边界，为后续继续补 publish/operator 动作面腾出空间。

## 目标

1. 降低 `web/lib/get-workflow-publish.ts` 的聚合复杂度。
2. 保持现有 import surface 不变，避免无关组件大面积改动。
3. 为后续继续拆 publish list/detail/governance 查询保留稳定模块边界。

## 实现

- 新增 `web/lib/workflow-publish-types.ts`
  - 承接 published endpoint、invocation audit、cache inventory、API key、detail drilldown 等共享类型定义。
- 新增 `web/lib/workflow-publish-client.ts`
  - 承接 published endpoint 查询、cache inventory、API key、invocation list/detail 与 export URL 构造。
  - 把 invocation 查询参数拼装收口到 client 内部 helper，避免后续调用方重复散落同类逻辑。
- 将 `web/lib/get-workflow-publish.ts` 收成稳定 barrel
  - 继续对外导出原有 types 与 fetcher，现有消费方无需改 import 路径。

## 影响范围

- publish 页面、publish governance snapshot、presenter helper 与相关组件继续复用原入口，不引入兼容性回归风险。
- `get-workflow-publish.ts` 从约 501 行降到 2 行，热点从“单体聚合文件”转成“types / client 分层”的可继续演进状态。
- 这一步虽然没有新增用户可见功能，但直接服务于 `P1` 的 publish/editor 热点治理：后续继续补 publish detail / operator 动作面时，不需要再把复杂度堆回同一个读取文件。

## 验证

- `web/pnpm exec tsc --noEmit`
- `web/pnpm lint`
- `git diff --check`

## 评估结论

### 1. 对架构/扩展/兼容/稳定性的帮助

- 这次改动不改变 `7Flows IR`、publish API 或运行时事实层，只是把前端读取层的职责边界梳理清楚。
- publish 相关查询继续通过稳定 barrel 暴露，兼容性风险低；后续若继续拆 list/detail/governance，也能沿现有模块边界推进。
- 对稳定性的直接价值在于：减少“改一处 publish 读取逻辑牵动整文件”的风险，提升后续迭代时的可维护性和回归可控性。

### 2. 对业务闭环推进的帮助

- 对用户层：为继续打磨 publish 面板、invocation detail、export 与 operator 入口铺路。
- 对 AI 与人协作层：后续继续补 publish detail / callback waiting 解释、governance drilldown 时，读取层边界更清晰，排障信息更容易继续扩展。
- 对 AI 治理层：published surface 的敏感访问保护、invocation detail drilldown 与 cache inventory access 仍沿统一主链读取，没有因为重构而产生第二套取数路径。

## 下一步

1. 继续把 publish detail / governance 侧剩余的聚合展示逻辑从组件壳层抽到 presenter / section helper。
2. 继续治理 `workflow-tool-execution-validation.ts` 与 `workflow-editor-variable-form.tsx`，避免 editor / publish 热点回流。
3. 在结构热点持续下降后，再回到更高优先级的 `sensitive access policy` editor 入口与 callback waiting operator 动作面。
