# Planner 设计方案决策

日期：2026-04-12
任务：`976da4d7 基于 spec 和 QA 结论拍板设计方案`
输入：
- `docs/agent/shareWorks/qa-baseline-review.md`
- `docs/agent/shareWorks/qa-top5.md`
- `docs/agent/qa/4b529cd9-baseline-notes.md`
- `docs/superpowers/specs/1flowbase/modules/03-workspace-and-application/README.md`
- `docs/superpowers/specs/1flowbase/2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md`
- `docs/draft/DESIGN.md`

---

## 一、回应 QA 三个关键问题

### Q1：根概览页是否严格执行"基本信息 + 发布状态 + 进入编排"单一入口？

**决策：是，严格执行。**

根概览页主区域只保留：
1. **应用头部**：应用名称、简介、标签/owner（基本信息）
2. **发布状态块**：当前状态（草稿/已发布）、最近发布时间——仅展示，不放完整编辑表单
3. **最近运行**：最多 3 行 run list，行点击继续用 drawer 展示详情——这是用户最直接需要的状态感知，保留在概览可接受
4. **单一主入口**：`进入编排` 按钮——唯一主 CTA，样式与其他次级控件有明显视觉层级差异

从根概览页移除：
- 完整 editor canvas
- API surface card
- Embedded app empty state
- 完整 publish 表单（保留 publish status 展示块）
- 页面内嵌的设计说明文字（visual baseline rules / tone chips 解释）

### Q2：节点详情允许用右侧 inspector，run 详情用 drawer？如允许，规则如何定义？

**决策：允许两种 L1 模型共存，但分界规则必须明确且不可混用。**

| L1 模型 | 触发上下文 | 具体表现 |
|---|---|---|
| **右侧抽屉（Drawer）** | Shell 层列表 context（run list、日志列表等） | 点击行 → 右侧滑入抽屉，带模态焦点约束；关闭后焦点回退触发元素 |
| **内嵌 Inspector 面板** | Canvas/Editor context（节点、连线、工具栏等） | 点击节点 → 右侧 inspector 原地更新，非模态，不中断画布上下文 |

**分界原则**：
- 判断依据是"用户当前处于哪个交互层"，不是"内容是什么"
- Shell 层 → Drawer；Canvas 层 → Inspector
- 同层内不允许混用两种模型
- 不允许在不申请的情况下引入第三种模型（页面跳转详情页、独立 modal 等）

**两种模型必须共享**：同一套颜色 token、字体层级、边框哲学、阴影、关闭/收起交互反馈。

### Q3：小屏下 editor 是降级成摘要态、保留只读态，还是彻底隐藏引导去桌面？

**决策：降级为"摘要 + 引导入口"态，不保留半残废的横向滚动画布。**

小屏（< 768px）编辑器区域做法：
- **隐藏 canvas**（含 inspector 面板、editor toolbar）
- **替换为摘要块**，展示：节点数量、最近修改时间
- **添加引导入口**：`"画布编排请在桌面端操作"` 提示 + 可选的"去桌面"按钮（demo 中为静态文案，不需要真实跳转）
- 移除 `min-width: 760px` 对 canvas 容器的强制约束

**理由**：当前半残废画布（强制横向滚动）既无法真实操作，又占用首屏大量空间，违反"overview first"原则。摘要态诚实告知用户限制，比伪造一个可用状态更好。

---

## 二、额外决策（QA 问题清单驱动）

### D4：导航 IA

**决策**：应用内左侧导航严格按已确认 spec 执行：

```
编排
应用 API
调用日志
监控报表
```

- `Overview` 不作为导航项，它是应用根路由的默认落点（应用头部展示）
- `State Data` 完全移除
- 导航项语义从 `<button>` 改为 `<a>` 元素（即使 demo 中 href 暂为 `#`）
- demo 中未实现的导航项加 `data-demo="pending"` 标记，视觉上保持完整但不做 hover 欺骗

### D5：假按钮处理策略

**决策**：不允许大面积 no-op `<button>` 继续存在。逐一处理：

| 控件 | 处理方式 |
|---|---|
| 左侧导航项（Overview 等） | 改为 `<a>` 元素，视觉上完整，href 暂为 `#` |
| Topbar CTA（Compare tokens / Open API page） | 改为次级文本链接 `<a>`，或降级为静态标签 `<span class="nav-label">` |
| `Publish draft` 按钮 | 保留为 `<button>`，但标记 `data-demo="pending"` 并加 `cursor: default`，视觉区分（非主色，边框样式） |
| `View all`（run list） | 改为 `<a class="link-text">`，href 暂为 `#` |
| `Upload static bundle` | 随页面内容一起从概览移除 |
| Editor toolbar 按钮 | 随 canvas 一起在小屏降级；桌面端保留但标记 demo 状态 |

### D6：抽屉模态契约

**决策**：必须修复，属于纯缺陷，不需要等二次设计评审。

最小模态契约要求：
1. 关闭态：drawer 必须完全退出可聚焦/可读 DOM，使用 `display: none` 而非仅 `transform`
2. 打开态：`aria-modal="true"` + `role="dialog"`；将初始焦点移入 drawer（推荐移到标题或 Close 按钮）
3. 焦点约束：Tab 只在 drawer 内部循环（最小实现：记录 firstFocusable / lastFocusable 并循环）
4. 关闭后：焦点回退到触发该 drawer 打开的 row 元素

### D7：状态语义系统

**决策**：本轮先统一已存在的 4 个状态，不新增颜色角色。

| 状态 | 含义 | 视觉规则 |
|---|---|---|
| `running` / `active` | 系统正在执行 | 主色（蓝）— 仅此语义使用主色 |
| `waiting` / `pending` | 排队或等待触发 | 黄/橙 accent |
| `failed` / `error` | 执行出错 | 红 accent |
| `healthy` / `success` | 执行成功完成 | 绿 accent |
| `draft` | 未发布草稿 | 灰，次级 |
| `selected` | 用户当前选中态 | 蓝色轮廓/背景高亮，不与 `running` 混用颜色 |

shell 列表中的状态点、canvas 节点的 badge、inspector 中的状态展示，三处必须对应同一套颜色语义，不能各自发明。

### D8：移动端首屏优先级

**决策**：< 768px 时，主区域内容优先级从上到下：

1. 应用头部（名称 + 状态）
2. 发布状态 + `进入编排` CTA
3. 最近运行（最多 3 行，行点击打开 drawer）
4. 编辑器摘要块（节点数 + 引导文案）

左侧导航在小屏折叠为顶部可收起区域或完全隐藏，主工作区占全宽。

---

## 三、本轮变更范围边界

### 本轮 demo 修改范围（批准）

| 改动 | 涉及文件 |
|---|---|
| 移除概览页多余内容（canvas、API card、embed card、设计说明文字） | `tmp/demo/index.html` |
| 简化 publish card 为纯展示 | `tmp/demo/index.html` |
| 更新左侧导航文案和元素类型 | `tmp/demo/index.html` |
| 修复抽屉模态契约 | `tmp/demo/index.html`、`tmp/demo/styles.css`、`tmp/demo/script.js` |
| 移动端首屏优先级重排 + canvas 摘要替换 | `tmp/demo/styles.css`、`tmp/demo/index.html` |
| 假按钮降级处理 | `tmp/demo/index.html` |
| 状态语义颜色统一 | `tmp/demo/styles.css` |

### 本轮 demo 修改范围（不批准，留后续）

| 改动 | 原因 |
|---|---|
| 真实多页面路由模拟（点击导航切换整个内容区） | 需要更大 JS 架构调整，会引入新风险；当前 demo 验证目标是 overview 形态，不是多页导航 |
| WF Visual Sans Variable 字体接入 | 字体资源需要另外处理，不是本轮 demo 结构验证的主要矛盾 |
| 完整 Editor canvas 交互（工具栏真实行为） | 超出当前验证目标范围 |

### DESIGN.md 本轮增补内容（批准，临时）

见 `docs/agent/shareWorks/approved-change-list.md` 中的 DESIGN.md 条目。

---

## 四、对 worker 的注意事项

1. 移除概览页内容时，注意 `script.js` 中是否有关联数据需要同步清理（避免悬挂引用）
2. 修复抽屉时，打开前必须先 `display: block`（才能 transition），关闭后必须 `display: none`（才能退出交互树）；两步操作需要配合 `transitionend` 事件
3. 导航项改为 `<a>` 元素后，需确认相关 CSS 选择器仍然匹配（如 `.sidebar a` vs `.sidebar button`）
4. 状态颜色变更需要在列表 dot、节点 badge、inspector 三处同步调整

---

## 五、后续建议（交给 Codex 判断是否启动）

1. 完成本轮 demo 修改后，做一次桌面 + 移动端截图对比（验证改动效果）
2. 如果截图验证通过，再讨论是否补充多页导航模拟
3. skill 演进（`frontend-development` reference 补充）可以在 demo 二轮确认后进行，不急于本轮
