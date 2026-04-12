# 文档计划审计待确认

日期：`2026-04-13 05`

## 建议优先级

- [ ] `P0` 统一 `docs/superpowers` 真相层
  - 建议：做
  - 最小范围：
    - `docs/superpowers/specs/1flowse/README.md` 补齐缺失规格入口
    - `docs/superpowers/specs/1flowse/modules/README.md` 拆成 `spec_status / implementation_status / verification_status`
    - 已执行计划统一补 `execution_state`，或把已完成步骤同步勾选
  - 原因：现在 `README / modules / plan / code` 没有指向同一套当前事实

- [ ] `P0` 清理 `docs/userDocs/project-memory` 的并行当前态
  - 建议：做
  - 当前优先处理：
    - `docs/userDocs/project-memory/2026-04-12-design-system-direction.md`
    - `docs/userDocs/project-memory/2026-04-12-auth-team-backend-plan-stage.md`
    - `docs/userDocs/project-memory/2026-04-12-auth-team-backend-implemented.md`
  - 处理原则：
    - 旧 current-state 直接标废弃、覆盖，或显式写明已被哪条新事实替代
  - 原因：`docs/userDocs` 是固定优先入口，过期 current-state 会先污染判断

- [ ] `P0` 修复当前验证门禁
  - 建议：做
  - 最小范围：
    - `web/app/src/app/App.test.tsx` 改为部分 mock，或补 `getDefaultApiBaseUrl`
    - `api/crates/control-plane/src/auth.rs` 为 `AuthenticatorRegistry` 补 `Default`
    - 后续 QA 报告继续明确区分“沙箱受限失败”和“真实代码失败”
  - 原因：当前前端 `test` 红、后端 `clippy` 红，会持续污染每轮审计

- [ ] `P1` 增加轻量文档一致性守卫
  - 建议：做
  - 最小范围：
    - 自动检查 `docs/superpowers/specs/1flowse/README.md` 是否覆盖同级规格
    - 自动检查 `modules/README.md` 是否仍只有单轨状态
    - 自动检查同一 scope 下是否出现互相冲突的 `project-memory` current-state
  - 原因：只靠人工审计修一次，后续还会继续漂移

- [ ] `P1` 拆分超大计划文档，并给 `specs/1flowse` 预留收纳方案
  - 建议：做
  - 最小范围：
    - 拆分 `docs/superpowers/plans/2026-04-11-fullstack-bootstrap.md`
    - 拆分 `docs/superpowers/plans/2026-04-12-auth-team-access-control-backend.md`
    - 为 `docs/superpowers/specs/1flowse` 增加主题子目录或归档规则
  - 原因：规格目录已到 `15` 文件边界，计划文档已经长到 `1911` / `2967` 行

- [ ] `P1` backend foundation 只推进前两块
  - 建议：做
  - 范围：
    - `public auth / session / router` 对齐
    - `storage-pg` 拆 `repository + mapper`
  - 原因：当前 auth/team slice 已成立，但继续叠加 runtime/plugin 会把结构压回旧骨架

- [ ] `P1` 前端只补一条最小真实主路径并吸收视觉基线
  - 建议：做
  - 推荐路径：`工作台列表 -> 应用概览 -> 进入 agentFlow shell`
  - 同步要求：
    - 壳层不再停留在 `Bootstrap` 语义
    - 至少落一层最小视觉基线
  - 不建议：
    - 继续同时扩更多 placeholder 页
    - 在 placeholder 阶段先做复杂拆包工程
  - 原因：现在前端仍只能验证壳层，不能验证真实产品路径

- [ ] `P2` 给仓库审计脚本补排除规则
  - 建议：做
  - 最小范围：
    - 结构扫描默认排除 `docker/volumes/postgres`
    - 同时排除 `.turbo`、`node_modules`、`target`
  - 原因：本轮目录扫描已被受限数据卷权限打断一次，后续应该把这类噪声前置规避

- [ ] `P2` 继续维持唯一滚动入口，不新增平行版本
  - 建议：做
  - 规则：
    - 继续更新 `docs/qa-report/document-plan-audit.md`
    - 继续更新 `docs/userDocs/todolist/document-plan-audit.md`
    - 旧判断失效时直接覆盖，不新增兄弟文件
  - 原因：当前入口已经建立，下一步重点是保持唯一来源

## 我当前的明确建议

1. 下一轮先不要继续扩新域功能，也不要再新增平行文档。
2. 先把 `docs/superpowers` 和 `docs/userDocs` 的当前真相统一掉。
3. 同步修掉前端测试 mock 和后端 `clippy` 门禁。
4. 然后拆超大计划文档，并补轻量文档一致性守卫。
5. 最后只推进 backend foundation 前两块和前端一条最小真实主路径。
