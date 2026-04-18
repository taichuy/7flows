# 1flowbase Visual Baseline

## Authority

- 唯一权威规则源：`DESIGN.md`
- 外部视觉样本库只能作为灵感，不得与项目 `DESIGN.md` 并列
- `awesome-design-md` 可局部借鉴技法，不可整份迁移或覆盖当前基线
- 风格和 UI 质量是正式验收项，不是实现完成后的附属润色

## Product Direction

1flowbase 默认是**工具型控制台**，不是营销页，不是消费型 App：

- 白底或浅底，高对比，近黑正文
- 主色明确，但状态色语义唯一
- 圆角锐利，主范围 `4px-8px`
- 阴影克制，只保留卡片和浮层两档
- 排版偏工具型，不做 hero 式情绪化标题

默认不接受以下偏移，除非先和人确认：

- 大面积深底 + 白字仪表盘风格
- `16px+` 大圆角
- 与状态无关的装饰性彩色
- 营销页式大标题和品牌化气氛

## Two Expression Layers

### Shell Layer

- 面向导航、列表、表单、详情、抽屉、日志、API 页面
- 基础设施优先复用 `Ant Design`
- 不能直接裸用默认样式，需要回收到项目 token 和页面语法

### Editor UI Layer

- 面向画布、节点、端口、工具栏、Inspector
- 比壳层更紧凑、更少装饰，但仍共享同一套 token
- 只做薄封装，不扩成第二套全站组件库

## Shared Invariants

- 类型 badge 保持中性，不使用状态色
- `running / waiting / failed / success / draft / selected` 只表达真实语义
- `selected` 只用 outline 和轻高亮，不占用运行状态颜色
- Shell 列表状态点、`NodeCard` 状态 badge、Inspector 状态字段必须引用同一组状态变量

## Borrowing From External Inspiration

- 可以吸收 `Vercel` 的边框、阴影和壳层克制感
- 可以吸收 `Linear` 的密度控制和微交互精度
- 不要把外部品牌色、深色气氛、营销 hero 直接带进 1flowbase 工作区
