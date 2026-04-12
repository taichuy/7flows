# 文档计划审计待确认

日期：`2026-04-13 04`

## 建议优先级

- [ ] `P0` 统一文档真相层
  - 建议：做
  - 最小范围：
    - `docs/superpowers/specs/1flowse/README.md` 补齐缺失规格入口
    - `docs/superpowers/specs/1flowse/modules/README.md` 拆成 `spec_status / implementation_status / verification_status`
    - 已落地 `plan` 同步勾选，或补统一 `execution_state`
    - 处理已过时或互相冲突的 `project-memory`
  - 当前优先要处理的冲突：
    - `docs/userDocs/project-memory/2026-04-12-design-system-direction.md`
    - `docs/userDocs/project-memory/2026-04-12-auth-team-backend-plan-stage.md`
    - `docs/userDocs/project-memory/2026-04-12-auth-team-backend-implemented.md`
  - 原因：现在 `spec / module / plan / project-memory / code` 不是同一套真相，离线看文档最容易误判

- [ ] `P0` 修复当前验证门禁
  - 建议：做
  - 最小范围：
    - `web/app/src/app/App.test.tsx` 改为部分 mock，或补 `getDefaultApiBaseUrl`
    - `api/crates/control-plane/src/auth.rs` 为 `AuthenticatorRegistry` 补 `Default`
    - QA 报告继续明确区分“沙箱受限”和“真实代码失败”
  - 原因：当前前端 `test` 红、后端 `clippy` 红，会持续污染每一轮审计结论

- [ ] `P1` 增加一层文档一致性守卫
  - 建议：做
  - 最小范围：
    - 自动检查 `docs/superpowers/specs/1flowse/README.md` 是否覆盖同级 spec 文件
    - 自动检查 `modules/README.md` 是否仍在使用单轨状态，或缺少实现 / 验证维度
    - 自动提醒同一 scope 下是否出现互相冲突的“当前状态” `project-memory`
  - 原因：只靠人工审计修一次，后续仍会继续漂移；需要把问题前移到提交前发现

- [ ] `P1` backend foundation 只推进前两块
  - 建议：做
  - 范围：
    - `ApiSuccess / public auth / session / router` 对齐
    - `storage-pg` 拆 `repository + mapper`
  - 原因：当前 auth/team slice 已成立，但 runtime/modeling/plugin 继续叠加会把边界继续压回旧结构

- [ ] `P1` 前端只补一条最小真实主路径并吸收基线
  - 建议：做
  - 推荐路径：`工作台列表 -> 应用概览 -> 进入 agentFlow shell`
  - 同步要求：壳层不再停留在 `Bootstrap` 语义，至少落一层最小视觉基线
  - 不建议：同时继续扩 `Embedded Apps` 管理面、更多占位页、更多静态页映射
  - 原因：现在前端还只能验证壳层，不能验证真实产品路径

- [ ] `P2` 给 `docs/superpowers/specs/1flowse` 预留收纳方案
  - 建议：做
  - 触发原因：当前同级文件数已经到 `15`
  - 方向：
    - 按主题分子目录，或
    - 保留同级文件但新增更强的总索引与归档规则
  - 原因：下一份 spec 再加进来，就会踩到目录管理上限

- [ ] `P2` 在主路径落地后再处理前端拆包
  - 建议：做
  - 触发原因：`pnpm build` 已出现 `877.94 kB` 主 chunk warning
  - 建议节奏：
    - 先完成一条真实路径
    - 再做 route-level split 或 `manualChunks`
  - 原因：现在就做性能工程偏早，但这个 warning 也不该长期挂着不管

- [ ] `P2` 继续维持唯一滚动入口，不新增平行版本
  - 建议：做
  - 规则：
    - 后续继续更新 `docs/qa-report/document-plan-audit.md`
    - 后续继续更新 `docs/userDocs/todolist/document-plan-audit.md`
    - 若旧判断失效，直接覆盖旧结论，不追加兄弟文件
  - 原因：当前入口已经建立，下一步重点是保持唯一来源

## 我当前的明确建议

1. 下一轮先不要继续扩新功能或新增规格文档。
2. 先把文档真相层和验证门禁修干净。
3. 紧接着加一层轻量文档一致性守卫，避免下次再靠人工补漏。
4. 然后只推进 backend foundation 前两块和前端一条最小真实主路径。
5. `docs/userDocs` 结构先保持稳定，不再做目录级重写，只处理过时或冲突内容。
