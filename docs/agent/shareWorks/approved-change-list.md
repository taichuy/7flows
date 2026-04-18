# 批准变更单

日期：2026-04-12
授权方：planner（任务 `976da4d7`）
执行方：worker（任务 `e5635f29` / `a711d18d`）
依据：`docs/agent/shareWorks/planner-design-decisions.md`

---

## Part A：tmp/demo 变更（任务 e5635f29）

### A-1 移除概览页多余内容（index.html）

**删除或替换以下区域**（按在 index.html 中的顺序）：

| 区域 | 当前行号参考 | 处理方式 |
|---|---|---|
| 页面顶部设计说明文字（"Default Visual Baseline" 标题区、Three rules、Tone chips 说明） | `index.html:20-60` | **完全删除**，不保留 |
| Hero 区下方所有 dashboard section 中的 `Publish contract` 完整 form 表单 | `index.html:212-252` 附近 | **替换**为精简的 publish status 展示块（见 A-1a） |
| `API surface` card 整块 | `index.html:254-272` 附近 | **完全删除** |
| `Embedded app` empty state card 整块 | `index.html:274-298` 附近 | **完全删除** |
| Editor Studio 整个 section（canvas + inspector + toolbar） | `index.html:274-408` 附近 | **完全删除**（桌面端也移除，由 A-4 中的 mobile 策略处理） |

> ⚠️ **注意**：删除 canvas/inspector section 时，同步检查 `script.js` 中 `nodeDetails` 数据和节点点击事件绑定，删除对应代码避免悬挂引用（run drawer 相关代码保留）。

**A-1a：精简 publish status 展示块（替换原 publish form）**

替换为如下语义结构（样式沿用现有 token，不新增类）：

```html
<div class="card">
  <div class="card-header">
    <span class="label-uppercase">发布状态</span>
  </div>
  <div class="card-body">
    <div class="status-row">
      <span class="status-dot status-dot--success"></span>
      <span class="status-text">已发布</span>
      <span class="status-meta">上次发布：2026-04-10 14:32</span>
    </div>
    <a href="#" class="btn btn-primary" style="margin-top: 16px;">进入编排</a>
  </div>
</div>
```

> `btn btn-primary` 即现有主按钮样式，`status-dot--success` 使用绿色状态语义色（见 A-3）。

---

### A-2 更新左侧导航（index.html）

**目标**：将 `Overview / AgentFlow / API Docs / Run Logs / State Data` 替换为符合 spec 的四栏导航，并将元素类型从 `<button>` 改为 `<a>`。

```html
<!-- 原有 sidebar nav 区域，替换内容如下 -->
<nav class="sidebar-nav" aria-label="应用导航">
  <a href="#" class="sidebar-nav-item" data-demo="pending">编排</a>
  <a href="#" class="sidebar-nav-item" data-demo="pending">应用 API</a>
  <a href="#" class="sidebar-nav-item" data-demo="pending">调用日志</a>
  <a href="#" class="sidebar-nav-item" data-demo="pending">监控报表</a>
</nav>
```

> - 所有项均为 demo 待实现状态（`data-demo="pending"`），视觉完整，不加 disabled 样式
> - CSS 中原 `.sidebar button` 选择器改为 `.sidebar-nav-item`（或添加别名），保持视觉一致
> - `Overview` 不作为导航项（它是当前页面，即应用根落点）

---

### A-3 统一状态语义颜色（styles.css）

在现有 CSS token 区域（文件顶部变量区）确保以下状态色变量存在且语义唯一：

```css
/* 状态色 — 不允许将这些颜色用于非状态语义 */
--status-running:  #146ef5;   /* 主色，仅用于"系统执行中" */
--status-waiting:  #ff9500;   /* 橙，等待/排队 */
--status-failed:   #ee1d36;   /* 红，执行失败/错误 */
--status-success:  #00d722;   /* 绿，成功完成 */
--status-draft:    #ababab;   /* 灰，草稿/未发布 */
--status-selected: #3b89ff;   /* 浅蓝，选中态高亮 — 不与 running 混用 */
```

在 run list 的状态点、inspector 的状态字段处，统一改用这套变量。当前若有硬编码的十六进制颜色（如 `color: #00d722`）一律替换为对应变量。

---

### A-4 修复抽屉模态契约（index.html + styles.css + script.js）

#### index.html 修改

在 drawer 根元素上补充 ARIA 属性：

```html
<!-- 原来 -->
<div id="run-drawer" class="drawer">

<!-- 改为 -->
<div id="run-drawer" class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" hidden>
```

> `hidden` 属性使 drawer 默认处于 `display: none` 并退出交互树。

在 drawer 内部，确保标题有 id：

```html
<h2 id="drawer-title" class="drawer-title"><!-- 动态填入 run title --></h2>
```

#### styles.css 修改

移除原来 `.drawer` 的 transform-only 显隐逻辑，改为：

```css
/* 关闭态：display:none 由 hidden attribute 控制，不需要 CSS 额外写 */

/* 打开态（JS 移除 hidden 后的过渡） */
.drawer.is-open {
  transform: translateX(0);
}

/* 初始过渡起点（已移除 hidden 但尚未添加 is-open 时）*/
.drawer:not(.is-open) {
  transform: translateX(100%);
}

/* 防止背景滚动（由 JS 在 body 上加 class） */
body.drawer-open {
  overflow: hidden;
}
```

> 如果原来是通过 CSS class toggle 来做 transform，则保持 class toggle 机制，只增加 `hidden` attribute 的配合。关键是：关闭态必须有 `hidden`，打开态必须移除 `hidden`。

#### script.js 修改

打开抽屉流程（替换原 `openDrawer` 或等价函数）：

```js
function openDrawer(runData, triggerEl) {
  const drawer = document.getElementById('run-drawer');
  // 1. 记录触发元素（关闭后回退焦点）
  drawer._triggerEl = triggerEl;
  // 2. 填充内容（原有逻辑保留）
  fillDrawerContent(runData);
  // 3. 先移除 hidden（display:none → visible），再用 rAF 添加 is-open（触发 transition）
  drawer.removeAttribute('hidden');
  requestAnimationFrame(() => {
    drawer.classList.add('is-open');
    document.body.classList.add('drawer-open');
    // 4. 将初始焦点移入 drawer（移到 Close 按钮或 title）
    const firstFocus = drawer.querySelector('button, [href], [tabindex="0"]');
    if (firstFocus) firstFocus.focus();
  });
}
```

关闭抽屉流程：

```js
function closeDrawer() {
  const drawer = document.getElementById('run-drawer');
  drawer.classList.remove('is-open');
  document.body.classList.remove('drawer-open');
  // 等 transition 结束再设 hidden（避免视觉跳变）
  drawer.addEventListener('transitionend', function onEnd() {
    drawer.setAttribute('hidden', '');
    drawer.removeEventListener('transitionend', onEnd);
    // 焦点回退到触发元素
    if (drawer._triggerEl) {
      drawer._triggerEl.focus();
      drawer._triggerEl = null;
    }
  }, { once: true });
}
```

最小焦点约束（Tab 循环）：

```js
drawer.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') { closeDrawer(); return; }
  if (e.key !== 'Tab') return;
  const focusables = Array.from(
    drawer.querySelectorAll('button:not([disabled]), [href], [tabindex="0"]')
  ).filter(el => !el.closest('[hidden]'));
  if (!focusables.length) return;
  const first = focusables[0], last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault(); last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault(); first.focus();
  }
});
```

---

### A-5 移动端首屏重排（styles.css + index.html）

#### styles.css 修改

在 `max-width: 767px` 断点（或当前最接近的断点）中：

```css
@media (max-width: 767px) {
  /* 1. 侧边栏变为顶部折叠区，主内容优先 */
  .layout {
    flex-direction: column;
  }
  .sidebar {
    width: 100%;
    order: 2;          /* 侧边栏排到主内容之后 */
    border-right: none;
    border-bottom: 1px solid var(--border-color, #d8d8d8);
  }
  .main-content {
    order: 1;          /* 主内容优先显示 */
    width: 100%;
  }

  /* 2. Editor canvas section 在小屏完全隐藏 */
  .editor-studio,
  .editor-section {         /* 使用当前实际 class 名 */
    display: none;
  }

  /* 3. 移除 canvas 强制最小宽度（即使不在 mobile 也应修复） */
  .editor-canvas {
    min-width: unset;
  }

  /* 4. Drawer 宽度限制在视口内 */
  .drawer {
    width: 100%;
    max-width: 100vw;
  }
}
```

#### index.html 修改

在 editor studio section 被删除后（A-1 已删除），在原位置插入移动端摘要块（**仅在移动端可见，桌面端隐藏**）：

```html
<!-- 编辑器摘要（移动端专用，桌面端隐藏） -->
<div class="card editor-summary-mobile" aria-label="画布编排摘要">
  <div class="card-header">
    <span class="label-uppercase">编排画布</span>
  </div>
  <div class="card-body">
    <p class="text-secondary">当前画布包含 4 个节点，最近修改：2026-04-11</p>
    <p class="hint-text">画布编排请在桌面端操作</p>
  </div>
</div>
```

对应 CSS（加在 styles.css 中）：

```css
/* 桌面端隐藏 mobile 摘要块 */
.editor-summary-mobile {
  display: none;
}
@media (max-width: 767px) {
  .editor-summary-mobile {
    display: block;
  }
}
```

---

### A-6 假按钮降级（index.html）

| 控件 | 修改方式 |
|---|---|
| Topbar `Compare tokens` | 改为 `<a href="#" class="topbar-link">Compare tokens</a>` |
| Topbar `Open API page` | 改为 `<a href="#" class="topbar-link">Open API page</a>` |
| `View all`（run list） | 改为 `<a href="#" class="link-text">View all</a>` |
| `Publish draft` 按钮 | 保留 `<button>` 但加 `data-demo="pending"` 并通过 CSS 改为次级样式（见下） |

```css
/* Publish draft demo 状态样式 */
[data-demo="pending"].btn-primary {
  background: transparent;
  color: var(--text-secondary, #5a5a5a);
  border: 1px solid var(--border-color, #d8d8d8);
  cursor: default;
}
[data-demo="pending"].btn-primary:hover {
  transform: none;   /* 取消 translate hover 动效 */
}
```

---

## Part B：DESIGN.md 变更（任务 a711d18d）

在 `docs/draft/DESIGN.md` 末尾追加以下章节（**临时增补，待二轮 demo 验证后再决定是否固化**）：

```markdown
## 10. 产品应用层补充规则（临时，2026-04-12）

> 以下规则基于 1flowbase demo 评审结论制定，适用于应用控制台界面。待二轮验证后决定是否纳入主规范。

### 10.1 两层系统

控制台由两层构成，共享同一套 token，但有不同的密度和装饰策略：

- **Shell Layer**（控制台壳层）：导航、列表、表单、详情页、抽屉——使用 Ant Design 组件基础设施，通过 token 覆盖匹配产品风格
- **Editor UI Layer**（画布层）：节点、连线、端口、inspector、工具栏——更高密度、更少装饰、更强状态差异；不引入与 Shell 完全不同的视觉语言

### 10.2 状态色语义

状态色必须语义唯一，不允许相同颜色承载不同状态含义：

| 状态 | 颜色角色 |
|---|---|
| running / active | 主色蓝（#146ef5） |
| waiting / pending | 橙（#ff9500） |
| failed / error | 红（#ee1d36） |
| success / healthy | 绿（#00d722） |
| draft | 灰（#ababab） |
| selected（用户选中态） | 浅蓝（#3b89ff），不与 running 混用 |

### 10.3 L1 详情模型规则

- Shell 列表 → 右侧抽屉（模态，带焦点约束和回退）
- Canvas 节点 → 原地 Inspector 面板（非模态，保留画布上下文）
- 两种模型不在同一交互层混用
- 不引入第三种模型（独立页面详情、overlay modal）而不经过设计评审

### 10.4 抽屉最小模态契约

1. 关闭态：`hidden` attribute，不可聚焦
2. 打开态：`role="dialog"` + `aria-modal="true"`，初始焦点移入
3. Tab 循环限制在 drawer 内部
4. Escape 关闭
5. 关闭后焦点回退触发元素

### 10.5 应用概览页边界

根路由（应用概览页）只承载：
- 基本信息（名称、简介、状态）
- 发布状态（展示，非管理）
- 最近运行摘要（最多 3 行）
- 单一主入口：`进入编排`

不在概览页承载：完整 editor canvas、API 文档、Embedded app 管理、完整 publish 表单。

### 10.6 移动端策略

- 主工作区内容优先，导航次之
- 小屏（< 768px）editor canvas 降级为摘要 + 引导入口，不保留横向滚动的半残废画布
- 首屏必须能看到应用状态和主入口，不被导航栏/说明文字吃掉
```

---

## 执行顺序建议（for worker）

1. 先改 `index.html`（结构先定）
2. 再改 `styles.css`（视觉和布局跟上）
3. 最后改 `script.js`（只动必须改的交互逻辑）
4. 运行桌面快速验证（`1440x900`），重点检查：run drawer 完整流程、无悬挂按钮
5. 运行移动端快速验证（`390x844`），重点检查：首屏优先级、canvas 摘要块显示正常
6. `DESIGN.md` 追加内容独立完成，不依赖 demo 结果

---

*本变更单由 planner 在任务 `976da4d7` 中生成，最终执行结果由 worker 报告给 Codex 确认。*
