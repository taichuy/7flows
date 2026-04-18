# QA Top 5 Baseline Issues

日期：2026-04-12  
范围：`tmp/demo/*`、`docs/draft/DESIGN.md`、`docs/superpowers/specs/1flowbase/2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md`
评审标准：`frontend-development` + `frontend-logic-design`

## 1. 基线页边界塌陷，演示页变成“所有东西的拼盘”

- 位置：
  `tmp/demo/index.html:16-60`
  `tmp/demo/index.html:96-408`
  `docs/superpowers/specs/1flowbase/2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md:18-19`
  `docs/superpowers/specs/1flowbase/2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md:51-60`
  `docs/superpowers/specs/1flowbase/2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md:64-82`
- 问题：
  同一屏同时承载设计说明、导航、概览指标、运行列表、发布表单、API 样例、空态、整块 Editor UI。它既像产品首页，又像编排页、API 页和设计评审板，已经不是一个可复用的页面语法。
- 为何严重：
  这个 demo 被拿来验证“默认视觉基线”，但当前先冻结的不是基线，而是错误的页面边界。后续任何人照着它做，都可能把 L0 概览、L1 聚焦、L2 管理、L3 执行继续混在一页里，直接污染产品信息架构。
- 建议方向：
  先拆清楚页面职责，再谈视觉细节。根页只保留概览与主入口；完整发布配置、API 细节、Editor 画布分别回到各自任务域。若只是评审样板，应明确标记为 review board，而不是 baseline candidate。

## 2. 页面大面积存在“假交互”，可见控件没有结果

- 位置：
  `tmp/demo/index.html:29-33`
  `tmp/demo/index.html:76-92`
  `tmp/demo/index.html:138`
  `tmp/demo/index.html:267-269`
  `tmp/demo/index.html:290-297`
  `tmp/demo/script.js:107-155`
- 问题：
  页面上大多数主按钮都没有行为。脚本只接了 run row、node、drawer close 和 compact toggle；导航、顶部 CTA、`View all`、`Upload static bundle`、编辑器工具栏全部是 no-op。
- 为何严重：
  这不是“还没接功能”这么简单，而是在示范错误的交互契约。用户无法从页面学会“什么能点、点了去哪里、结果属于哪一层深度”，未来实现者也会被误导，把按钮当装饰而不是结果承诺。
- 建议方向：
  所有视觉按钮二选一：要么接上真实结果并说明目标层级，要么立即降级为静态标签/文案。共享基线里不应保留大面积 no-op 控件。

## 3. 抽屉契约是坏的：看起来像详情层，实际上不是合格的 L1

- 位置：
  `tmp/demo/index.html:412-458`
  `tmp/demo/styles.css:771-792`
  `tmp/demo/script.js:73-119`
- 问题：
  抽屉关闭时只是 `transform` 移出视口，节点仍在 DOM 中；打开时没有 `aria-modal`、初始焦点、Tab 约束、关闭后焦点回退。`aria-hidden` 只改朗读提示，没有真正退出交互树。
- 为何严重：
  run list 是页面里最像“统一详情模型”的区域，但它依赖的抽屉本身不成立。这样一来，L1 下钻规则看似被定义了，实际上键盘流、屏幕阅读器流和视觉流是断裂的，后续复制这套模式只会把缺陷扩散出去。
- 建议方向：
  把抽屉当成正式交互层来补齐最小契约：关闭态退出可见树和交互树；打开态声明模态语义、管理焦点、支持关闭后回到触发点。移动端若仍保留此模式，也应重新审视容器降级策略。

## 4. 状态语义没有统一：类型、状态、选择态、标签共用一套颜色语法

- 位置：
  `tmp/demo/index.html:41-45`
  `tmp/demo/index.html:54-59`
  `tmp/demo/index.html:195`
  `tmp/demo/index.html:236`
  `tmp/demo/index.html:281-283`
  `tmp/demo/index.html:328-365`
  `tmp/demo/index.html:386-439`
  `tmp/demo/styles.css:234-270`
  `tmp/demo/styles.css:465-482`
  `tmp/demo/styles.css:685-694`
  `tmp/demo/script.js:1-71`
  `docs/superpowers/specs/1flowbase/2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md:39`
  `docs/superpowers/specs/1flowbase/2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md:75-81`
  `docs/superpowers/specs/1flowbase/2026-04-12-frontend-visual-baseline-and-skill-evolution-design.md:90-99`
- 问题：
  `tone-chip` 同时表示 publish、healthy、waiting、editor、draft、short/flat、selected state；node badge 又用颜色表示节点类型；list 用状态点；drawer 和 inspector 则退回纯文本。页面没有一张清晰的“状态语义表”。
- 为何严重：
  spec 明确要求壳层与 Editor UI 共享状态表达，且辅助色必须语义明确、不能变成装饰。当前 demo 反而把颜色同时拿去表达组件类别、运行真相、选择态和文案标签，等于把整个视觉基线最重要的语义层做乱了。
- 建议方向：
  先定义统一状态字典，再落组件。把 `kind`、`status`、`selection`、`meta tag` 分离；高彩色只保留给系统真相，类型标签和信息标签退回中性语法；shell 与 editor 用同一映射表达 `waiting / failed / running / healthy / selected`。

## 5. 移动端没有重排优先级，只是把桌面内容纵向堆下去

- 位置：
  `tmp/demo/styles.css:869-914`
  `tmp/demo/mobile.png`
  `tmp/demo/index.html:16-60`
  `tmp/demo/index.html:274-408`
- 问题：
  小屏下 sidebar、规则说明、palette 全量保留在上方，真正工作区被压到首屏以下；Editor 区域仍要求 `min-width: 760px`，进入后只能横向滚动。
- 为何严重：
  默认视觉基线如果在 390px 首屏连核心状态和主入口都给不出来，就不能叫 baseline。当前移动端不是“响应式收敛”，而是把桌面评审板原样叠成一列，既不符合 mobile-first，也无法验证真实任务优先级。
- 建议方向：
  重新定义小屏第一屏：应用状态、关键 CTA、最短任务路径优先；导航折叠，设计说明移出产品 UI；Editor 若不支持手机直接编辑，就降级为摘要态或独立入口，而不是保留必须横向滚动的半成品画布。
