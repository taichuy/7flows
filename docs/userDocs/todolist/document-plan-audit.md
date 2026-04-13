# 文档计划审计待办

更新时间：`2026-04-14 04`

说明：本文件承接 `docs/qa-report/document-plan-audit.md` 的后续讨论。后续继续围绕这条议题沟通时，直接更新本文件，不重复新建同主题 todo。

## 本轮最新结论

- 工程门禁当前不是主要问题：
  - `pnpm --dir web lint`、`test`、`build` 通过
  - `style-boundary` 在允许本地端口访问后通过
  - `node scripts/node/verify-backend.js` 在允许本机 `Postgres/Redis` 访问后通过
- 当前最需要治理的是两个“真相层”：
  - 文档真相层：`docs/superpowers` 入口失真、类型混放、生命周期不清
  - 前端语义真相层：正式 `web` 仍保留 `bootstrap/demo/placeholder` 语义
- `docs/superpowers` 已经触发目录压力：
  - `docs/superpowers/specs/1flowse` 顶层文件：`22`
  - `docs/superpowers/plans` 文件：`16`
  - 超过 `1500` 行的 plan：`2`
- 模块 `completed` 口径已经不可信：
  - `03`：壳层阶段
  - `04`：页面占位
  - `06`：骨架阶段
  - `08`：骨架阶段
- 前端当前最明显的语义泄漏点：
  - `web/app/src/app-shell/AppShellFrame.tsx`：`1Flowse Bootstrap`
  - `web/app/src/features/home/pages/HomePage.tsx`：`Workspace Bootstrap`
  - `web/app/src/routes/route-config.ts`：`bootstrap-allow`
  - `web/app/src/features/embedded-apps/pages/EmbeddedAppDetailPage.tsx`：`placeholderManifest`
  - `web/app/src/features/embedded-runtime/pages/EmbeddedMountPage.tsx`：`bootstrap-application` / `bootstrap-team`
  - `web/app/src/app/_tests/app-shell.test.tsx`：测试仍在固化上述语义
- shared packages 测试仍有明显缺口：
  - `web/packages` 总数：`8`
  - 带 `_tests/` 的 package：`2`
  - `passWithNoTests` 的 package：`6`
- `docs/userDocs` 仍然只有当前这一个 todo 文件，还不是用户侧真相层

## 下一轮优先级

| 优先级 | 待办 | 预期结果 | 备注 |
| --- | --- | --- | --- |
| `P0` | 定义 `specs / plans / qa-report / userDocs / modules` 的职责矩阵 | 文档类型不再混写 | 先统一旧口径 |
| `P0` | 给 `docs/superpowers/plans` 增加 `active / completed / archived` 生命周期 | 下一轮活动入口更稳定 | 需要整理历史 plan |
| `P0` | 把模块总览改成 `design / implementation / verification` 三轴状态，并附代码证据链接 | 模块成熟度不再失真 | 需要逐模块回填 |
| `P0` | 做一轮前端语义收口，清理 `bootstrap/demo/placeholder` 文案、常量和测试断言 | 页面、测试、文档回到同一真相层 | 不建议零散修，建议按专题处理 |
| `P0` | 把验证结果拆成 `static / sandbox-safe / local-service / manual` 四层说明 | QA 结论更诚实 | 需要补环境说明 |
| `P1` | 为 `web/packages` 建“补测或显式豁免”清单 | `passWithNoTests` 不再和真实覆盖混写 | 是 shared package 治理项 |
| `P1` | 设计 `docs/userDocs` 最小信息架构 | 用户侧真相层开始成形 | 先结构，后写正文 |
| `P1` | 在治理回合结束后选择前端路线：`正式控制台` 或 `继续 prototype` | 前端路线不再摇摆 | 需要产品优先级拍板 |

## 建议中的最小 `docs/userDocs` 结构

- 项目现状页
- 模块进度矩阵页
- 状态 / 术语说明页
- 主题滚动 todo 页

## 待决策事项

1. 前端在治理回合后走哪条路：
   - `A`：正式控制台，优先补 `01` 的最小用户主路径
   - `B`：继续 prototype，但隐藏未完成入口，不再暴露“已完成”心智
2. 模块总览是否立即停止使用单一 `completed` 口径：
   - 建议：立即停止

## 已废弃的旧口径

- 废弃：“`style-boundary` 和后端统一验证当前仍是受限结论”
  - 新结论：提权复跑后，两者当前都已验证通过
- 废弃：“前端测试绿灯可以近似代表正式控制台就绪”
  - 新结论：当前绿灯更多说明工程门禁初步可用，不代表产品语义已完成
- 废弃：“继续新增 spec 会比先治理文档入口更有价值”
  - 新结论：当前先治理入口和状态语义，收益更高
- 废弃：“模块讨论完成可以继续写 `completed`”
  - 新结论：必须拆成三轴状态

## 下一次讨论时最值得先拍板的问题

1. 是否先做整轮治理回合，并冻结新增顶层 spec/plan。
2. 前端语义收口是否作为独立专题处理，而不是零散修文案。
3. `docs/userDocs` 的第一页先写“项目现状”还是“模块矩阵”。

## 讨论记录

- `2026-04-14 03`：旧版本把 `style-boundary` 和后端统一验证都记为受限结论。
- `2026-04-14 04`：基于本轮重跑结果更新为“工程门禁基本成立，主要问题转为文档真相层和前端语义真相层”，并新增前端语义收口与验证四层说明。
