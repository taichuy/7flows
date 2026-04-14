# 1Flowse 设置区 API 文档分类选择器重构设计稿

日期：2026-04-14
状态：已完成设计确认，待用户审阅
关联输入：
- [DESIGN.md](../../../../DESIGN.md)
- [web/AGENTS.md](../../../../web/AGENTS.md)
- [.agents/skills/frontend-development/SKILL.md](../../../../.agents/skills/frontend-development/SKILL.md)
- [docs/superpowers/specs/1flowse/2026-04-14-settings-api-docs-on-demand-design.md](./2026-04-14-settings-api-docs-on-demand-design.md)
- [web/app/src/features/settings/components/ApiDocsPanel.tsx](../../../../web/app/src/features/settings/components/ApiDocsPanel.tsx)
- [web/app/src/features/settings/components/api-docs-panel.css](../../../../web/app/src/features/settings/components/api-docs-panel.css)
- [web/app/src/features/settings/_tests/api-docs-panel.test.tsx](../../../../web/app/src/features/settings/_tests/api-docs-panel.test.tsx)

## 1. 文档目标

本文档用于冻结 `/settings/docs` 的分类切换改造方案：把当前“遍历展示分类卡片”的入口改成一个顶部选择器卡片，内部使用 `Ant Design Select` 提供分类切换和本地检索能力。

本轮设计聚焦：

- 保留 `/api/console/docs/catalog` 作为分类目录来源
- 保留 `?category=` 深链接与当前 Scalar 详情区
- 把分类入口从多卡片收口为单个顶部选择器卡片
- 让下拉支持按 `label + id` 检索，并忽略大小写和常见分隔符

本轮设计不覆盖：

- `catalog` 接口结构扩展
- 按接口路径搜索
- Scalar 详情区布局重做
- 设置区导航结构调整

## 2. 当前现状

### 2.1 分类入口仍是多卡片墙

当前 `ApiDocsPanel` 会遍历 `catalog.categories`，把每个分类渲染成一张点击卡片。结果是：

- 入口区占用较大垂直空间
- 分类数量增长后，视觉重点从“查看文档”变成“浏览卡片”
- 与设置页的管理台语义不一致，更像展示页而不是工具页

### 2.2 测试目标已收敛到单个选择器卡片

现有测试已经固定到以下方向：

- 顶部只有一个“当前分类”选择器卡片
- 卡片内存在 `combobox`
- 切换分类后继续同步 `?category=`
- Scalar 详情区按选中分类刷新

这说明当前待做的不是再讨论页面形态，而是让实现回到已确认的交互目标。

## 3. 设计结论

### 3.1 分类入口改为单个顶部选择器卡片

冻结后的页内结构：

- 页面头部：`API 文档` 标题、说明、总接口数
- 选择器卡片：`当前分类`、`已收录 N 个分类`、分类下拉框
- 详情区：当前分类的 Scalar 文档

不再渲染分类卡片列表。原因：

- 管理台页面应优先强调“当前选择了什么”，而不是“所有选项长什么样”
- 选择器更符合高密度后台的切换语义
- 后续分类继续增加时，布局不会继续向下膨胀

### 3.2 下拉组件使用 `Ant Design Select`

固定方案：

- 使用 `Select`
- 开启 `showSearch`
- 使用本地过滤，不引入远端搜索
- 选中项变化时继续复用现有 `updateCategoryQuery`

原因：

- 交互语义是确定性选择，不是自由输入
- `Select` 与当前项目的 Ant 壳层一致
- 不需要为少量分类引入新状态机或新请求

### 3.3 下拉项展示规则

每个 option 固定展示：

- 主标题：`label`
- 副标题：`id`
- 右侧元信息：`operation_count`

这样做的目的：

- 用户可直接识别展示名
- 内部分类标识不会“只能搜到但看不到”
- 接口数量仍可作为切换前的辅助判断

### 3.4 检索规则

检索固定命中：

- `label`
- `id`

匹配策略固定为：

- 不区分大小写
- 忽略常见分隔符：`-`、`/`、`:`、`_`、空格

例如：

- 搜 `runtime` 命中 `runtime`
- 搜 `single health` 命中 `single:health`
- 搜 `health` 命中 `/health` 或 `single:health`

不扩展到路径级搜索。原因是当前 `catalog` 接口不返回路径列表，本轮不引入额外接口耦合。

### 3.5 URL 与默认行为

固定行为：

- `/settings/docs` 打开时，优先读取 `?category=`
- 若参数合法，则选中对应分类
- 若参数缺失或无效，则回退到第一个可访问分类，并 `replace` 当前 URL
- 切换分类时清理旧的 `operation` 查询参数

这样可以保留：

- 深链接
- 刷新后回到当前分类
- 与现有设置页行为一致的 URL 真值层

## 4. 视觉与布局要求

### 4.1 选择器卡片风格

卡片保持管理台语义，不做卡片墙式视觉夸张：

- 单个白色表面
- 轻边框、轻阴影
- 顶部信息层次为“标题 > 摘要 > 控件”
- 控件宽度优先填满卡片内容区

### 4.2 下拉项信息密度

下拉项需在一个 option 内完成三层信息：

- 第一层：分类展示名
- 第二层：分类标识
- 第三层：接口数量

实现时优先使用 first-party wrapper class 组织 option 内容，不直接覆盖 `.ant-select-*` 内部链路。

## 5. 验收与测试

本轮前端验收固定覆盖：

- 默认进入 `/settings/docs` 时展示第一个分类
- 顶部选择器卡片存在，且可通过 `combobox` 访问
- 选择 `runtime` 或其他分类后，URL 更新为对应 `?category=`
- 详情区 Scalar 内容跟随分类切换
- 深链接 `?category=<id>` 能正确回填到选择器
- 样式文件不再保留旧的多卡片布局类作为主结构

实现阶段应优先通过：

- `web/app/src/features/settings/_tests/api-docs-panel.test.tsx`
- 与设置页相关的路由/页面测试
- 前端 lint、test、build

## 6. 实施边界

本轮改动应收敛在：

- `web/app/src/features/settings/components/ApiDocsPanel.tsx`
- `web/app/src/features/settings/components/api-docs-panel.css`
- `web/app/src/features/settings/_tests/api-docs-panel.test.tsx`

若为实现检索辅助而抽出极小的本地纯函数，可放入 `web/app/src/features/settings/lib/`，但不应把这次简单交互扩张成新的共享组件。
