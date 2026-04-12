# 文档计划审计待确认

日期：`2026-04-13 01`

## 建议优先级

- [ ] `P0` 把 `docs/superpowers` 的模块状态改成双轨，并补最小追踪矩阵
  - 建议：做
  - 最小范围：
    - `docs/superpowers/specs/1flowse/modules/README.md` 区分 `spec_status` 和 `implementation_status`
    - 当前滚动 QA 报告补 `模块 -> spec -> plan -> code -> verification -> next action` 追踪表
  - 原因：当前 `03-08` 模块的文档状态明显超前于代码状态，已经影响排期和 QA 口径

- [ ] `P0` 修复当前验证门禁
  - 建议：做
  - 最小范围：
    - `web/app/src/app/App.test.tsx` 改为部分 mock，或补齐 `getDefaultApiBaseUrl`
    - `api/crates/control-plane/src/auth.rs` 为 `AuthenticatorRegistry` 补 `Default`
    - 后续验证报告继续明确区分“沙箱受限”与“真实代码失败”
  - 原因：现在前端 test 红、后端 clippy 红，会持续污染后续审计结论

- [ ] `P1` 先执行 backend foundation 的前两块，不继续扩新域
  - 建议：做
  - 范围：
    - `ApiSuccess / public auth / session / router` 对齐
    - `storage-pg` 拆 `repository + mapper`
  - 原因：当前 auth/team slice 已成立，但再往 runtime/modeling/plugin 扩会把基础边界继续压坏

- [ ] `P1` 前端只落一条最小真实主路径
  - 建议：做
  - 推荐路径：`工作台列表 -> 应用概览 -> 进入 agentFlow shell`
  - 不建议：同时继续扩 embedded 管理、更多占位页、更多静态文档映射
  - 原因：现在前端能跑，但还不能验证真正的产品路径

- [ ] `P2` 固定当前两个文件作为唯一滚动审计入口
  - 建议：做
  - 规则：
    - 后续继续更新 `docs/qa-report/document-plan-audit.md`
    - 后续继续更新 `docs/userDocs/todolist/document-plan-audit.md`
    - 若判断失效，直接改旧结论，不追加平行旧版本
  - 原因：现在滚动入口已经建立，下一步重点是保持唯一入口，不让报告再次分叉

## 我当前的明确建议

1. 下一轮先不要继续扩新功能或新模块文档。
2. 先把文档状态表达、追踪索引和验证门禁修好。
3. 然后只推进 backend foundation 前两块和前端最小主路径。
4. 等这两条都可验证后，再继续讨论 runtime / plugin / state model 的实现节奏。
