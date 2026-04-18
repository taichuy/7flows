# Task 4b529cd9 Baseline Notes

日期：2026-04-12
状态：working notes

## Skills used

- `brainstorming`
  - 仅用于先读上下文、明确评估边界，不进入实现。
- `frontend-development`
  - 用于检查用户可见交互契约是否稳定，避免把实现状态和页面语义混写。
- `frontend-logic-design`
  - 用于按 L0 / L1 / L2 / L3 深度模型审查页面，并输出一致性矩阵。

## Files read

- `.memory/AGENTS.md`
- `AGENTS.md`
- `docs/draft/DESIGN.md`
- `docs/superpowers/specs/1flowbase/README.md`
- `docs/superpowers/specs/1flowbase/2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md`
- `docs/superpowers/specs/1flowbase/modules/03-workspace-and-application/README.md`
- `docs/superpowers/specs/1flowbase/modules/04-chatflow-studio/README.md`
- `docs/superpowers/specs/1flowbase/modules/06-publish-gateway/README.md`
- `tmp/demo/index.html`
- `tmp/demo/styles.css`
- `tmp/demo/script.js`
- `tmp/demo/desktop.png`
- `tmp/demo/mobile.png`

## Raw interaction inventory

| 区域 | 组件 | 视觉上像什么 | 实际行为 |
|---|---|---|---|
| Sidebar | `Overview / AgentFlow / API Docs / Run Logs / State Data` | 一级导航 | no-op |
| Topbar | `Compare tokens / Open API page / Publish draft` | CTA / 跳转 / 执行 | no-op |
| Topbar | `Compact mode` | 视图模式切换 | 仅切 padding / node width |
| Run list | 3 行 run | L1 列表详情 | 打开 drawer |
| Run list | `View all` | L2 全量页入口 | no-op |
| Publish card | 表单字段 | L2 管理 | 仅静态可编辑 |
| Empty state | `Upload static bundle` | L2 管理入口 | no-op |
| Editor toolbar | `Select / Pan / Add node / Auto layout / Fit view` | 画布操作 | no-op |
| Canvas nodes | 4 个节点 | L1 结构详情 | 更新右侧 inspector |
| Drawer | `Close` | 关闭详情 | 可关闭，但关闭态仍可聚焦 |

## Raw findings backlog

1. 抽屉焦点模型不成立，属于纯缺陷。
2. 假按钮过多，页面在“交互演示”和“静态陈列”之间摇摆。
3. 页面边界没有按产品 spec 切开，Overview 和 AgentFlow 混成一页。
4. 小屏策略是把桌面直接纵向堆叠，不是重新排优先级。
5. 状态语义没有收敛：类型色、选择态、运行态、健康态都在抢同一套颜色语言。
6. 设计说明文字泄漏到产品表面，影响真实信息密度判断。
7. 导航和跨页动作都写成按钮，语义上也不干净。
8. 视觉母本与工具型收敛版的边界还没讲清楚，字体是一个显眼信号。

## Planner-facing questions

1. 根概览页是否严格执行“基本信息 + 发布状态 + 进入编排”单一入口？
2. 节点详情是否允许用右侧 inspector，而 run 详情用 drawer？如果允许，规则要如何定义？
3. 小屏下 editor 是降级成摘要态，还是保留只读态，还是彻底隐藏并引导去桌面？
