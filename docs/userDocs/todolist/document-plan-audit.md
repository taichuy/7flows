# 文档计划审计待确认

日期：`2026-04-13 00`

## 建议优先级

- [ ] `P0` 把 `docs/superpowers` 的模块状态改成双轨
  - 建议：做
  - 目标：区分 `spec_status` 和 `implementation_status`
  - 原因：当前 `03-08` 模块的文档状态明显超前于代码状态，已经影响排期和 QA 口径

- [ ] `P0` 修复当前验证门禁
  - 建议：做
  - 最小范围：
    - `web/app/src/app/App.test.tsx` 的 mock 对齐 `getDefaultApiBaseUrl`
    - `api/crates/control-plane/src/auth.rs` 补 `Default`
    - 补一个统一后端验证入口，至少覆盖 `fmt / clippy / test`
  - 原因：现在前端 test 红、后端 clippy 红，会持续污染后续审计结论

- [ ] `P1` 先执行 backend foundation 的前两块，不继续扩新域
  - 建议：做
  - 范围：
    - `ApiSuccess / session / router` 对齐
    - `storage-pg` 拆 `repository + mapper`
  - 原因：当前 auth/team slice 已成立，但再往 runtime/modeling/plugin 扩会把边界继续压坏

- [ ] `P1` 前端只落一条最小真实主路径
  - 建议：做
  - 推荐路径：`工作台列表 -> 应用概览 -> 进入 agentFlow shell`
  - 不建议：同时继续扩 embedded 管理、更多占位页、更多静态文档映射
  - 原因：现在前端能跑，但还不能验证真正的产品路径

- [ ] `P2` 把当前报告作为滚动文件持续更新
  - 建议：做
  - 规则：
    - 后续继续更新 `docs/qa-report/document-plan-audit.md`
    - 后续继续更新 `docs/userDocs/todolist/document-plan-audit.md`
    - 若判断失效，直接改旧结论，不追加平行旧版本
  - 原因：用户离线查看时，需要一个稳定入口，而不是不断新增同主题文档

## 我当前的明确建议

1. 下一轮先不要继续扩新功能或新模块文档。
2. 先把状态表达和验证门禁修好。
3. 然后只推进 backend foundation 前两块和前端最小主路径。
4. 等这两条都可验证后，再继续讨论 runtime / plugin / state model 的实现节奏。
