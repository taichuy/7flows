# QA Baseline Review

日期：2026-04-12  
任务：`4b529cd9 审查 demo 并输出严格问题清单`  
评审标准：`frontend-development` + `frontend-logic-design`

## 范围

- `tmp/demo/index.html`
- `tmp/demo/styles.css`
- `tmp/demo/script.js`
- `tmp/demo/desktop.png`
- `tmp/demo/mobile.png`
- `docs/draft/DESIGN.md`
- `docs/superpowers/specs/1flowbase/2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md`

## 结论

当前 demo 可以继续作为方向讨论材料，但**不能进入“默认视觉基线候选”阶段**。阻塞点不是阴影、圆角或色值，而是 5 个结构问题：

1. 页面边界失真，基线页承担了过多任务域
2. 大量可见控件没有结果，交互契约是假的
3. 抽屉详情层不是合格的 L1 模型
4. 状态语义没有在 shell 与 editor 间统一
5. 移动端没有做优先级重排

如果不先纠正这些问题，继续微调视觉 token，只是在打磨一套错误的页面语法。

## 问题清单

| # | 严重度 | 类型 | 位置 | 证据 | 为什么是问题 |
|---|---|---|---|---|---|
| 1 | High | IA 边界 | `tmp/demo/index.html:16-60` `96-408` `docs/superpowers/specs/1flowbase/2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md:18-19` `51-60` `64-82` | 单页同时包含设计说明、概览、发布、API、空态、Editor UI | spec 说本轮先用 demo 验证视觉方向，不是冻结所有细节；当前页面却把多个任务域揉成一个“展示板”，无法验证任何单页语法是否成立。 |
| 2 | High | 交互契约 | `tmp/demo/index.html:29-33` `76-92` `138` `267-269` `290-297` `tmp/demo/script.js:107-155` | 多数主按钮无行为，只有 run row、node、drawer close、compact toggle 有响应 | 基线 demo 不应示范“按钮可以没有结果”。这会把错误交互语言固化到后续实现里。 |
| 3 | High | Drawer 契约 | `tmp/demo/index.html:412-458` `tmp/demo/styles.css:771-792` `tmp/demo/script.js:73-119` | 关闭态仍在 DOM 交互树中；打开态缺失焦点管理和模态语义 | 抽屉是当前页面唯一较明确的 L1 模型，但它本身是坏的。继续沿用只会把错误下钻模式扩散。 |
| 4 | High | 状态语义 | `tmp/demo/index.html:41-45` `54-59` `195` `236` `281-283` `328-365` `386-439` `tmp/demo/styles.css:234-270` `465-482` `685-694` `tmp/demo/script.js:1-71` `docs/superpowers/specs/1flowbase/2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md:39` `75-81` `90-99` | type、status、selection、meta tag 共用一套彩色语法 | spec 强调状态色要表达系统真相，shell 与 editor 共享状态逻辑；当前页面却让颜色同时表示节点种类、等待、选中和文案标签，语义完全冲突。 |
| 5 | High | 响应式 / mobile-first | `tmp/demo/styles.css:869-914` `tmp/demo/mobile.png` | 390px 首屏被 sidebar 与说明块占满；Editor 仍需横向滚动 | 这不是移动端重排，只是把桌面评审板纵向堆叠。默认基线若在手机首屏看不到核心状态和入口，就不具备推广价值。 |
| 6 | Medium | L1 规则不统一 | `tmp/demo/index.html:141-185` `321-368` `372-405` `tmp/demo/script.js:107-149` | run row 点击开 drawer，node 点击改 inspector，其它卡片没有稳定详情入口 | 同一页存在至少两种不同 L1 详情模型，但没有解释各自边界，用户无法预测点击结果。 |
| 7 | Medium | 文案层级污染 | `tmp/demo/index.html:20-24` `36-60` `66-72` `399-404` | “Three rules”“Tone chips”“Sub-spec note”等设计说明直接出现在产品 UI | demo 本应模拟用户工作界面，这些内容却更像给评审者看的解释文本，污染了产品级信息层级。 |
| 8 | Medium | 控件语义 | `tmp/demo/index.html:29-33` `76-80` `138` | 导航与跨页动作都用 `button` 表达 | 即便以后接上真实跳转，这类目标也更接近路由/链接语义，而不是统一当成动作按钮。 |

## 当前一致性矩阵

| 区域 | L0 | L1 | L2 | L3 |
|---|---|---|---|---|
| Sidebar | 路由骨架与设计说明混排，不是纯 L0 内容 | 无 | 视觉上像可跳转，实际 no-op | 无 |
| Hero + Metrics | 有概览摘要 | 无 | 无 | 无 |
| Recent flow runs | 有摘要列表 | 行点击打开 drawer | `View all` 看似去 L2，实际 no-op | 无 |
| Publish contract | 不该在根概览页承载完整管理表单 | 无 | 表单本质更接近 L2 管理 | `Publish draft` 看似执行，实际 no-op |
| API surface | 只应是概览切片 | 无 | `Open API page` 看似 L2，实际 no-op | 无 |
| Embedded app empty state | 可作为状态摘要 | 无 | `Upload static bundle` 更接近 L2 | 无 |
| Editor canvas + inspector | 不应直接挤进根概览页 | 节点详情走 inspector | 完整编排应是独立 L2 | 工具栏动作看似执行，实际 no-op |

## 目标一致性矩阵

| 区域 | L0 | L1 | L2 | L3 |
|---|---|---|---|---|
| 根概览页 | 应用状态、最近活动、主入口 | 如需详情，统一一种详情模型 | 进入编排/API/日志等独立页 | 不承载复杂执行 |
| 编排页 | 画布状态摘要、最近变更 | 节点详情使用单一聚焦模型 | 编辑、布局、调试在本页完成 | 发布、运行等明确执行动作 |
| API 页 | 协议摘要 | 样例或 callback 详情按需展开 | 全量文档与配置 | 鉴权、测试等明确动作 |
| 运行页 | 统计摘要 | 单条运行详情 | 全量日志与筛选 | 重试、导出等明确动作 |

## 修正方向

| # | 改动 | 目标层级 | 涉及文件 | 说明 |
|---|---|---|---|---|
| 1 | 先拆页面边界，再讨论视觉润色 | L0-L3 | `tmp/demo/index.html` | 把根概览、编排、API、运行等任务域分开；不要再用单页验证所有东西。 |
| 2 | 清除所有假交互 | 全层 | `tmp/demo/index.html` `tmp/demo/script.js` | 每个主按钮都必须有结果，否则降级成静态元素。 |
| 3 | 把 drawer 补成合格交互层 | L1 | `tmp/demo/index.html` `tmp/demo/styles.css` `tmp/demo/script.js` | 关闭态退出交互树，打开态管理焦点和返回点。 |
| 4 | 定义统一状态字典 | 横跨 shell/editor | `tmp/demo/index.html` `tmp/demo/styles.css` `tmp/demo/script.js` | 分离 `kind`、`status`、`selection`、`meta`，统一颜色语义。 |
| 5 | 统一详情模型 | L1 | `tmp/demo/index.html` `tmp/demo/script.js` | 明确哪些内容使用 drawer，哪些内容使用 inspector，且同类对象行为一致。 |
| 6 | 重做 mobile-first 排序 | L0-L2 | `tmp/demo/styles.css` `tmp/demo/mobile.png` | 先定义 390px 首屏该看什么，再决定剩余内容如何折叠或延后。 |
| 7 | 把设计解释文案移出产品 UI | L0 | `tmp/demo/index.html` | “rules / tone chips / sub-spec note” 应留在评审文档或旁注，不应占用用户界面。 |

## 必须保留的方向

1. `Shell Layer + Editor UI Layer` 仍应被视为同一产品系统的两个表达层，而不是两套视觉语言。证据：`docs/superpowers/specs/1flowbase/2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md:34-39`
2. `Editor UI` 比壳层更紧、更准、更高密度，这个方向应保留，但必须共享同一状态映射。证据：`docs/superpowers/specs/1flowbase/2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md:88-99`
3. `DESIGN.md` 提供的是视觉母本，不应整页照搬到产品界面；只吸收适合工具型控制台的部分。证据：`docs/draft/DESIGN.md:5-15` `81-83` 与 `docs/superpowers/specs/1flowbase/2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md:64-82`
4. run list 走 L1 详情这个方向可以保留，但必须先把 drawer 契约修正确。证据：`tmp/demo/index.html:141-185` `412-458`

## 基线验收门槛

只有满足以下条件，才建议把 demo 继续往“默认基线候选”推进：

1. 根页只回答一个清晰问题，不再混装设计说明、API、发布管理和完整 Editor。
2. 所有主按钮都具备真实结果，或明确降级为非交互元素。
3. 抽屉在关闭态不可聚焦，打开态具备最小模态与焦点管理。
4. shell 与 editor 对 `waiting / failed / running / selected / healthy` 使用一套可复述的状态语义。
5. 390px 首屏优先展示应用状态与主入口，而不是完整 sidebar 说明块。
6. 若手机不支持直接编辑画布，就明确降级为摘要态或跳转入口，而不是保留横向滚动画布。

## 给 planner / worker 的执行建议

不要先修颜色和圆角，先拍板下面 4 件事：

1. 根概览页只保留哪些内容。
2. 哪些区域必须从根页拆走。
3. 列表详情与节点详情是否允许两种 L1 模型并存；如果允许，边界是什么。
4. 状态语义表如何统一到 shell 与 editor 两套表达层。
