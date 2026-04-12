# QA Final Review

日期：2026-04-12  
任务：`7a084b64`

## 审核范围

- `docs/agent/shareWorks/planner-decision.md`
- `docs/agent/shareWorks/planner-design-decisions.md`
- `docs/agent/shareWorks/approved-change-list.md`
- `docs/agent/shareWorks/worker-change-summary.md`
- `docs/draft/DESIGN.md`
- `tmp/demo/index.html`
- `tmp/demo/styles.css`
- `tmp/demo/script.js`

## 1. 是否回到 UI 规则主题

**是，已经明显回到 UI 规则主题。**

证据：
- demo 不再是单页拼盘，而是拆成 `overview / orchestration / api / logs / monitoring` 五个明确视图，页面边界基本回正。见 `tmp/demo/index.html:85-545`
- 根概览页已经收敛到基本信息、发布状态、健康摘要和单一主入口，没有再把完整画布、API 正文、发布表单塞进来。见 `tmp/demo/index.html:86-214`
- L1 规则已经分流为两套固定模型：日志详情走 drawer，节点详情走 inspector。见 `tmp/demo/index.html:238-305`, `549-615`, `tmp/demo/script.js:168-200`, `264-286`, `308-376`
- `DESIGN.md` 已经从“视觉灵感稿”变成“工作区执行规则”，优先顺序也明确改成：边界 -> L1 -> 状态 -> token。见 `docs/draft/DESIGN.md:33-180`

结论：这次改动不是单纯换皮，核心确实转回了信息架构、交互边界和状态语义。

## 2. 是否存在阻塞性问题

**有，剩 1 个阻塞性问题。**

### 阻塞项：移动端首屏优先级仍未真正落地

问题：
- 小屏下虽然隐藏了桌面画布并提供 `mobile-stage`，但整体布局仍然是 `sidebar` 在前、`workspace` 在后。见 `tmp/demo/styles.css:737-755`, `790-811`
- `sidebar` 在 390px 下仍完整保留应用头、状态卡和四个导航按钮，且没有折叠、隐藏或后置。见 `tmp/demo/index.html:17-83`, `tmp/demo/styles.css:791-811`
- 这意味着首屏仍有较大概率先看到侧栏内容，而不是当前页面标题和主动作。

为什么算阻塞：
- `DESIGN.md` 明确要求 390px 首屏优先展示“应用状态 + 当前页面标题 + 主入口/最小动作”，并明确禁止首屏先被无关导航占满。见 `docs/draft/DESIGN.md:156-166`
- 拍板稿也明确要求小屏下主区域优先，左侧导航折叠或隐藏。见 `docs/agent/shareWorks/planner-design-decisions.md:121-130`

建议：
- 小屏下至少要满足其一：`sidebar` 后置、折叠为可展开区域、或默认隐藏为单独入口。
- 在 390px 宽下，用户进入页面后无需先穿过完整侧栏，就能直接看到当前页标题和主动作。

## 3. 规则质量是否足够让 Codex 复用

**基本足够，已经达到“可复用规则稿”的水平。**

理由：
- `DESIGN.md` 现在不是抽象口号，而是有明确约束的执行规则：任务域边界、L1 模型、状态字典、no-op 按钮禁令、移动端优先级，都能直接指导实现。见 `docs/draft/DESIGN.md:33-180`
- 当前 demo 也已经把这些规则大部分落到了真实结构上，不再需要 Codex 每次从零发明页面语法。见 `tmp/demo/index.html:85-615`

残留不足：
- 拍板稿曾要求导航项从 `<button>` 改成 `<a>`，当前实现仍使用带真实结果的按钮。见 `docs/agent/shareWorks/planner-design-decisions.md:67-81`, `tmp/demo/index.html:45-81`
- 这不是当前阻塞项，因为按钮现在确实产生可验证结果，也符合 `DESIGN.md` 对“真实按钮”的定义。见 `docs/draft/DESIGN.md:128-154`
- 但它说明“导航语义到底优先链接还是优先视图切换按钮”这件事，文档和实现还没有完全统一。

## 4. demo 是否达到令人满意的标准

**桌面端基本达到，整体还没有完全达到。**

满意的部分：
- 页面不再混答多个任务域问题。
- 假按钮基本清掉了，静态 HTML 只剩 7 个真实按钮入口。
- drawer 最小模态契约已经成立：`hidden`、`aria-modal`、初始焦点、Escape、Tab 约束、焦点回退、`inert` 都在。见 `tmp/demo/index.html:549-615`, `tmp/demo/script.js:308-376`
- 状态语义已基本统一，节点类型和运行状态不再共用一套高饱和色。见 `tmp/demo/styles.css:440-496`, `tmp/demo/script.js:157-165`, `213-255`

还不满意的部分：
- 移动端“主内容优先”还停留在规则层，没有完全变成真实布局结果。

## 5. 结论

**结论：有条件通过**

通过条件只有一条：
- 修正小屏首屏优先级，让 390px 宽进入页面时先看到当前页标题和主动作，而不是完整侧栏。

完成这条后，我认为这份 demo 就可以作为本轮 UI 规则收口样本继续往下使用。

## 残余风险

1. 本次终审基于代码与结构检查，未做真实浏览器点击回归。
2. `desktop.png` / `mobile.png` 尚未重生成，视觉结果还没有新的截图证据。
3. 导航元素语义目前是“真实按钮切视图”而不是“链接跳路由”，后续如果转成真实多页结构，需要再统一一次语义口径。
