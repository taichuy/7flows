# Part 1 · 视觉执行规则

## 1. 总体方向

1Flowse 前端采用**工具型控制台风格**：高对比、低装饰、状态语义清晰。可直接对照的参照系是 Linear、Vercel dashboard、Ant Design Pro

**默认规则（以下方向无需解释，直接执行）：**

- 底色白 + 近黑文字（高对比）
- 主色明确，状态色语义唯一，其余元素中性
- 圆角锐利（4-8px），不用 16px+ 大圆角
- 阴影克制分两档，不堆叠
- 字体工具型排版（层级分明，无 hero 风格）

**以下任何偏离均需明确理由，否则恢复默认：**

- 大面积深底 + 白字仪表板风格
- 16px+ 大圆角
- 彩色装饰（与状态语义无关的颜色使用）
- 营销式大标题 / hero 排版

---

## 2. 色彩系统

### 2.1 主色

```
primary: #146ef5
```

用于：主 CTA 按钮背景、active 导航项颜色、focus ring、`running` 状态（唯一使用主色的语义场景）。

### 2.2 状态色（唯一语义映射，不允许复用于其他视觉目的）

```css
--status-running:  #146ef5;   /* 系统正在执行 */
--status-waiting:  #ff9500;   /* 等待 / 排队中 */
--status-failed:   #ee1d36;   /* 执行失败 / 错误 */
--status-success:  #00d722;   /* 执行成功 / 健康 */
--status-draft:    #ababab;   /* 未发布草稿 */
--status-selected: #3b89ff;   /* 用户选中态高亮 — 不与 running 混用 */
```

**补充规则：**
- 这 6 个颜色不允许用于非状态语义目的（装饰、分类标签、品牌区分等）
- 节点类型标签（Trigger / LLM / Tool / State）用中性 badge，不用任何状态色
- `selected` 态只用 outline + 浅底，不用彩色背景块填充

### 2.3 中性色

```css
--text-primary:   #1a1a1a;   /* 正文、标题 */
--text-secondary: #595959;   /* 次级文字、导航项默认 */
--text-tertiary:  #8c8c8c;   /* 辅助说明、field label、caption */
--text-disabled:  #bfbfbf;   /* 禁用态 */

--bg-page:        #f5f5f5;   /* 页面底色 */
--bg-surface:     #ffffff;   /* 卡片、面板底色 */
--bg-hover:       #f7f9ff;   /* 行 hover 背景 */
--bg-selected:    #f0f5ff;   /* 选中行背景 */

--border-default: #e8e8e8;   /* 常规边框 */
--border-strong:  #d8d8d8;   /* 输入框、强分隔 */
--border-focus:   #146ef5;   /* 焦点 / 选中边框 */
```

---

## 3. 排版系统

**字体栈**（系统默认，不强制引入外部字体）：
```
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

**固定层级表（Codex 只使用以下 8 个层级，不自创字号）：**

| 角色 | 字号 | 字重 | 颜色 | 附加属性 | 用途 |
|---|---|---|---|---|---|
| `page-title` | 20px | 600 | `--text-primary` | — | 页面大标题，一页只出现一次 |
| `section-title` | 14px | 600 | `--text-primary` | — | 区块标题、抽屉标题 |
| `label-uppercase` | 12px | 600 | `--text-secondary` | uppercase / letter-spacing: 0.5px | 卡片区块小标签 |
| `body` | 14px | 400 | `--text-primary` | — | 默认正文、列表主字段 |
| `body-secondary` | 14px | 400 | `--text-secondary` | — | 次级正文、列表次要字段 |
| `caption` | 12px | 400 | `--text-tertiary` | — | 辅助说明、时间戳、hint |
| `code` | 13px | 400 | `--text-primary` | font-family: monospace; background: #f5f5f5; padding: 1px 4px; radius: 3px | 代码、API 路径 |
| `value-large` | 24px | 600 | `--text-primary` | — | 仪表盘大数字（仅监控报表等场景使用） |

---

## 4. 间距系统

**基础单位：4px**

| 名称 | 值 | 典型用途 |
|---|---|---|
| `space-xs` | 4px | Badge 内边距、紧凑元素间 |
| `space-sm` | 8px | 同组元素间距 |
| `space-md` | 12px | 行内分组 |
| `space-base` | 16px | 卡片内容区内边距 |
| `space-lg` | 20px | 卡片 header 内边距 |
| `space-xl` | 24px | 区块间距 |
| `space-2xl` | 32px | 页面 section 间距 |

---

## 5. 圆角与边框

### 三档圆角（不允许使用其他值）

| 档位 | 值 | 适用场景 |
|---|---|---|
| `radius-sm` | 4px | Badge、Tag、Input、小图标按钮 |
| `radius-md` | 6px | 按钮、Chip、NodeCard |
| `radius-lg` | 8px | 卡片、面板容器、Drawer 内区域、Modal |

### 边框规则

- 常规边框：`1px solid var(--border-default)` (`#e8e8e8`)
- 强调边框：`1px solid var(--border-strong)` (`#d8d8d8`)
- 禁止使用 2px+ 边框作为装饰

---

## 6. 阴影

**两档，不允许超出范围：**

| 档位 | 值 | 用途 |
|---|---|---|
| `shadow-card` | `0 1px 4px rgba(0,0,0,0.08)` | 卡片悬浮、hover 增强 |
| `shadow-float` | `0 4px 16px rgba(0,0,0,0.12)` | Drawer、下拉菜单、浮层面板 |

---

## 7. Shell Layer 组件 Recipe

### 7.1 按钮 (Button)

| 变体 | 背景 | 文字 | 边框 | 高度 | 内边距 | 圆角 |
|---|---|---|---|---|---|---|
| primary | `#146ef5` | `#fff` | 无 | 32px | `0 16px` | 6px |
| secondary | transparent | `#1a1a1a` | `1px solid #d8d8d8` | 32px | `0 16px` | 6px |
| ghost / link | transparent | `#146ef5` | 无 | auto | `0 8px` | 6px |
| danger | `#ee1d36` | `#fff` | 无 | 32px | `0 16px` | 6px |

**交互状态：**

| 状态 | primary | secondary |
|---|---|---|
| hover | 背景 `#1060d4` | 边框 `#aaa`，背景 `#f7f9ff` |
| active（按下） | `transform: scale(0.98)` | 同左 |
| focus | `outline: 2px solid #146ef5; outline-offset: 2px` | 同左 |
| disabled | 透明度 0.4，`cursor: not-allowed` | 同左 |

**禁止：**
- no-op 按钮保留 primary / secondary 视觉样式
- 纯装饰性 CTA（仅为让页面看起来丰富）

无结果时**必须降级为**：`<span class="caption">`、`<a href="#">`（链接语义）、`<span class="nav-label">`

### 7.2 卡片 (Card)

```
背景：   #ffffff
边框：   1px solid #e8e8e8
圆角：   8px
阴影：   0 1px 4px rgba(0,0,0,0.08)

Card Header：
  高度：     48px
  内边距：   0 20px
  分隔线：   border-bottom: 1px solid #f0f0f0
  标签文字： label-uppercase 规格（12px/600/uppercase）

Card Body：
  内边距：   16px 20px

Card Footer（可选）：
  内边距：   12px 20px
  分隔线：   border-top: 1px solid #f0f0f0
  内容：     次级操作链接或状态说明
```

### 7.3 导航 / 侧边栏 (Sidebar Nav)

```
宽度：      220px（桌面）
背景：      #ffffff
右边框：    1px solid #e8e8e8

导航项：
  元素类型：  <a>（不用 <button>）
  高度：      40px
  内边距：    0 16px
  字号/字重：  14px / 400
  默认颜色：   #595959

  hover 态：   背景 #f7f9ff
  active 态：  背景 #f0f5ff，颜色 #146ef5，font-weight 500
              左侧 3px 实色指示条：background #146ef5

导航分组标签：
  字号/字重：  11px / 600 / uppercase
  颜色：       #8c8c8c
  内边距：     12px 16px 4px
```

### 7.4 抽屉 (Drawer)

```
宽度：      360px（桌面）/ 100vw（移动端）
位置：      fixed right: 0，覆盖主内容层
背景：      #ffffff
阴影：      0 4px 16px rgba(0,0,0,0.12)
左侧圆角：  8px（顶/底左角）

Drawer Header：
  高度：     56px
  内边距：   0 20px
  标题：     16px / 600 / #1a1a1a
  关闭按钮：  右侧，24×24px icon 按钮

Drawer Body：
  内边距：   20px
  overflow-y: auto
```

**模态契约（必须全部满足，缺一不可）：**

1. 关闭态：带 `hidden` attribute（等同 `display: none`，退出可见树和交互树）
2. 打开态：`role="dialog"` + `aria-modal="true"` + `aria-labelledby` 指向标题元素 id
3. 打开时：初始焦点移入 drawer（首选 Close 按钮或标题）
4. 打开期间：Tab 只在 drawer 内部循环
5. Escape 键：关闭 drawer
6. 关闭后：焦点回到触发该 drawer 打开的元素

### 7.5 Inspector 面板

```
宽度：      280px（编排页右侧固定）
背景：      #ffffff
左边框：    1px solid #e8e8e8

Inspector Header：
  高度：     48px
  内边距：   0 16px
  标题：     14px / 600 / #1a1a1a

Section Header：
  高度：     32px
  字号：     12px / 600 / uppercase / letter-spacing: 0.5px
  颜色：     #8c8c8c
  内边距：   0 16px

Field Row：
  高度：     28px（单行值）
  label：   12px / 400 / #8c8c8c
  value：   14px / 400 / #1a1a1a
```

**Inspector 规则：**
- 非模态，不阻断画布操作
- 选中节点 → inspector 内容更新为该节点
- 取消选中 → inspector 收起或显示默认占位说明
- 不使用 Drawer 的容器结构或动画方式

### 7.6 Badge / Status Indicator

**状态点（dot）：**
```
尺寸：   6×6px，圆形
颜色：   按状态色映射表（见 § 2.2）
用途：   列表行左侧状态指示
```

**状态 Badge（pill）：**

| 状态 | 背景 | 文字颜色 |
|---|---|---|
| running | `rgba(20,110,245,0.1)` | `#146ef5` |
| waiting | `rgba(255,149,0,0.1)` | `#cc7700` |
| failed | `rgba(238,29,54,0.1)` | `#ee1d36` |
| success / healthy | `rgba(0,215,34,0.1)` | `#009918` |
| draft | `rgba(171,171,171,0.15)` | `#666666` |
| published | `rgba(20,110,245,0.1)` | `#146ef5` |

```
Badge 规格：高度 18px，内边距 0 6px，字号 12px/400，圆角 4px
```

**类型标签 badge（kind badge）：** 固定中性样式，不区分种类颜色

```
背景：   #f0f0f0
文字：   #595959 / 12px / 400
圆角：   4px
```

---

## 8. Editor UI Layer 子规范

Editor UI 比 Shell Layer **更高密度、更少装饰**，但共享同一套 token。不允许引入与 Shell 完全不同的视觉语言。

**Shell vs Editor 密度对比：**

| 维度 | Shell Layer | Editor UI Layer |
|---|---|---|
| 卡片内边距 | 16-20px | 8-12px |
| 列表行高 | 40px | 28-32px |
| 正文字号 | 14px | 可用 13px（节点内紧凑场景） |
| 装饰线 / 背景色 | 低 | 更低，只留必要结构线 |
| 状态表达强度 | 标准 | 更强（节点状态必须清晰可辨） |

**NodeCard 规格：**

```
最小尺寸：  160×56px
背景：      #ffffff
边框：      1px solid #e8e8e8（默认）
            2px solid var(--status-running) （运行中）
            2px solid var(--status-failed)  （失败）
圆角：      6px
内边距：    8px 12px

选中态：
  outline: 2px solid #146ef5
  box-shadow: 0 0 0 3px rgba(20,110,245,0.15)

类型 badge（左上角）： kind badge 规格（中性，见 § 7.6）
状态 badge（右上角）： status badge 规格（见 § 7.6）
```

**Editor 状态共享规则：**
- Shell 列表状态点、NodeCard 状态 badge、Inspector 状态字段 → 三处颜色必须引用同一 CSS 变量，不允许各自硬编码

---

# Part 2 · 工作区边界与交互规则

## 1. 壳层与编排层关系

### 1.1 同一产品系统，两种表达层

- `Shell Layer`：面向控制台壳层（概览、导航、列表、表单、日志、API 文档）
- `Editor UI Layer`：面向画布（节点、连线、端口、工具栏、Inspector）
- **两层共享同一 token 系统，不允许各自发展成不同视觉语言**

### 1.2 必须共享的基线

- 文字层级、圆角尺度、边框逻辑、阴影层级保持一致
- 运行状态语义必须在壳层和编排层之间相互对应
- `selected` 不是运行状态，不得占用语义色

---

## 2. 应用工作区边界

### 2.1 应用概览页（根路由）

**允许出现的内容（仅此，不扩展）：**

| 内容 | 形式 |
|---|---|
| 应用名称、图标、简介、标签 | 文字 + 图标 + kind badge（中性） |
| 当前发布状态 | `draft` / `published` 状态 badge |
| 最近运行摘要 | 最多 3 行，行点击打开 Drawer |
| 单一主入口 | `进入编排`（唯一 primary 按钮） |
| 应用操作区 | 复制、删除、设置（放头部，非正文区） |

**禁止出现（无论任何理由）：**
- 完整 Editor Canvas
- 完整发布配置表单
- API 文档正文
- 调用日志完整列表
- 设计说明 / 注释文案 / 规则解释文字

### 2.2 应用内四个任务域（顺序固定）

```
1. 编排       → 如何编辑 flow、查看节点、准备发布
2. 应用 API   → 调用方如何接入当前发布契约
3. 调用日志   → 最近运行发生了什么，哪一条需要排查
4. 监控报表   → runtime / state / plugin 是否健康
```

- 任何单页只回答**一个**任务域的问题
- `应用概览` 不作为导航项，它是应用根路由的默认落点

### 2.3 页面组合 Recipe 最小集

以下 5 个页面只允许按对应 recipe 组合；**主块负责回答页面核心问题，辅助块只补充上下文，不得反客为主**。

| 页面 | 主块 | 辅助块 |
|---|---|---|
| `overview` | 应用头信息 + 发布状态 + 最近运行摘要 + 单一主入口 `进入编排` | 应用操作区、标签、最近活动时间 |
| `orchestration` | 画布 stage + Inspector + 当前 flow 状态 / 发布准备条 | 节点列表、版本信息、移动端摘要块 |
| `api` | 当前发布契约摘要 + 接入方式 / 认证说明 + 请求 / 响应结构 | 版本信息、示例片段、变更提示 |
| `logs` | 筛选区 + 运行列表 + Run Drawer | 时间范围、聚合计数、导出入口（仅在有真实结果时） |
| `monitoring` | 健康摘要 + 关键指标卡 / 图 + 异常热点列表 | 时间范围切换、阈值说明、刷新时间 |

---

## 3. L1 详情规则

工作区只允许两种 L1 详情模型，**禁止新增第三种**：

| 模型 | 触发上下文 | 触发动作 | 特征 |
|---|---|---|---|
| **Drawer** | Shell 列表行（run row、日志行） | 点击行 | 模态，带焦点约束，关闭后焦点回退 |
| **Inspector** | Canvas 对象（节点、连线） | 点击节点 | 非模态，原地更新，保留画布上下文 |

**分界依据是"用户当前所在的交互层"，不是"内容是什么"：**
- Shell 层 → Drawer
- Canvas 层 → Inspector

**禁止：**
- 同类对象有时 Drawer、有时 Modal、有时跳页
- 节点详情用 Drawer 容器
- 日志行详情塞进 Inspector
- 新增第三种 L1 模型（需要明确设计评审批准）

---

## 4. 状态语义映射

状态色**只表达系统运行真相**，不表达类型，不表达用户选中态：

| 语义 | CSS 变量 | 行为规则 |
|---|---|---|
| `running` | `--status-running` | 系统正在执行；唯一使用主色的语义场景 |
| `waiting` | `--status-waiting` | 等待外部输入 / 排队中 |
| `failed` | `--status-failed` | 阻塞、失败、需要排查 |
| `success` / `healthy` | `--status-success` | 执行成功 / 正常运行 |
| `draft` | `--status-draft` | 尚未发布的变更 |
| `selected` | `--status-selected` | 用户当前选中态 |

**补充规则：**
- `selected` 只用 outline（`2px solid var(--status-selected)` + `box-shadow: 0 0 0 3px rgba(59,137,255,0.2)`），不用彩色背景填充
- 同一状态在 run list 状态点、NodeCard badge、Inspector 状态字段三处颜色一致，引用同一变量
- 类型标签不使用任何状态色

---

## 5. 交互伪装禁令

### 5.1 允许的真实按钮

按钮（`<button>`）必须产生当前上下文可验证的结果：
- 视图切换
- 打开 / 关闭 Drawer
- 切换节点聚焦
- 进入编排
- 发布 / 保存（有真实后端行为时）

### 5.2 禁止的 no-op 按钮

以下情况禁止使用按钮样式：
- 只是说明性的标题
- 只是示意性的工具条
- 还没有实现结果的入口
- 只是为了"让页面看起来丰富"

**必须降级为：**
- `<a href="#">`（导航 / 链接语义）
- `<span class="caption">` / 静态文本
- `<span class="badge">`

### 5.3 导航语义

- 导航项使用 `<a>` 元素，不使用 `<button>`
- Demo 未实现的入口加 `data-demo="pending"` 属性，视觉完整但不保留 primary 样式

### 5.4 UI 文案禁令

默认产品 UI 文案**禁止出现**任何 prompt-like、command-like、internal-instruction-like 表达。

UI 文案**只允许表达**：
- 用户任务
- 业务对象
- 系统状态
- 可执行结果

默认产品 UI 文案**禁止直接出现**：
- 提示词、命令、system / developer instruction
- 内部角色名、工具名、评审流转词
- 面向 AI 或开发者的操作提示
- 规则解释、实现备注、占位式指挥句

**禁止示例：**
- `按以下规则执行`
- `请先阅读 spec 再继续`
- `如果你是 Codex，请使用默认 recipe`
- `等待 planner / QA 批准后操作`

如内容是给 AI、开发者或评审者看的，必须留在设计文档、注释、日志或开发工具视图，不得进入默认产品 UI。

---

## 6. 移动端降级规则

### 6.1 390px 首屏要求

首屏折叠线以上**必须可见**：
1. 应用状态 badge
2. 当前页标题
3. 主入口 / 当前域最小可行动作（≤ 2 个）

实现方式：`sidebar` 在移动端使用 CSS `order: 2`（排到主内容之后），主内容 `order: 1`。

**禁止首屏被以下内容占用：**
- 完整 sidebar / 导航区
- 统计卡片堆叠超过 3 行
- 设计说明文案 / 注释

### 6.2 小屏编排降级

`max-width: 768px` 断点下：

- **隐藏** Canvas 容器（`display: none`）
- **显示** 编排摘要块：节点数 + 最近修改时间 + 提示文案
- 提示文案：`画布编排请在桌面端操作`（caption 规格，非弹窗）

**禁止：**
- 保留必须横向拖动才能查看的半成品画布
- 仅缩小字体 / 压缩间距把桌面版硬塞进 390px

### 6.3 其他移动端规则

- Drawer 全宽（`width: 100%; max-width: 100vw`）
- 主卡片单列堆叠（`width: 100%`）
- 触摸目标最小 `44×44px`
- 导航触达不依赖 hover，路径不超过 2 次点击

---

## 7. 执行优先级顺序

前端改动涉及工作区时，**按以下顺序判断，不允许跳步**：

1. **任务域边界**：确认改动属于哪个任务域，是否越界
2. **L1 详情规则**：确认 Drawer / Inspector 是否正确分配
3. **状态语义**：确认状态色、status badge 是否一致引用变量
4. **Token / 视觉**：最后才调整颜色、圆角、阴影等 token

**前 3 步未收敛时，禁止把时间花在抛光视觉上。**
