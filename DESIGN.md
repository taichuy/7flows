# 1Flowse UI 设计规范

## 1. 视觉主题与氛围

1Flowse 采用浅底工作台风格：温白画布、纯白表面、暖灰边框、亮翡翠绿作为最高信号强调色。整体目标是做一个对 AI 与工程实现都稳定、清晰、可执行的产品 UI 规范。

**默认规则：**

- 页面基底使用温白或极浅灰，内容表面使用白色或极浅抬升面，依靠边框和轻阴影而不是彩色大面积色块分层。
- 轻翡翠绿是唯一高信号强调色，用于主 CTA、当前激活态、运行中节点和关键焦点。
- `Shell Layer` 与 `Editor UI Layer` 必须共享同一套 token、状态语义和密度逻辑，不允许发展成两套产品。
- Shell 区域优先复用 `Ant Design`；画布区域基于 `xyflow`，配合薄的 `Editor UI` 自封装组件，不直接把 `Ant Design` 大量铺进节点主体。
- 圆角控制在 `4px / 6px / 8px` 三档，阴影克制，发光退化为轻 halo，只用于最高信号时刻。
- 排版服务于信息密度和操作清晰度，不使用营销页式 hero、夸张留白或装饰性标题。

**偏离以上方向必须有明确理由，否则恢复默认。**

---

## 2. 调色板与角色

### 2.1 主强调色

```css
--color-primary:        #00d992;
--color-primary-strong: #00ffaa;
--color-primary-muted:  #2fd6a1;
--color-primary-hover:  #00c182;
```

用途：

- 主 CTA 按钮
- 当前激活导航
- 焦点 ring
- 运行中的节点 / 连线高亮
- 关键状态增强

禁止：

- 把主强调色当作大面积背景主色
- 把主强调色用于与状态无关的装饰填充

### 2.2 状态色

```css
--status-running:   #00d992;  /* 系统正在执行，最高信号 */
--status-waiting:   #ffba00;  /* 等待 / 排队 / 外部回调中 */
--status-failed:    #fb565b;  /* 失败 / 阻塞 / 需要排查 */
--status-success:   #19b36b;  /* 成功 / 健康 / 已完成 */
--status-draft:     #6b7280;  /* 未发布 / 草稿 */
--status-selected:  #2bb9b1;  /* 用户选中态，仅用于选中反馈 */
```

**硬规则：**

- 以上 6 个颜色只表达状态语义，不用于分类标签、品牌装饰或无语义点缀。
- `running` 与 `success` 不是同一语义：`running` 更亮、更通电；`success` 更稳、更收敛。
- `selected` 不是系统运行状态，不能与 `running`、`failed`、`success` 混用。
- `draft / published` 属于发布语义，不等于运行态。`published` 允许在发布上下文中借用主强调色做 outline badge，但不能替代日志、运行行、节点卡片里的真实运行状态。

### 2.3 表面、文字与边框

```css
--bg-page:           #f4f8f5;
--bg-surface:        #ffffff;
--bg-elevated:       #f8fcf9;
--bg-hover:          rgba(0,217,146,0.08);
--bg-selected:       rgba(43,185,177,0.12);
--bg-code:           #0d1713;

--text-primary:      #16211d;
--text-secondary:    #55645d;
--text-tertiary:     #7b8982;
--text-disabled:     #9aa6a0;

--border-default:    #d5ddd8;
--border-strong:     #bcc8c1;
--border-focus:      #00d992;
--border-selected:   #2bb9b1;
```

补充规则：

- 页面背景与内容表面至少保持一层明显层差。
- 表面抬升优先通过 `border + shadow` 完成，不通过彩色底块完成。
- 文本只允许使用以上灰阶体系，避免引入额外无语义彩色文字。

---

## 3. 字体排版规则

### 3.1 字体系列

- 标题：`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- 正文 / UI：`"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- 代码：`"SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`

说明：

- 如果项目未显式加载 `Inter`，允许直接退回系统字体，不要求为了视觉规范额外引入字体依赖。
- 代码字体在 Shell 和 Editor 中保持一致，不允许节点内外出现两套等宽字体逻辑。

### 3.2 固定层级

| 角色 | 字号 | 字重 | 行高 | 颜色 | 用途 |
|---|---|---|---|---|---|
| `page-title` | 20px | 600 | 1.2 | `--text-primary` | 页面标题 |
| `dialog-title` | 16px | 600 | 1.25 | `--text-primary` | Drawer / Modal / 大卡片标题 |
| `section-title` | 14px | 600 | 1.35 | `--text-primary` | 区块标题、Inspector 标题 |
| `label-uppercase` | 12px | 600 | 1.4 | `--text-secondary` | 分组标签、卡片小标题，需 uppercase |
| `body` | 14px | 400 | 1.55 | `--text-primary` | 默认正文、列表主字段 |
| `body-secondary` | 14px | 400 | 1.55 | `--text-secondary` | 次级正文 |
| `caption` | 12px | 400 | 1.45 | `--text-tertiary` | 时间戳、说明、hint |
| `code` | 13px | 400 | 1.4 | `--text-primary` | 代码、API 路径、运行片段 |
| `value-large` | 24px | 600 | 1.1 | `--text-primary` | 指标卡大数字 |

### 3.3 排版原则

- 标题密度应偏紧凑，避免宽松营销式行高。
- 一个页面只允许一个 `page-title`。
- `label-uppercase` 只用于分组标签，不用于大标题。
- 代码片段是工程信息的一部分，不是装饰元素；代码块背景始终使用 `--bg-code`。

---

## 4. 组件样式

### 4.1 Shell Layer 实现基线

`Shell Layer` 默认以 `Ant Design` 为基线实现。这里定义的是视觉 token、语义、尺寸与状态，不要求画布外全部手写 DOM。实现时遵守：

- 画布外优先使用现有 `antd` 组件及其主题能力。
- 重表单、列表、抽屉、Descriptions、Tabs 等优先复用 `antd`。
- 如果 `antd` 默认样式与本规范不符，应通过 theme token、类名覆写或薄封装校正，而不是引入第二套主组件库。

### 4.2 按钮 (Button)

| 变体 | 背景 | 文字 | 边框 | 高度 | 内边距 | 圆角 |
|---|---|---|---|---|---|---|
| primary | `#00d992` | `#06241a` | 无 | 32px | `0 16px` | 6px |
| secondary | `#ffffff` | `#16211d` | `1px solid #bcc8c1` | 32px | `0 16px` | 6px |
| ghost / link | transparent | `#00c182` | 无 | auto | `0 8px` | 6px |
| danger | `#fb565b` | `#ffffff` | 无 | 32px | `0 16px` | 6px |

**交互状态：**

| 状态 | primary | secondary |
|---|---|---|
| hover | 背景 `#00c182`，可加轻微翡翠 halo | 背景 `rgba(0,217,146,0.08)`，边框 `#9fcdb8` |
| active | `transform: scale(0.98)` | 同左 |
| focus | `outline: 2px solid rgba(0,217,146,0.55); outline-offset: 2px` | 同左 |
| disabled | `opacity: 0.4; cursor: not-allowed` | 同左 |

**禁止：**

- no-op 入口保留 `primary / secondary` 视觉样式
- 仅为了“页面看起来丰富”而放主按钮
- 用按钮承载纯说明性文字

无真实结果时必须降级为：

- `<a>`（导航 / 链接语义）
- `<span class="caption">`
- `<span class="nav-label">`

### 4.3 卡片 (Card)

```text
背景：    #ffffff
边框：    1px solid #d5ddd8
圆角：    8px
阴影：    0 12px 34px rgba(14,24,20,0.07)

Card Header：
  高度：    48px
  内边距：  0 20px
  分隔线：  border-bottom: 1px solid #e8edea

Card Body：
  内边距：  16px 20px

Card Footer：
  内边距：  12px 20px
  分隔线：  border-top: 1px solid #e8edea
```

补充规则：

- 只有在 `running / selected / featured` 这类高信号场景下，才允许卡片边框升级为 `2px` 或增加局部 glow。
- 常规卡片不使用彩色标题底或大面积色块头部。

### 4.4 输入框与表单

Shell 表单默认复用 `Ant Design`，视觉应校正为：

```text
高度：      32px
背景：      #ffffff
文字：      #16211d
边框：      1px solid #bcc8c1
圆角：      6px
hover：     边框 #9fcdb8
focus：     边框 #00d992 + 轻微 halo
disabled：  背景 #f1f4f2，文字 #9aa6a0
```

禁止：

- 让表单区域出现第二套完全不同的浅色 UI 语言
- 为画布内部节点直接塞入大段 `antd` 表单 DOM

### 4.5 导航 / 侧边栏 (Sidebar Nav)

```text
宽度：      220px（桌面）
背景：      rgba(248,252,249,0.92)
右边框：    1px solid #d5ddd8

导航项：
  元素类型： <a>
  高度：     40px
  内边距：   0 16px
  字号：     14px / 400
  默认颜色： #55645d

  hover：    背景 rgba(255,255,255,0.72)
  active：   背景 rgba(0,217,146,0.10)
            颜色 #16211d
            font-weight 500
            边框 1px solid rgba(0,217,146,0.18)
```

导航分组标签：

- `11px / 600 / uppercase`
- 颜色：`#7b8982`
- 内边距：`12px 16px 4px`

### 4.6 抽屉 (Drawer)

```text
宽度：      360px（桌面）/ 100vw（移动端）
位置：      fixed right: 0
背景：      #ffffff
左边框：    1px solid #d5ddd8
阴影：      0 20px 60px rgba(14,24,20,0.12)
左侧圆角：  8px（桌面）

Drawer Header：
  高度：     56px
  内边距：   0 20px
  标题：     dialog-title
  关闭按钮： 24x24px icon button

Drawer Body：
  内边距：   20px
  overflow-y: auto
```

**模态契约：**

1. 关闭态带 `hidden` attribute。
2. 打开态必须具备 `role="dialog"`、`aria-modal="true"`、`aria-labelledby`。
3. 打开时初始焦点移入 Drawer。
4. 打开期间 Tab 只在 Drawer 内循环。
5. `Escape` 关闭。
6. 关闭后焦点回到触发源。

### 4.7 Inspector 面板

```text
宽度：      280px
背景：      #ffffff
左边框：    1px solid #d5ddd8

Inspector Header：
  高度：     48px
  内边距：   0 16px
  标题：     section-title

Section Header：
  高度：     32px
  字号：     12px / 600 / uppercase
  颜色：     #7b8982
  内边距：   0 16px

Field Row：
  高度：     28px（单行值）
  label：    12px / 400 / #7b8982
  value：    14px / 400 / #16211d
```

**Inspector 规则：**

- 非模态，不阻断画布操作。
- 选中节点后原地更新内容，不使用 Drawer 的容器逻辑和进出动画。
- 取消选中后收起或回到默认占位态。

### 4.8 Badge / Status Indicator

**状态点（dot）：**

```text
尺寸：   6x6px
形状：   圆形
用途：   列表行左侧状态指示
颜色：   严格引用状态变量
```

**状态 Badge：**

| 状态 | 背景 | 文字 |
|---|---|---|
| running | `rgba(0,217,146,0.12)` | `#047a57` |
| waiting | `rgba(255,186,0,0.14)` | `#9b6d00` |
| failed | `rgba(251,86,91,0.12)` | `#bf3940` |
| success / healthy | `rgba(25,179,107,0.12)` | `#117548` |
| draft | `rgba(123,133,129,0.14)` | `#616b67` |
| published | `rgba(0,217,146,0.08)` | `#047a57` |

```text
规格：高度 18px，内边距 0 6px，字号 12px / 400，圆角 4px
```

**类型标签 Badge：**

```text
背景：   #f8fcf9
文字：   #55645d
圆角：   4px
字号：   12px / 400
```

类型标签始终使用中性样式，不区分种类颜色。

---

## 5. 布局原则

### 5.1 间距系统

基础单位：`4px`

| 名称 | 值 | 典型用途 |
|---|---|---|
| `space-xs` | 4px | 紧凑元素间距、badge 内边距 |
| `space-sm` | 8px | 同组控件间距 |
| `space-md` | 12px | 行内分组、字段间距 |
| `space-base` | 16px | 卡片内容区内边距 |
| `space-lg` | 20px | 卡片 header、Drawer 内边距 |
| `space-xl` | 24px | 区块间距 |
| `space-2xl` | 32px | 页面 section 间距 |
| `space-3xl` | 40px | 大块分隔、空状态缓冲 |

### 5.2 容器与网格

- 非画布页面内容宽度建议控制在 `1200px - 1280px`。
- 典型工作区结构：
  - 左侧导航 `220px`
  - 中央主内容自适应
  - 编排页右侧 `Inspector 280px`
- 一个页面只回答一个任务域问题；主块负责回答核心问题，辅助块只补充上下文。
- 标准页优先纵向分块；编排页优先横向结构。

### 5.3 圆角与边框

只允许三档圆角：

| 档位 | 值 | 适用场景 |
|---|---|---|
| `radius-sm` | 4px | badge、tag、输入框、小图标按钮 |
| `radius-md` | 6px | 按钮、chip、NodeCard |
| `radius-lg` | 8px | 卡片、面板容器、Drawer 内区域 |

边框规则：

- 常规边框：`1px solid var(--border-default)`
- 强调边框：`1px solid var(--border-strong)`
- 选中 / 状态边框：允许 `2px`
- 禁止把 `2px+` 边框当纯装饰边框大面积滥用

### 5.4 留白哲学

- 页面级留白用于区分任务块，不用于制造品牌感。
- Shell 内容比营销站更紧凑，Editor 比 Shell 更紧凑。
- 卡片之间的分离优先靠边框和结构线，而不是巨量空白。

---

## 6. 深度与高程

### 6.1 阴影分层

| 档位 | 值 | 用途 |
|---|---|---|
| `shadow-card` | `0 12px 34px rgba(14,24,20,0.07)` | 标准卡片、面板轻抬升 |
| `shadow-float` | `0 20px 60px rgba(14,24,20,0.12), inset 0 0 0 1px rgba(255,255,255,0.55)` | Drawer、弹出面板、浮层 |

### 6.2 高程哲学

| 层级 | 处理方式 | 用途 |
|---|---|---|
| Level 0 | 仅背景，无边框 | 页面底层 |
| Level 1 | `1px border` + 无或极轻阴影 | 常规容器 |
| Level 2 | 更强边框 / hover 反馈 | hover 卡片、激活导航 |
| Level 3 | `2px` 状态边框 + 局部 glow | 运行中节点、失败节点、选中对象 |
| Level 4 | `shadow-float` | Drawer、菜单、Popover |

原则：

- 深度优先通过边框、色差和局部 halo 体现，不依赖重阴影。
- 翡翠 halo 只用于高信号元素：运行中节点、关键 CTA、活动连线、少量品牌锚点。
- 禁止对整个页面背景、整块面板大面积加发光或彩色雾化。

---

## 7. 应做与不应做

### 7.1 应做

- 使用 `#f4f8f5` + `#ffffff` 的双色浅底系统。
- 用亮翡翠绿表达“已通电 / 正在运行 / 当前激活”。
- 保持 `4 / 6 / 8px` 圆角纪律，不扩散出第四档。
- 让状态色只表达状态，不表达类型。
- 画布外优先复用 `Ant Design`，画布内优先使用 `xyflow + Editor UI` 自封装。
- 让标题、状态、操作关系先清楚，再考虑视觉抛光。
- 让代码、路径、运行日志等工程信息使用统一等宽字体和深色代码底。

### 7.2 不应做

- 不要把深色终端表面重新引回主工作区。
- 不要把翡翠绿当作普通装饰色到处铺底。
- 不要使用 `16px+` 大圆角、玻璃态、营销页渐变背景。
- 不要让同一类对象出现不同详情容器。
- 不要把 `selected` 当成运行状态。
- 不要在未实现入口上保留主按钮样式。
- 不要在默认产品 UI 中出现 prompt-like、instruction-like、内部流程文案。
- 不要在节点主体里直接堆大段 `Ant Design` 表单和布局 DOM。

---

## 8. 响应式行为

### 8.1 断点

| 断点 | 范围 | 说明 |
|---|---|---|
| desktop-wide | `>= 1280px` | 标准工作台 / 编排主体验 |
| desktop-narrow | `1024px - 1279px` | 收紧间距，减少双栏并列数量 |
| tablet | `768px - 1023px` | 侧栏和辅助信息逐步折叠 |
| mobile | `<= 767px` | 主内容单列，画布降级 |

### 8.2 390px 首屏要求

首屏折叠线以上必须可见：

1. 当前页标题
2. 应用状态 badge
3. 当前任务域的最小可行动作（不超过 2 个）

禁止首屏被以下内容占满：

- 完整 sidebar
- 大段说明文案
- 统计卡片堆叠超过 3 行

### 8.3 折叠策略

- 移动端 `sidebar` 使用 `order: 2`，主内容 `order: 1`。
- Drawer 全宽：`width: 100%; max-width: 100vw`。
- 主卡片单列堆叠。
- 导航触达不依赖 hover，路径不超过两次点击。

### 8.4 小屏编排降级

`max-width: 768px` 下：

- 隐藏桌面画布容器。
- 展示编排摘要块：节点数、最近修改时间、当前 flow 状态。
- 固定提示文案：`画布编排请在桌面端操作`。

禁止：

- 仅靠缩小字体把桌面画布硬塞进手机宽度
- 保留必须横向滚动才能使用的半成品画布

### 8.5 触摸目标

- 所有主要点击目标最小 `44x44px`
- 图标按钮不能只依赖视觉尺寸小于 `32px`

---

## 9. Editor UI Layer 子规范

`Editor UI Layer` 是 1Flowse 的项目特性，不是普通主题换肤。它建立在 `xyflow` 之上，负责节点、连线、端口、工具栏、局部菜单和 Inspector 周边体验；它必须比 Shell 更高密度、更少装饰，但仍然属于同一产品系统。

### 9.1 实现边界

- 画布基于 `xyflow` 构建，用于节点、连线、viewport、handle 与交互编排。
- Editor UI 只使用现有的 `CSS Modules + CSS Variables`。
- 不引入新的主样式框架，不引入新的主组件库。
- 不把 `Ant Design` 直接大量铺进 `NodeCard` 主体。
- 输入框、选择器、弹窗等复杂交互允许在自有封装内部适度复用 `Ant Design`。

### 9.2 第一批最小组件

- `EditorSurface`
- `EditorToolbar`
- `EditorIconButton`
- `EditorPanelSection`
- `EditorBadge`
- `NodeCard`
- `NodePort`
- `InlineField`
- `EditorMenu`
- `EditorPopover`

### 9.3 Shell 与 Editor 密度对比

| 维度 | Shell Layer | Editor UI Layer |
|---|---|---|
| 卡片内边距 | 16px - 20px | 8px - 12px |
| 列表 / 行高 | 40px | 28px - 32px |
| 默认字号 | 14px | 13px - 14px |
| 装饰强度 | 低 | 更低，只留结构线与状态线 |
| 状态表达 | 标准 | 更强，必须一眼可辨 |

### 9.4 Canvas Surface

```text
Canvas Stage：
  背景：        #f4f8f5
  工作区：      #ffffff
  与 Shell 分界：顶部或左侧保留 1px solid var(--border-default)
  桌面最小内边距：24px
  窄屏最小内边距：16px

Grid：
  默认形式：    点阵网格
  点颜色：      rgba(22,33,29,0.08)
  小步长：      12px
  大步长：      24px
  规则：        只做定位提示，不做装饰背景

只读态：
  隐藏新增入口、拖拽入口和插入按钮
  保留缩放、定位、查看详情和运行态高亮
  不通过整体降到低对比度来伪装“禁用画布”

空画布：
  居中放置 280px - 320px 引导卡片
  卡片只保留 1 个主动作和 1 个次动作
  不允许把新手引导写成大面积说明文案墙
```

补充规则：

- 画布是工作区，不是品牌背景；禁止大面积彩色雾化、玻璃态或营销渐变。
- 背景、网格、辅助线都必须服从统一的浅底 token，不允许混入浏览器默认蓝灰主题。
- Inspector、Block Picker、工具条都悬浮在 Stage 之上，不给画布再套第二层厚重容器。

### 9.5 Canvas Controls

```text
主操作条：
  位置：        左下角
  排布：        纵向浮动栈
  容器背景：    #ffffff
  边框：        1px solid var(--border-default)
  圆角：        8px
  按钮尺寸：    32x32px
  按钮圆角：    6px
  按钮间距：    4px
  默认动作：    添加节点 / 添加注释 / 模式切换 / 自动布局 / 画布最大化 / 更多操作

缩放条：
  位置：        与主操作条同层，默认靠近左下
  容器高度：    36px
  推荐宽度：    96px - 108px
  结构：        减号 / 当前百分比 / 加号
  百分比点击：  打开菜单，提供 fit view、25/50/75/100/200

图标按钮状态：
  default：     transparent + var(--text-tertiary)
  hover：       var(--bg-hover) + var(--text-secondary)
  active-mode： var(--bg-selected) + var(--status-selected)
  disabled：    opacity 0.4
```

补充规则：

- 画布直接可见动作最多 6 个，超出的放入 `More Actions`。
- 模式切换是互斥关系，不能同时存在两个激活态。
- 仅图标按钮必须带 tooltip；存在快捷键时必须同时显示快捷键。
- 导出图片、导出 DSL、版本历史等低频动作默认进入二级菜单，不占主操作条。
- 工具条不允许覆盖节点核心编辑区；出现冲突时优先移动工具条，不压缩节点。

### 9.6 Node Anatomy

```text
节点骨架：
  Header：       32px - 36px 高
  Body：         1 - 2 个信息区块
  Footer：       仅在分支、输出、重试等结构节点中出现

Header 结构：
  左侧：         16px 图标 + 标题
  中部：         标题优先，单行截断
  右侧：         单个状态图标或紧凑 badge + hover 操作入口

Body 结构：
  第一信息层：   当前节点最关键的配置摘要，例如 model、目标、变量数
  第二信息层：   说明、输出摘要或 branch 提示
  字段密度：     以 12px - 13px 文本为主，区块间距 6px - 8px

标题：
  字号：         12px - 13px
  字重：         600
  颜色：         var(--text-primary)
  规则：         单行、可截断、不做营销式加粗

说明文本：
  字号：         12px
  颜色：         var(--text-tertiary)
  规则：         默认最多 2 行
```

补充规则：

- 节点主体优先展示“运行和理解这个节点最需要的信息”，不在卡片里展开完整表单。
- 左上类型标签、内联 chip、变量标签默认使用中性样式；类型不用状态色区分。
- hover 操作只在 hover 或 selected 时出现，避免整张卡片长期挂满按钮。
- 入口节点、循环容器节点、分支节点可以扩展结构，但仍然必须保留同一套 Header 语法。

### 9.7 NodeCard 规格

```text
默认宽度：  220px - 240px
最小尺寸：  220x64px
背景：      #ffffff
边框：      1px solid #d5ddd8（默认）
hover：     边框提升到 #bcc8c1
圆角：      6px
内边距：    8px 12px

selected：
  outline: 2px solid var(--status-selected)
  box-shadow: 0 0 0 3px rgba(43,185,177,0.16)

running：
  border: 2px solid var(--status-running)
  box-shadow: 0 0 0 3px rgba(0,217,146,0.12), 0 12px 28px rgba(0,217,146,0.12)

waiting：
  border: 1px solid var(--status-waiting)
  右上状态图标或 badge 使用 waiting 语义

failed：
  border: 2px solid var(--status-failed)

success：
  border: 1px solid var(--status-success)
  不加大面积 glow，只做稳定完成反馈

dimmed：
  opacity: 0.45 - 0.6
  仅用于聚焦其他节点、局部过滤或只读陪衬
```

补充规则：

- `selected` 是用户交互反馈，`running` 是系统运行反馈；允许叠加，但主次必须清楚。
- 优先用边框、状态图标和局部 glow 表达节点状态，不用整块彩色底。
- 节点内部字段优先紧凑排布，不出现 Shell 级大表单布局。

### 9.8 NodePort 与连线

```text
NodePort：
  可视核心：     10x10px
  点击热区：     至少 20x20px
  背景：         #f4f8f5
  边框：         2px solid #bcc8c1
  hover：        边框切到 var(--border-focus)
  connectable：  可加轻微 primary glow
  invalid：      使用 var(--status-failed)

Edge：
  默认描边：     #bcc8c1
  编辑预览：     var(--border-focus)
  选中描边：     var(--status-selected)
  运行态：       var(--status-running)
  默认粗细：     2px
  临时插入态：   允许使用虚线或中心插入按钮
```

补充规则：

- 编辑态反馈与运行态反馈必须分离：连接预览、hover、focus 使用 `primary / focus`，不要冒用 `running` 语义。
- 连线中点插入按钮只在 edge hover 或 selected 时显示，不常驻画布。
- 分支句柄、失败分支、循环出口等特殊端口仍然服从同一套尺寸和命中区规则，只调整位置和语义色。

### 9.9 Selection 与对齐反馈

```text
框选框：
  边框：        1px solid var(--status-selected)
  背景：        rgba(43,185,177,0.10)
  圆角：        4px

对齐辅助线：
  颜色：        rgba(43,185,177,0.68)
  粗细：        1px

连接预览：
  颜色：        var(--border-focus)
  规则：        可用轻微 glow 或虚线，不与运行态混淆
```

补充规则：

- 多选节点共享同一选中语法，不为“主选中节点”再引入第二种颜色。
- 非选中节点在多选场景下可以轻微降透明，但文字仍要可读。
- 选中态是编辑反馈，不参与业务状态计算，也不能用于发布、运行、失败语义。

### 9.10 浮层菜单与引导入口

```text
Block Picker：
  推荐宽度：    280px - 320px
  容器背景：    #ffffff
  边框：        1px solid var(--border-default)
  圆角：        8px
  结构：        搜索框 + 分类 tab + 节点列表

More Actions Menu：
  最小宽度：    180px
  行高：        32px
  规则：        一级分组标题 + 动作列表

节点局部菜单：
  触发：        hover / selected / 右键
  规则：        就近浮出，不跳出画布语境
```

补充规则：

- 画布新增节点的入口统一进入同一套 `Block Picker`，不要同时长出多个风格不同的节点选择器。
- 节点右键菜单、edge 插入菜单、更多操作菜单都使用同一浮层容器语法。
- 新手引导、首节点创建和空画布入口优先复用 `Block Picker`，不为首次体验单独发明另一套选择 UI。

### 9.11 Editor 共享规则

- Shell 列表状态点、NodeCard 状态 badge、Inspector 状态字段必须引用同一 CSS 变量。
- `selected` 只用 outline 和外圈 glow，不用整块彩色底。
- 画布背景网格、辅助线、连接高亮都要服从同一浅底 token 体系，不允许出现浏览器默认灰蓝主题残留。
- 画布编辑反馈分三层：
  - `selected`：用户当前选中，使用冷青色
  - `focus / connectable`：用户正在编辑，使用 primary / focus 绿色
  - `running / waiting / failed / success`：系统运行结果，严格引用状态色

---

## 10. 工作区边界与交互规则

这些规则保留在 `DESIGN.md` 中，是因为它们直接决定 UI 的结构、视觉分工和交互一致性，不属于可随意替换的业务实现细节。

### 10.1 同一产品系统，两种表达层

- `Shell Layer`：概览、导航、列表、表单、日志、API、监控。
- `Editor UI Layer`：节点、连线、工具栏、端口、Inspector、局部菜单。
- 两层共享同一套 token、排版、圆角、边框逻辑和状态语义。
- 默认实现基线：
  - 画布外：`Ant Design`
  - 画布内：`xyflow + Editor UI` 自封装

### 10.2 应用概览页边界

**允许出现的内容：**

| 内容 | 形式 |
|---|---|
| 应用名称、图标、简介、标签 | 文字 + 图标 + 中性 kind badge |
| 当前发布状态 | `draft / published` badge |
| 最近运行摘要 | 最多 3 行，行点击打开 Drawer |
| 单一主入口 | `进入编排` |
| 应用操作区 | 复制、删除、设置 |

**禁止出现：**

- 完整 Editor Canvas
- 完整发布配置表单
- API 文档正文
- 调用日志完整列表
- 规则解释、内部说明、注释文案

### 10.3 应用内任务域

应用内四个任务域顺序固定：

1. `编排`
2. `应用 API`
3. `调用日志`
4. `监控报表`

规则：

- 任一单页只回答一个任务域的问题。
- `应用概览` 是根路由默认落点，不作为侧栏独立导航项。

### 10.4 页面组合 Recipe 最小集

| 页面 | 主块 | 辅助块 |
|---|---|---|
| `overview` | 应用头信息 + 发布状态 + 最近运行摘要 + 单一主入口 | 应用操作区、标签、最近活动时间 |
| `orchestration` | 画布 stage + Inspector + 当前 flow 状态 / 发布准备条 | 节点列表、版本信息、移动端摘要块 |
| `api` | 当前发布契约摘要 + 接入方式 / 认证说明 + 请求 / 响应结构 | 版本信息、示例片段、变更提示 |
| `logs` | 筛选区 + 运行列表 + Run Drawer | 时间范围、聚合计数、导出入口 |
| `monitoring` | 健康摘要 + 关键指标卡 / 图 + 异常热点列表 | 时间范围切换、阈值说明、刷新时间 |

主块负责回答页面核心问题，辅助块不得反客为主。

### 10.5 L1 详情规则

工作区只允许两种 L1 详情模型：

| 模型 | 触发上下文 | 触发动作 | 特征 |
|---|---|---|---|
| `Drawer` | Shell 列表行、日志行、run row | 点击行 | 模态，带焦点约束，关闭后焦点回退 |
| `Inspector` | Canvas 对象（节点、连线） | 点击节点 / 连线 | 非模态，原地更新，保留画布上下文 |

分界依据是用户当前所在交互层，而不是内容类型：

- Shell 层 -> Drawer
- Canvas 层 -> Inspector

禁止：

- 同类对象有时 Drawer、有时 Modal、有时跳页
- 节点详情用 Drawer
- 日志行详情塞进 Inspector
- 新增第三种 L1 模型

### 10.6 状态语义映射

| 语义 | CSS 变量 | 规则 |
|---|---|---|
| `running` | `--status-running` | 系统正在执行，唯一最高信号 |
| `waiting` | `--status-waiting` | 等待外部输入 / 队列 / callback |
| `failed` | `--status-failed` | 失败、阻塞、需排查 |
| `success` / `healthy` | `--status-success` | 成功或健康 |
| `draft` | `--status-draft` | 尚未发布 |
| `selected` | `--status-selected` | 用户当前选中态 |

补充规则：

- `selected` 只用 outline：`2px solid var(--status-selected)` + 外圈 glow。
- 类型标签不使用任何状态色。
- 同一状态在 run list、NodeCard、Inspector 三处表达必须一致。
- `published` 只在发布上下文中出现，不进入运行态列表或节点运行态系统。

### 10.7 交互伪装禁令

按钮必须产生当前上下文可验证的结果，例如：

- 视图切换
- 打开 / 关闭 Drawer
- 切换节点聚焦
- 进入编排
- 发布 / 保存

以下情况禁止使用按钮样式：

- 只是说明性标题
- 只是示意性工具条
- 还没有实现结果的入口
- 只是为了让页面看起来更丰富

必须降级为：

- `<a>`
- `<span class="caption">`
- `<span class="badge">`

导航项使用 `<a>`，不使用 `<button>`。

### 10.8 UI 文案禁令

默认产品 UI 文案只允许表达：

- 用户任务
- 业务对象
- 系统状态
- 可执行结果

默认产品 UI 中禁止直接出现：

- 提示词、命令、system / developer instruction
- 内部角色名、工具名、评审流转词
- 规则解释、实现备注、占位式指挥句

### 10.9 移动端降级规则

- 首屏必须可见：状态 badge、当前页标题、当前域最小行动作。
- `max-width: 768px` 下隐藏桌面画布，显示编排摘要块。
- Drawer 全宽。
- 主卡片单列。
- 触摸目标最小 `44x44px`。

### 10.10 执行优先级

前端改动涉及工作区时，按以下顺序判断：

1. 任务域边界是否正确
2. L1 详情模型是否正确分配
3. 状态语义是否一致
4. 最后才是 token 和视觉抛光

前 3 步未收敛前，禁止把主要时间花在视觉润色上。

---

## 11. 智能体提示指南

### 11.1 实现基线

- 默认前端基线：`React + Vite + Ant Design + CSS Modules + CSS Variables + Zustand + xyflow`
- 不引入 `Tailwind CSS`
- 不引入新的主样式框架
- 不引入新的主组件库

### 11.2 实现优先级

当 AI 或工程实现者要改前端时，先回答这 5 个问题：

1. 当前改动属于哪个任务域？
2. 当前区域属于 `Shell Layer` 还是 `Editor UI Layer`？
3. 详情应进入 `Drawer` 还是 `Inspector`？
4. 当前颜色表达的是运行态、发布态，还是选中态？
5. 是否应该优先复用现有 `Ant Design` 或 `Editor UI` 组件，而不是新增自由样式？

### 11.3 快速颜色参考

| 角色 | 值 |
|---|---|
| 页面背景 | `#f4f8f5` |
| 内容表面 | `#ffffff` |
| 主强调色 | `#00d992` |
| 运行中 | `#00d992` |
| 等待中 | `#ffba00` |
| 失败 | `#fb565b` |
| 成功 | `#19b36b` |
| 选中 | `#2bb9b1` |
| 默认边框 | `#d5ddd8` |
| 主文本 | `#16211d` |

### 11.4 默认落地策略

- 画布外优先用 `Ant Design`，再按本规范校正 token 和层级。
- 画布内优先用 `xyflow + Editor UI` 封装，不直接把 Shell 组件生搬进节点主体。
- 如设计灵感与本规范冲突，以任务域边界、L1 模型和状态语义为准，而不是以外部参考图为准。
