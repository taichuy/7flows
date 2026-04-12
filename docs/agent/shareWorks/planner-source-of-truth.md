# 单一事实源声明

**日期：2026-04-12（最后更新：planner3，任务 3fc047c7）**
**状态：已拍板**

---

## 1. 唯一权威规则文档

从现在起，**唯一权威规则文档**是：

```
docs/draft/DESIGN.md
```

含义：
- 所有 UI 结构、视觉执行规则、交互边界、状态语义、移动端优先级判断，统一以这份文档为准。
- 后续实现、复验、讨论如与其他文档冲突，直接以 `DESIGN.md` 覆盖。
- 如果 `DESIGN.md` 没写，不允许 worker 自行从旧文档补出新规则；应回到 lead / planner 补裁决。

---

## 2. DESIGN.md 当前覆盖范围（2026-04-12 重建版）

重建后的 `DESIGN.md` 包含两层，**都是权威内容**：

**Part 1 · 视觉执行规则**（本次新增，解决 qa-final-review 阻塞项 #1 和 #4）
- 总体方向
- 色彩系统（主色 `#146ef5` + 6 个状态色变量 + 完整中性色 token）
- 排版系统（8 个固定层级，含字号 / 字重 / 颜色）
- 间距系统（4px 基础单位，7 档命名变量）
- 圆角三档（4px / 6px / 8px）
- 阴影两档（shadow-card / shadow-float）
- Shell Layer 组件 Recipe：Button / Card / Sidebar Nav / Drawer / Inspector / Badge
- Editor UI Layer 子规范（NodeCard 规格 / 密度对比表 / 状态共享规则）

**Part 2 · 工作区边界与交互规则**（原有内容精炼）
- 壳层与编排层关系
- 应用概览页内容边界 + 四任务域固定顺序
- L1 详情规则（Drawer vs Inspector，边界固定，禁止第三种）
- 状态语义映射
- 交互伪装禁令（no-op 按钮处理）
- 移动端降级规则（390px 首屏 + 小屏编排降级）
- 执行优先级顺序

---

## 3. 其他文档的降级状态

以下文档全部**降级为历史过程记录，不再是规则执行依据**：

| 文档 | 产生来源 | 降级后用途 |
|---|---|---|
| `docs/agent/shareWorks/planner-decision.md` | planner3，UI 规则拍板稿（第一版） | 已被 DESIGN.md 吸收，仅供理解裁决背景 |
| `docs/agent/shareWorks/planner-design-decisions.md` | planner，第一轮 QA 后设计决策 | 已被 DESIGN.md 吸收，仅供历史参考 |
| `docs/agent/shareWorks/approved-change-list.md` | planner，demo 变更批准单 | 历史执行记录，不可继续充当当前批准单 |
| `docs/agent/shareWorks/worker-change-summary.md` | worker，执行摘要 | 了解"已改了什么"，不可定义新规则 |
| `docs/agent/shareWorks/qa-baseline-review.md` | qa，第一轮 QA 报告 | 历史记录 |
| `docs/agent/shareWorks/qa-top5.md` | qa，第一轮 QA Top5 | 历史记录 |
| `docs/agent/shareWorks/qa-final-review.md` | qa，最终 QA 报告 | 已驱动 DESIGN.md 重建，自身不作为规则依据；其中 3 个阻塞项见下方 |

---

## 4. Worker 第二轮修复的准入输入（仅此三类，优先级固定）

1. `docs/draft/DESIGN.md` — 唯一规则来源，定义目标状态
2. `docs/agent/shareWorks/qa-final-review.md` — 当前待修问题与验收口径来源
3. `tmp/demo/*` — 当前实现基线，在其上直接修补

**约束：**
- 第二轮修复不要再回头从 `planner-decision.md`、`planner-design-decisions.md`、`approved-change-list.md` 拼接新要求
- 如果 `qa-final-review.md` 描述与 `DESIGN.md` 角度不同：按 `DESIGN.md` 解释规则，按 `qa-final-review.md` 锁定待修点
- 如果修复过程中发现 `DESIGN.md` 仍不够判断，停止扩写 spec，回报 lead 重新裁决

---

## 5. 当前仍开放的阻塞项（供 worker 处理）

根据 `qa-final-review.md` 结论，以下问题需 worker 在 demo 中修正。规则已在 DESIGN.md 覆盖，直接对照执行：

| # | 问题 | DESIGN.md 对应规则 |
|---|---|---|
| B1 | 移动端首屏排序未兑现（sidebar 先于主内容） | Part 2 § 6.1：sidebar `order: 2`，主内容 `order: 1` |
| B2 | fresh screenshot 缺失（无法验证视觉效果） | 修复 B1 后，桌面 `1440×900` + 移动端 `390px` 各截图验证 |

---

## 6. 何时更新 DESIGN.md

- 新一轮 demo 验证后需要修正规则
- 新增产品功能需要新 UI 规则
- QA 发现 DESIGN.md 与实现有实质性偏差

**更新 DESIGN.md 时，不需要同时更新上述已降级的历史文档。**
