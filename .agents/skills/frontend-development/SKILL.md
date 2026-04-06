---
name: frontend-development
description: 用于在 7Flows `web/` 中实际实现或重做前端页面、组件与编辑器交互。适用于把现有界面收口到以 Ant Design 为主的设计系统、推进 Minimalist Monochrome 视觉风格，以及围绕 xyflow 无限画布做 Dify 思路式但不照搬的工作台改造。
---

# 7Flows 前端开发

## 何时使用

当任务属于以下任一场景时使用：

- 在 `web/` 下新增或重做页面、组件、工作台入口、编辑器交互
- 把现有界面收口到更统一的 Ant Design 主题与设计系统
- 把当前“卡片堆叠 + 大段说明文案”的页面改造成更强结构化交互
- 推进 workflow editor / infinite canvas / inspector / launcher / publish 等作者侧核心体验
- 参考 Dify 的“无限画布 + 自动排版 + 编辑器状态 + 历史”思路，但需要回到 7Flows 现有代码现实实现

优先组合：

- `component-refactoring`：当目标区域职责已经混乱、要顺手拆 Hook 或子组件时
- `frontend-testing`：当目标区域已有测试，或这次要补关键交互测试时
- `browser-automation`：当需要真实点页面、留截图、验证画布交互或视觉回归时

不要用于：

- 纯代码审查：改用 `frontend-code-review`
- 纯测试补齐：改用 `frontend-testing`
- 只做轻微文案、样式小修补且不涉及结构或设计系统收敛的任务

## 先建立现实模型

开始前先读：

1. `AGENTS.md`
2. `web/AGENTS.md`
3. `docs/product-design.md`
4. `docs/open-source-positioning.md`
5. `docs/technical-design-supplement.md`
6. `docs/dev/team-conventions.md`
7. `web/package.json`
8. `web/app/globals.css`
9. `web/app/layout.tsx`
10. 目标页面 / 组件 / Hook 所在目录

如果任务涉及 workflow editor，再优先补读：

- `web/components/workspace-shell.tsx`
- `web/components/workflow-editor-workbench/use-workflow-editor-shell-state.ts`
- `web/components/workflow-editor-workbench/use-workflow-editor-graph.ts`
- `web/components/workflow-editor-workbench/workflow-editor-canvas.tsx`
- `web/components/workflow-editor-workbench/workflow-canvas-node.tsx`
- `web/components/workflow-editor-inspector.tsx`
- `web/components/workflow-node-config-form/*`

### 当前仓库前端现实

- 技术栈是 `Next.js 15 App Router + React 19 + TypeScript`
- 组件库主轴已经是 `antd@6` 和 `@ant-design/icons`
- 无限画布底层已经接入 `@xyflow/react`，编辑器主目录在 `web/components/workflow-editor-workbench/`
- 当前还没有看见统一的 `ConfigProvider` 主题入口或共享 design token 层
- `web/app/globals.css` 仍保留大量 legacy 样式：`Inter`、圆角、渐变、阴影、卡片化信息块与一些内联样式习惯
- 编辑器状态目前主要分散在局部 Hook 与容器组件里，还不是 `zustand` / `zundo` 方案
- 仓库当前没有默认安装 `elkjs`、`zustand`、`zundo`，它们只能作为有明确收益的增量依赖引入，而不是假定已经存在

不要假设当前仓库已经有 Dify 的 `workflowStore`、分析脚本、editor service hook 体系或节点 DSL。若借鉴 Dify，只能借它的分层思路，不能把不存在的基础设施硬搬进来。

## 任务分析

在提出方案或写代码前，先用 2~4 个聚焦问题对齐目标，至少覆盖：

1. 用户要的是：
   - 单个组件 / 页面改版
   - 现有组件体系收口到新设计系统
   - 还是直接开发新的页面 / 编辑器功能
2. 这次范围是：
   - 只改目标页面
   - 还是连同主题 token、基础布局和交互壳层一起收口
3. 如果任务涉及 editor：
   - 只做视觉与交互改造
   - 还是连画布状态、自动排版、撤销重做与节点规则分层一起调整
4. 有没有明确约束：
   - 不能加依赖
   - 需要兼容旧样式
   - 要优先桌面端或移动端

在真正动手前，应先给出一段简短的现实总结：

- 当前技术栈
- 当前 token / 全局样式现实
- 当前组件结构与状态管理现实
- 推荐的最小实现范围

## 默认设计方向

这类任务默认采用 `Minimalist Monochrome`，并通过 Ant Design idiomatic 地落地，而不是再起一套与现有栈平行的小型 CSS 框架。

设计与 token 细节见：

- [references/minimalist-monochrome-antd.md](references/minimalist-monochrome-antd.md)

必须坚持：

- 纯黑白主轴，灰阶只用于次级文字与轻边界
- 0px 圆角
- 无阴影
- 线条、边框、反相、留白替代“彩色强调”
- Typography 是主视觉，不是填空项
- 交互反馈尽量即时，避免慢吞吞的 easing 动画

## 交互与布局原则

### 1. 绝对禁止卡片堆叠式页面

不要像某些旧页面那样：

- 一页堆很多形似但职责不同的卡片
- 永久暴露大段解释文字、提示词、治理说明
- 缺少 modal / drawer / popover / tabs 等子交互承接细节

优先使用 Ant Design 现成结构化交互：

- `Layout` / `Splitter`：搭工作台骨架、左右栏、上下分区
- `Drawer`：承接 inspector、node library、移动端侧栏
- `Modal`：承接确认、创建、详情 drill-in、配置向导
- `Tabs` / `Segmented` / `Collapse`：收纳二级信息，而不是平铺成长页面
- `Dropdown` / `Popover` / `Tooltip`：承接轻量上下文操作与解释
- `Empty` / `Result` / `Alert`：做空态、阻塞态、失败态，不要自己拼说明卡堆

### 2. 加载态、等待态和过渡态默认极简

- `loading.tsx`、bootstrap loading、局部 pending state 默认优先做居中 `Spin`、必要的 `Skeleton` 或覆盖当前 surface 的轻遮罩。
- 除非当前页面真的要求用户在加载中理解阻塞原因或立即做决策，否则不要在 loading / waiting surface 里写大段说明文、策略解释或阶段叙事。
- 如果底层壳层、导航或上下文已经存在，优先保留壳层可见，只遮罩当前活跃 surface；不要再额外插入一张占正文主区的说明卡。
- 长解释应留给 empty / error / governance / diagnostics 这类稳定 surface，而不是临时加载态。

### 3. 视觉壳层先于局部补丁

如果目标页面明显仍在 legacy 视觉体系里：

1. 先决定 token、字体、边框、留白、反相区块如何统一
2. 再改具体组件

不要跳过壳层，直接在单个卡片上叠更多样式补丁。

### 4. 保持当前仓库的组件组织方式

- 页面入口放在 `web/app/`
- 复杂表面组件放在 `web/components/<domain>/`
- 纯推导、presenter、surface copy builder、适配器放在 `web/lib/` 或同目录 `presentation.ts`
- 复杂状态先抽 Hook；只有当 editor 级状态已经横跨多个壳层时，才考虑 scoped store

只有在重复模式已经出现 3 次以上时，才新增更通用的 `ui` 层或布局 primitive。

## 无限画布专项

当任务命中 workflow editor / infinite canvas 时，再读：

- [references/workbench-architecture.md](references/workbench-architecture.md)

默认分层：

1. `@xyflow/react`
   - 只负责无限平面、节点边渲染、缩放、拖拽、视口
2. layout adapter
   - 若需要自动排版，再引入 `elkjs`
   - 排版逻辑必须集中在 adapter / helper，不要散落在组件 JSX
3. editor state / history
   - 当前先尊重现有 Hook 组织
   - 当节点图、selection、panel state、undo/redo 已跨多个组件耦合时，再引入 scoped `zustand + zundo`
4. 7Flows IR adapter
   - 负责把持久化 workflow、node config、publish/runtime 事实映射到前端编辑器视图模型
   - 不能变成第二套内部 DSL

### 画布开发硬约束

- Dify 只是参考“plane / layout / store / rule”的职责拆分，不是命名模板
- 节点规则、字段显隐、授权边界、治理状态要落在 registry / presenter / helper，不要散在 JSX 里到处 `if`
- node config、publish、assistant、diagnostics 这些编辑器二级能力，优先放进 inspector / drawer / modal，不要继续铺成画布旁边的一长列卡片
- 撤销重做如果升级为 store 方案，要明确 snapshot 粒度，避免把异步加载态、hover 态这类噪音也塞进历史记录

## 推荐实施顺序

1. 读目标表面与相邻组件，标记 legacy token、内联样式、卡片堆叠和交互断点
2. 先定义共享 token / 主题收口方案，再决定组件改造顺序
3. 先改工作台骨架与信息层级，再改局部模块
4. 若命中 editor，再拆 plane / layout / store / inspector 边界
5. 只在收益清晰时新增依赖，如 `elkjs`、`zustand`、`zundo`
6. 在目标目录补最小必要测试或回归用例
7. 跑 lint / typecheck / 目标测试，必要时再做浏览器 smoke

## 实现细则

- 优先通过 `ConfigProvider` 主题、共享 CSS 变量和少量全局重置统一视觉，不要把 token 写死在每个组件里
- 自定义 CSS 重点只放在：
  - 设计 token / reset
  - 纹理背景
  - editorial typography
  - canvas node chrome
  - Ant Design 覆盖不到的结构化布局细节
- 优先复用 `Typography`、`Flex`、`Space`、`Form`、`Input`、`Select`、`Tabs`、`Drawer`、`Modal`、`Table`、`Descriptions`、`Tag`、`Badge`、`Empty`、`Result`、`Tooltip`
- 图标优先沿用现有 `@ant-design/icons`；没有明确必要，不要顺手引入第二套图标库
- 复杂页面要优先抽 `presentation.ts`、view model builder 或 Hook，避免 JSX 里同时做：
  - 文案拼装
  - 状态推导
  - 权限判断
  - 协议映射

## 常见反模式

- 为了“做得快”又塞一页圆角阴影卡片
- 保留整块 prompt / 说明文永久可见，导致视觉噪音盖过操作本身
- 把 loading / waiting surface 做成正文卡片，再塞进标题、摘要、阶段说明和大段解释文案
- Ant Design 组件只拿来当壳，真正主题全靠一堆局部覆盖和内联样式硬拼
- 为单个页面引入 Tailwind / shadcn / 新状态库，导致栈分裂
- 没有清楚收益就把整个 `web/` 改写成 Dify 风格 store 体系
- 前端假装 backend capability 已存在，尤其是 runtime policy、sandbox、publish auth、compat adapter 这类能力

## 验证要求

前端改动至少运行：

```bash
corepack pnpm --dir web lint
corepack pnpm --dir web exec tsc --noEmit --incremental false
```

如果目标区域已有测试，补跑最小相关测试：

```bash
corepack pnpm --dir web exec vitest run <target-test>
```

如果这次改动明显影响真实交互、视觉层级或画布行为，再组合 `browser-automation` 做一次最小 smoke。
