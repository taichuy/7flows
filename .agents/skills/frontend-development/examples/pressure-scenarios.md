# Frontend Pressure Scenarios

## Scenario 1: One-Off Component Extraction

症状：

- 某个页面里出现一段 30 行 JSX
- 只有这一个地方用到
- 你想先抽成公共组件

结论：

- 不要因为“看起来更模块化”就先抽
- 先看变化原因是否单一、是否会出现第二个真实使用点

## Scenario 2: Overview Scope Creep

症状：

- 你在应用根概览页里顺手加完整画布、完整 API 卡片、完整日志列表
- 页面看起来更“充实”，但主问题开始模糊

结论：

- `overview` 只回答概览问题
- 回到固定 recipe：头信息、发布状态、最近运行摘要、单一主入口

## Scenario 3: Nested Widget State Sprawl

症状：

- 页面根组件维护十几个 `useState`
- 子组件靠 props 层层下发控制弹窗、表单、筛选、加载

结论：

- 先收敛状态归属
- 页面保留页面级状态，局部交互状态下沉，共享状态只保留跨区域协调

## Scenario 4: A Third L1 Model Appears

症状：

- run row 点击开 `Drawer`
- node 点击更新 `Inspector`
- 你又想给另一类对象加 `Modal` 或独立详情页

结论：

- 先停手
- 1flowbase 当前只允许 `Drawer` 和 `Inspector` 两种 L1 模型
- 第三种必须先问人

## Scenario 5: It Is Not A Styling Problem

症状：

- 用户说“这个页面不对劲”
- 你第一反应是改 spacing、颜色、按钮

结论：

- 先检查是不是入口、层级、交互一致性问题
- 如果是结构问题，转交 `frontend-logic-design`

## Scenario 6: External Inspiration Drift

症状：

- 你看到 `awesome-design-md` 里某份 `DESIGN.md` 很完整
- 你想整份照抄进当前页面，顺便切成深色或品牌化风格

结论：

- 外部样本只能借鉴局部技法
- 当前项目仍以 `DESIGN.md` 为准
- 若要改变产品级视觉基线，先问人

## Scenario 7: Mobile Canvas Compression

症状：

- 小屏下画布只能靠横向滚动查看
- 你打算通过缩小字体、压缩间距“勉强塞下去”

结论：

- 不要伪造可用状态
- 移动端直接降级成摘要块和引导文案

## Scenario 8: Screenshot-Only Request

症状：

- 用户只丢来一张截图或竞品页面
- 说“按这个做一个页面”或“我想要这种感觉”
- 没有说明页面目标、主对象和关键动作

结论：

- 不要直接照着第三方视觉开写
- 先拆解这张图的结构、信息层级和组件组合
- 再回到 `DESIGN.md` 产出设计需求草案，并默认继续实现
- 只有仍有阻塞分歧时，才集中问“借什么、不借什么”

## Scenario 9: Vague New Page Request

症状：

- 用户说“做个设置页”或“帮我设计一个管理页面”
- 但没说明用户要完成什么任务、成功标准是什么

结论：

- 先收敛页面目标、核心动作、关键状态和必须模块
- 新页面把需求收敛后默认继续实现，不等额外确认
- 如果问题落在入口、层级和交互直觉，补用 `frontend-logic-design`
