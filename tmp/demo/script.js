const state = {
  activeView: "overview",
  activeNodeId: "classifier",
  activeRunFilter: "all",
  activeApiMode: "openai",
  activeMonitoringWindow: "24h",
  showDraftDiff: true,
};

const viewRoot = document.getElementById("viewRoot");
const navList = document.getElementById("navList");
const repoScopeList = document.getElementById("repoScopeList");
const focusList = document.getElementById("focusList");
const appShell = document.querySelector(".app-shell");

const drawer = document.getElementById("runDetailDrawer");
const drawerBackdrop = document.getElementById("drawerBackdrop");
const drawerCloseButton = document.getElementById("drawerClose");
const drawerTitle = document.getElementById("drawerTitle");
const drawerStatus = document.getElementById("drawerStatus");
const drawerReference = document.getElementById("drawerReference");
const drawerRuntime = document.getElementById("drawerRuntime");
const drawerContract = document.getElementById("drawerContract");
const drawerNode = document.getElementById("drawerNode");
const drawerStartedAt = document.getElementById("drawerStartedAt");
const drawerReason = document.getElementById("drawerReason");
const drawerRecovery = document.getElementById("drawerRecovery");
const drawerEvents = document.getElementById("drawerEvents");

const focusableSelector =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let lastDrawerTrigger = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function statusClass(status) {
  return `is-${status}`;
}

function renderStatusBadge(status, label) {
  return `<span class="status-badge ${statusClass(status)}">${escapeHtml(label)}</span>`;
}

function renderKindBadge(label) {
  return `<span class="kind-badge">${escapeHtml(label)}</span>`;
}

function renderMetaTag(label) {
  return `<span class="meta-tag">${escapeHtml(label)}</span>`;
}

function renderOutlineTag(label) {
  return `<span class="outline-tag">${escapeHtml(label)}</span>`;
}

function getNode(nodeId) {
  return nodes.find((node) => node.id === nodeId) ?? nodes[0];
}

function getRun(runId) {
  return runs.find((run) => run.id === runId);
}

function getHashView() {
  const hash = window.location.hash.replace("#", "");
  const validViews = ["overview", ...viewDefs.map((view) => view.id)];
  return validViews.includes(hash) ? hash : "overview";
}

function getFilteredRuns(filter) {
  if (filter === "all") {
    return runs;
  }

  return runs.filter((run) => run.status === filter);
}

function setView(nextView, options = {}) {
  if (options.nodeId) {
    state.activeNodeId = options.nodeId;
  }

  if (options.runFilter) {
    state.activeRunFilter = options.runFilter;
  }

  if (options.apiMode) {
    state.activeApiMode = options.apiMode;
  }

  if (options.monitoringWindow) {
    state.activeMonitoringWindow = options.monitoringWindow;
  }

  closeDrawer(false);
  state.activeView = nextView;

  if (getHashView() !== nextView) {
    window.location.hash = nextView;
    return;
  }

  render();
}

function renderSidebar() {
  navList.innerHTML = viewDefs
    .map((view) => {
      const isActive = state.activeView === view.id;
      return `
        <a
          href="#${view.id}"
          class="nav-item ${isActive ? "is-active" : ""}"
          data-view-trigger="${view.id}"
          aria-current="${isActive ? "page" : "false"}"
        >
          <strong>${escapeHtml(view.label)}</strong>
          <span class="section-copy">${escapeHtml(view.summary)}</span>
        </a>
      `;
    })
    .join("");

  repoScopeList.innerHTML = repoScope
    .map(
      (item) => `
        <div class="stack-row compact-row">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <p>${escapeHtml(item.note)}</p>
          </div>
          ${renderStatusBadge(item.status, item.statusLabel)}
        </div>
      `,
    )
    .join("");

  focusList.innerHTML = iterationFocus
    .map(
      (item) => `
        <li>
          <strong>${escapeHtml(item.title)}</strong>
          <span class="section-copy">${escapeHtml(item.note)}</span>
        </li>
      `,
    )
    .join("");

  document
    .querySelector(".app-home")
    ?.classList.toggle("is-active", state.activeView === "overview");
}

function renderSummaryStrip(items) {
  return `
    <section class="summary-strip">
      ${items
        .map(
          (item) => `
            <article class="summary-item">
              <span class="summary-value">${escapeHtml(item.value)}</span>
              <span class="summary-label">${escapeHtml(item.label)}</span>
            </article>
          `,
        )
        .join("")}
    </section>
  `;
}

function renderOverview() {
  const summaryItems = [
    { value: "1", label: "Published contracts" },
    { value: String(nodes.filter((node) => node.isDraftChanged).length), label: "Draft node changes" },
    { value: String(runs.filter((run) => run.status === "failed" || run.status === "waiting").length), label: "Runs needing attention" },
    { value: "0", label: "Embedded mounts connected" },
  ];

  return `
    <section class="view-panel" aria-labelledby="overviewHeading">
      <header class="view-hero surface-panel">
        <div>
          <p class="eyebrow">应用概览</p>
          <h1 id="overviewHeading">Revenue Copilot workspace demo</h1>
          <p>
            这版 demo 不再只是“漂亮截图”。它把当前仓库已有路由、未来 application workspace 结构，
            以及 node / contract / logs / monitoring 的交互路径收敛成一套可执行的工作区语言。
          </p>
        </div>

        <div class="view-hero-meta">
          ${renderStatusBadge("published", "Published v0.8.14")}
          ${renderStatusBadge("healthy", "Runtime healthy")}
          ${renderMetaTag("AgentFlow")}
          ${renderMetaTag("Embedded Apps")}
        </div>
      </header>

      ${renderSummaryStrip(summaryItems)}

      <div class="overview-grid">
        <article class="surface-panel span-5">
          <p class="eyebrow">主入口</p>
          <h2>进入编排，先看节点，再谈发布</h2>
          <p class="section-copy">
            概览页只回答当前状态、repo scope 与下一步要去哪。完整 flow 编辑、契约细节、逐条日志与观测都回到各自任务域。
          </p>
          <div class="action-row">
            <button
              class="primary-button"
              type="button"
              data-view-trigger="orchestration"
            >
              进入编排
            </button>
            <button
              class="secondary-button"
              type="button"
              data-view-trigger="logs"
              data-run-filter="failed"
            >
              查看失败样本
            </button>
          </div>
        </article>

        <article class="surface-panel span-7">
          <div class="section-head">
            <div>
              <p class="eyebrow">当前项目现状</p>
              <h2>现有路由与目标工作区同时可见</h2>
            </div>
          </div>
          <div class="stack-list compact-stack">
            ${repoScope
              .map(
                (item) => `
                  <div class="stack-row compact-row">
                    <div>
                      <strong>${escapeHtml(item.title)}</strong>
                      <p>${escapeHtml(item.note)}</p>
                    </div>
                    ${renderStatusBadge(item.status, item.statusLabel)}
                  </div>
                `,
              )
              .join("")}
          </div>
        </article>

        <article class="surface-panel span-6">
          <div class="section-head">
            <div>
              <p class="eyebrow">发布与契约</p>
              <h2>Published 与 Draft 明确分层</h2>
            </div>
          </div>
          <div class="stack-list">
            <div class="stack-row">
              <div>
                <strong>Published contract</strong>
                <p>当前 live traffic 仍走 OpenAI compatible，callback 已显式输出。</p>
              </div>
              ${renderStatusBadge("published", "Live")}
            </div>
            <div class="stack-row">
              <div>
                <strong>Current draft</strong>
                <p>Classifier 阈值、Approval gate 文案与 Reply composer 输出正在等待下一次 publish。</p>
              </div>
              ${renderStatusBadge("draft", "4 changes")}
            </div>
          </div>
          <div class="action-row">
            <button
              class="secondary-button"
              type="button"
              data-view-trigger="api"
              data-api-mode="openai"
            >
              查看 live contract
            </button>
            <button
              class="ghost-button"
              type="button"
              data-view-trigger="api"
              data-api-mode="claude"
            >
              查看 draft parity
            </button>
          </div>
        </article>

        <article class="surface-panel span-6">
          <div class="section-head">
            <div>
              <p class="eyebrow">当前热点</p>
              <h2>这轮需要继续盯的地方</h2>
            </div>
          </div>
          <div class="stack-list compact-stack">
            ${monitoringWindows["24h"].hotspots
              .map(
                (item) => `
                  <div class="timeline-row">
                    <div>
                      <strong>${escapeHtml(item.title)}</strong>
                      <p>${escapeHtml(item.note)}</p>
                    </div>
                    <button
                      class="secondary-button"
                      type="button"
                      data-view-trigger="${item.actionView}"
                      ${item.runFilter ? `data-run-filter="${item.runFilter}"` : ""}
                      ${item.apiMode ? `data-api-mode="${item.apiMode}"` : ""}
                    >
                      ${escapeHtml(item.actionLabel)}
                    </button>
                  </div>
                `,
              )
              .join("")}
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderCanvasNodes() {
  return nodes
    .map((node) => {
      const isSelected = state.activeNodeId === node.id;
      return `
        <button
          class="node-card ${isSelected ? "is-selected" : ""} ${node.isDraftChanged ? "is-draft-changed" : ""}"
          type="button"
          data-node-trigger="${node.id}"
          data-status="${node.status}"
          aria-pressed="${String(isSelected)}"
          style="left: ${node.position.left}px; top: ${node.position.top}px;"
        >
          <span class="node-meta-row">
            ${renderKindBadge(node.kind)}
            ${renderStatusBadge(node.status, node.statusLabel)}
            ${node.isDraftChanged ? renderOutlineTag("Draft change") : ""}
          </span>
          <strong>${escapeHtml(node.title)}</strong>
          <small>${escapeHtml(node.description)}</small>
          ${node.ports
            .map((port) => `<span class="node-port node-port-${port}"></span>`)
            .join("")}
        </button>
      `;
    })
    .join("");
}

function renderMobileNodes() {
  return nodes
    .map((node) => {
      const isSelected = state.activeNodeId === node.id;
      return `
        <button
          class="mobile-node-item ${isSelected ? "is-selected" : ""}"
          type="button"
          data-node-trigger="${node.id}"
          data-status="${node.status}"
          aria-pressed="${String(isSelected)}"
        >
          <span class="node-meta-row">
            ${renderKindBadge(node.kind)}
            ${renderStatusBadge(node.status, node.statusLabel)}
            ${node.isDraftChanged ? renderOutlineTag("Draft change") : ""}
          </span>
          <strong>${escapeHtml(node.title)}</strong>
          <small>${escapeHtml(node.description)}</small>
        </button>
      `;
    })
    .join("");
}

function renderInspector() {
  const node = getNode(state.activeNodeId);

  return `
    <aside class="surface-panel inspector-panel span-4">
      <p class="eyebrow">节点检查</p>
      <h2>${escapeHtml(node.title)}</h2>
      <p class="inspector-summary">${escapeHtml(node.summary)}</p>

      <div class="inspector-meta">
        ${renderKindBadge(node.kind)}
        ${renderStatusBadge(node.status, node.statusLabel)}
        ${node.isDraftChanged ? renderOutlineTag("Draft change") : ""}
      </div>

      <dl class="detail-grid detail-grid-single">
        <div>
          <dt>输入</dt>
          <dd>${escapeHtml(node.input)}</dd>
        </div>
        <div>
          <dt>输出</dt>
          <dd>${escapeHtml(node.output)}</dd>
        </div>
        <div>
          <dt>节点职责</dt>
          <dd>${escapeHtml(node.role)}</dd>
        </div>
        <div>
          <dt>契约影响</dt>
          <dd>${escapeHtml(node.contractImpact)}</dd>
        </div>
      </dl>

      <div class="stack-list compact-stack">
        <div class="stack-row compact-row">
          <div>
            <strong>最近变化</strong>
            <p>${escapeHtml(node.change)}</p>
          </div>
        </div>
      </div>

      <div class="action-row">
        <button
          class="secondary-button"
          type="button"
          data-view-trigger="logs"
          data-run-filter="${node.logsFilter}"
        >
          查看相关运行
        </button>
        <button
          class="ghost-button"
          type="button"
          data-view-trigger="api"
          data-api-mode="${node.apiMode}"
        >
          查看契约影响
        </button>
      </div>
    </aside>
  `;
}

function renderOrchestration() {
  const selectedNode = getNode(state.activeNodeId);
  const changedNodes = nodes.filter((node) => node.isDraftChanged);

  return `
    <section class="view-panel" aria-labelledby="orchestrationHeading">
      <header class="view-header surface-panel">
        <div>
          <p class="eyebrow">编排</p>
          <h1 id="orchestrationHeading">客户问询主流程</h1>
          <p>
            节点详情只在 Inspector 里更新，run 详情只在 Logs 的 Drawer 里打开。
            这两个 L1 模型保持固定，不再混用。
          </p>
        </div>

        <div class="action-row">
          <button
            class="secondary-button"
            type="button"
            data-node-trigger="approval"
          >
            定位等待节点
          </button>
          <button
            class="primary-button"
            type="button"
            data-view-trigger="api"
            data-api-mode="openai"
          >
            查看发布契约
          </button>
        </div>
      </header>

      ${renderSummaryStrip([
        { value: "v0.8.14", label: "Published contract" },
        { value: String(changedNodes.length), label: "Draft node changes" },
        { value: "1", label: "Waiting run" },
        { value: "1", label: "Failure hotspot" },
      ])}

      <div class="orchestration-grid">
        <article class="surface-panel stage-panel span-8">
          <div class="section-head">
            <div>
              <p class="eyebrow">agentFlow studio</p>
              <h2>状态真相、选中态与 draft change 明确分离</h2>
            </div>
            <div class="toolbar-row">
              <button
                class="toolbar-button ${state.activeNodeId === "classifier" ? "is-active" : ""}"
                type="button"
                data-node-trigger="classifier"
              >
                聚焦运行节点
              </button>
              <button
                class="toolbar-button ${state.activeNodeId === "crm" ? "is-active" : ""}"
                type="button"
                data-node-trigger="crm"
              >
                聚焦失败样本
              </button>
              <button
                class="toolbar-button ${state.showDraftDiff ? "is-active" : ""}"
                type="button"
                data-toggle-diff="true"
              >
                ${state.showDraftDiff ? "隐藏草稿差异" : "显示草稿差异"}
              </button>
            </div>
          </div>

          <div class="desktop-stage">
            <div class="canvas-legend">
              <span class="legend-item is-running">节点边框表示最近观测到的运行真相</span>
              <span class="legend-item is-selected">冷青色 outline 只表示当前选中</span>
              <span class="legend-item is-draft">Draft 标签只表示未发布变更</span>
            </div>

            <div class="canvas-stage" data-diff-mode="${String(state.showDraftDiff)}">
              <svg
                class="connector-layer"
                viewBox="0 0 1040 420"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                ${connectors
                  .map(
                    (pathData) =>
                      `<path d="${pathData}" pathLength="100"></path>`,
                  )
                  .join("")}
              </svg>
              <div class="canvas-node-layer">
                ${renderCanvasNodes()}
              </div>
            </div>
          </div>

          <div class="mobile-stage">
            <div class="mobile-stage-note">
              <p class="eyebrow">小屏模式</p>
              <p>
                手机端不保留横向滚动画布，改成节点列表 + Inspector 摘要。完整编排请在桌面端使用。
              </p>
            </div>
            <div class="mobile-node-list">
              ${renderMobileNodes()}
            </div>
          </div>

          <div class="stage-footer">
            <div>
              <strong>${escapeHtml(selectedNode.title)}</strong>
              <p class="section-copy">${escapeHtml(selectedNode.role)}</p>
            </div>
            <button
              class="secondary-button"
              type="button"
              data-view-trigger="logs"
              data-run-filter="${selectedNode.logsFilter}"
            >
              查看相关运行
            </button>
          </div>
        </article>

        ${renderInspector()}

        <article class="surface-panel span-6">
          <div class="section-head">
            <div>
              <p class="eyebrow">Draft diff</p>
              <h2>未发布变更集中在这三处</h2>
            </div>
          </div>
          <div class="stack-list compact-stack">
            ${changedNodes
              .map(
                (node) => `
                  <div class="timeline-row">
                    <div>
                      <strong>${escapeHtml(node.title)}</strong>
                      <p>${escapeHtml(node.change)}</p>
                    </div>
                    <button
                      class="ghost-button"
                      type="button"
                      data-node-trigger="${node.id}"
                    >
                      查看节点
                    </button>
                  </div>
                `,
              )
              .join("")}
          </div>
        </article>

        <article class="surface-panel span-6">
          <div class="section-head">
            <div>
              <p class="eyebrow">跨视图交互</p>
              <h2>这页不自己吞掉 API / Logs / Monitoring</h2>
            </div>
          </div>
          <div class="stack-list compact-stack">
            <div class="stack-row compact-row">
              <div>
                <strong>Node -> API contract</strong>
                <p>Classifier 和 Reply composer 都可以直接跳到契约视图。</p>
              </div>
            </div>
            <div class="stack-row compact-row">
              <div>
                <strong>Node -> Logs filter</strong>
                <p>Approval gate 直接跳等待态，CRM lookup 直接跳失败样本。</p>
              </div>
            </div>
            <div class="stack-row compact-row">
              <div>
                <strong>Monitoring -> Logs / API</strong>
                <p>监控热点不做死说明，而是直接带人去该看的上下文。</p>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderApi() {
  const contract = contracts[state.activeApiMode];

  return `
    <section class="view-panel" aria-labelledby="apiHeading">
      <header class="view-header surface-panel">
        <div>
          <p class="eyebrow">应用 API</p>
          <h1 id="apiHeading">${escapeHtml(contract.label)}</h1>
          <p>
            契约页只回答“调用方如何接入当前 contract”。发布管理、节点编辑和逐条 run 详情都不混进来。
          </p>
        </div>

        <div class="segmented-control">
          ${Object.values(contracts)
            .map(
              (item) => `
                <button
                  class="segment-button"
                  type="button"
                  data-api-mode-trigger="${item.id}"
                  aria-pressed="${String(state.activeApiMode === item.id)}"
                >
                  ${escapeHtml(item.label)}
                </button>
              `,
            )
            .join("")}
        </div>
      </header>

      <div class="content-grid">
        <article class="surface-panel span-5">
          <div class="section-head">
            <div>
              <p class="eyebrow">契约摘要</p>
              <h2>请求与鉴权</h2>
            </div>
            ${renderStatusBadge(contract.status, contract.statusLabel)}
          </div>
          <dl class="detail-grid detail-grid-single">
            <div>
              <dt>Endpoint</dt>
              <dd>${escapeHtml(contract.endpoint)}</dd>
            </div>
            <div>
              <dt>Auth</dt>
              <dd>${escapeHtml(contract.auth)}</dd>
            </div>
            <div>
              <dt>Callback policy</dt>
              <dd>${escapeHtml(contract.callback)}</dd>
            </div>
          </dl>
          <div class="action-row">
            <button
              class="secondary-button"
              type="button"
              data-view-trigger="orchestration"
              data-node-id="classifier"
            >
              查看相关节点
            </button>
            <button
              class="ghost-button"
              type="button"
              data-view-trigger="logs"
              data-run-filter="${contract.id === "claude" ? "running" : "healthy"}"
            >
              查看相关运行
            </button>
          </div>
        </article>

        <article class="surface-panel span-7">
          <div class="section-head">
            <div>
              <p class="eyebrow">Exposure note</p>
              <h2>${escapeHtml(contract.draftNote)}</h2>
            </div>
          </div>
          <div class="stack-list compact-stack">
            ${contract.consumers
              .map(
                (consumer) => `
                  <div class="stack-row compact-row">
                    <div>
                      <strong>${escapeHtml(consumer)}</strong>
                      <p>当前 demo 用统一 contract 语义说明它如何接入，不在这里再造第二套 UI。</p>
                    </div>
                  </div>
                `,
              )
              .join("")}
          </div>
        </article>

        <article class="surface-panel span-7">
          <div class="section-head">
            <div>
              <p class="eyebrow">Request sample</p>
              <h2>最小输入</h2>
            </div>
          </div>
          <pre class="code-block"><code>${escapeHtml(contract.requestExample)}</code></pre>
        </article>

        <article class="surface-panel span-5">
          <div class="section-head">
            <div>
              <p class="eyebrow">Response sample</p>
              <h2>稳定输出</h2>
            </div>
          </div>
          <pre class="code-block"><code>${escapeHtml(contract.responseExample)}</code></pre>
        </article>

        <article class="surface-panel span-12">
          <div class="section-head">
            <div>
              <p class="eyebrow">Consumer checklist</p>
              <h2>调用方真正需要知道的三件事</h2>
            </div>
          </div>
          <div class="stack-list compact-stack">
            ${contract.checklist
              .map(
                (item) => `
                  <div class="stack-row compact-row">
                    <div>
                      <strong>${escapeHtml(item)}</strong>
                    </div>
                  </div>
                `,
              )
              .join("")}
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderRunItem(run) {
  return `
    <button
      class="run-item"
      type="button"
      data-run-trigger="${run.id}"
    >
      <span class="run-main">
        ${renderStatusBadge(run.status, run.statusLabel)}
        <span class="run-text">
          <strong>${escapeHtml(run.title)}</strong>
          <small>#${escapeHtml(run.id)} · ${escapeHtml(run.subtitle)}</small>
        </span>
      </span>
      <span class="run-side">
        <span class="summary-label">${escapeHtml(run.currentNode)}</span>
        <span class="run-time">${escapeHtml(run.runtime)}</span>
      </span>
    </button>
  `;
}

function renderLogs() {
  const filteredRuns = getFilteredRuns(state.activeRunFilter);
  const summaryItems = [
    { value: String(runs.length), label: "Recent runs" },
    { value: String(filteredRuns.length), label: "Filtered result" },
    { value: String(runs.filter((run) => run.status === "waiting").length), label: "Waiting callback" },
    { value: String(runs.filter((run) => run.status === "failed").length), label: "Failed samples" },
  ];

  return `
    <section class="view-panel" aria-labelledby="logsHeading">
      <header class="view-header surface-panel">
        <div>
          <p class="eyebrow">调用日志</p>
          <h1 id="logsHeading">近期运行</h1>
          <p>
            列表只保留摘要；逐条详情统一在 Drawer 查看，保证列表上下文不丢。
          </p>
        </div>

        <div class="segmented-control">
          ${[
            ["all", "全部"],
            ["running", "运行中"],
            ["waiting", "等待态"],
            ["failed", "失败"],
            ["healthy", "健康完成"],
          ]
            .map(
              ([key, label]) => `
                <button
                  class="segment-button"
                  type="button"
                  data-run-filter-trigger="${key}"
                  aria-pressed="${String(state.activeRunFilter === key)}"
                >
                  ${label}
                </button>
              `,
            )
            .join("")}
        </div>
      </header>

      ${renderSummaryStrip(summaryItems)}

      <div class="content-grid">
        <article class="surface-panel span-12">
          <div class="section-head">
            <div>
              <p class="eyebrow">日志列表</p>
              <h2>点击条目打开 Drawer</h2>
            </div>
          </div>

          <div class="run-list">
            ${
              filteredRuns.length
                ? filteredRuns.map(renderRunItem).join("")
                : `
                    <div class="empty-state">
                      <div>
                        <strong>当前过滤条件下没有结果</strong>
                        <p>清空过滤后可回到完整运行列表。</p>
                      </div>
                      <button
                        class="secondary-button"
                        type="button"
                        data-run-filter-trigger="all"
                      >
                        清空过滤
                      </button>
                    </div>
                  `
            }
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderSparkBars(values) {
  return `
    <div class="sparkbars">
      ${values
        .map((value) => `<span style="height: ${Math.max(value, 8)}%;"></span>`)
        .join("")}
    </div>
  `;
}

function renderMonitoring() {
  const dataset = monitoringWindows[state.activeMonitoringWindow];

  return `
    <section class="view-panel" aria-labelledby="monitoringHeading">
      <header class="view-header surface-panel">
        <div>
          <p class="eyebrow">监控报表</p>
          <h1 id="monitoringHeading">统一观测摘要</h1>
          <p>
            监控页只回答 runtime、state、plugin 当前怎样，不承担逐条日志详情，也不混进流程编辑。
          </p>
        </div>

        <div class="segmented-control">
          ${Object.keys(monitoringWindows)
            .map(
              (key) => `
                <button
                  class="segment-button"
                  type="button"
                  data-monitor-window-trigger="${key}"
                  aria-pressed="${String(state.activeMonitoringWindow === key)}"
                >
                  ${escapeHtml(key)}
                </button>
              `,
            )
            .join("")}
        </div>
      </header>

      <section class="metric-grid">
        ${dataset.metrics
          .map(
            (metric) => `
              <article class="metric-card" data-status="${metric.status}">
                ${renderStatusBadge(metric.status, metric.statusLabel)}
                <strong>${escapeHtml(metric.title)}</strong>
                <p>${escapeHtml(metric.note)}</p>
                <span class="metric-value">${escapeHtml(metric.value)}</span>
                ${renderSparkBars(metric.spark)}
              </article>
            `,
          )
          .join("")}
      </section>

      <div class="content-grid">
        <article class="surface-panel span-7">
          <div class="section-head">
            <div>
              <p class="eyebrow">Hotspots</p>
              <h2>热点必须能直接跳到上下文</h2>
            </div>
          </div>
          <div class="hotspot-list">
            ${dataset.hotspots
              .map(
                (item) => `
                  <div class="timeline-row">
                    <div>
                      <strong>${escapeHtml(item.title)}</strong>
                      <p>${escapeHtml(item.note)}</p>
                    </div>
                    <button
                      class="secondary-button"
                      type="button"
                      data-view-trigger="${item.actionView}"
                      ${item.runFilter ? `data-run-filter="${item.runFilter}"` : ""}
                      ${item.apiMode ? `data-api-mode="${item.apiMode}"` : ""}
                    >
                      ${escapeHtml(item.actionLabel)}
                    </button>
                  </div>
                `,
              )
              .join("")}
          </div>
        </article>

        <article class="surface-panel span-5">
          <div class="section-head">
            <div>
              <p class="eyebrow">State discipline</p>
              <h2>一致性约束仍然清晰</h2>
            </div>
          </div>
          <div class="stack-list compact-stack">
            ${dataset.stateRows
              .map(
                (row) => `
                  <div class="stack-row compact-row">
                    <div>
                      <strong>${escapeHtml(row.title)}</strong>
                      <p>${escapeHtml(row.note)}</p>
                    </div>
                  </div>
                `,
              )
              .join("")}
          </div>
        </article>

        <article class="surface-panel span-12">
          <div class="section-head">
            <div>
              <p class="eyebrow">Plugin / host boundary</p>
              <h2>把已上线、故障与未接通状态分开看</h2>
            </div>
          </div>
          <div class="plugin-list">
            ${dataset.pluginRows
              .map(
                (row) => `
                  <div class="stack-row">
                    <div>
                      <strong>${escapeHtml(row.title)}</strong>
                      <p>${escapeHtml(row.note)}</p>
                    </div>
                    ${renderStatusBadge(row.status, row.statusLabel)}
                  </div>
                `,
              )
              .join("")}
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderView() {
  switch (state.activeView) {
    case "orchestration":
      return renderOrchestration();
    case "api":
      return renderApi();
    case "logs":
      return renderLogs();
    case "monitoring":
      return renderMonitoring();
    default:
      return renderOverview();
  }
}

function render() {
  renderSidebar();
  viewRoot.innerHTML = renderView();
}

function openDrawer(runId, trigger) {
  const detail = getRun(runId);

  if (!detail) {
    return;
  }

  lastDrawerTrigger = trigger;
  drawerTitle.textContent = detail.title;
  drawerReference.textContent = `#${detail.id}`;
  drawerRuntime.textContent = detail.runtime;
  drawerContract.textContent = detail.contract;
  drawerNode.textContent = detail.currentNode;
  drawerStartedAt.textContent = detail.startedAt;
  drawerReason.textContent = detail.reason;
  drawerRecovery.textContent = detail.recovery;
  drawerStatus.className = `status-badge ${statusClass(detail.status)}`;
  drawerStatus.textContent = detail.statusLabel;
  drawerEvents.innerHTML = detail.events
    .map(
      (event) => `
        <article class="event-row">
          <time>${escapeHtml(event.time)}</time>
          <strong>${escapeHtml(event.title)}</strong>
          <p>${escapeHtml(event.note)}</p>
        </article>
      `,
    )
    .join("");

  drawer.hidden = false;
  drawerBackdrop.hidden = false;
  drawer.setAttribute("aria-hidden", "false");
  appShell.setAttribute("inert", "");
  document.body.classList.add("is-drawer-open");

  requestAnimationFrame(() => {
    drawerCloseButton.focus();
  });
}

function closeDrawer(restoreFocus = true) {
  if (drawer.hidden) {
    return;
  }

  drawer.hidden = true;
  drawerBackdrop.hidden = true;
  drawer.setAttribute("aria-hidden", "true");
  appShell.removeAttribute("inert");
  document.body.classList.remove("is-drawer-open");

  if (restoreFocus && lastDrawerTrigger) {
    lastDrawerTrigger.focus();
  }
}

function trapDrawerFocus(event) {
  if (drawer.hidden || event.key !== "Tab") {
    return;
  }

  const focusable = drawer.querySelectorAll(focusableSelector);

  if (!focusable.length) {
    event.preventDefault();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

document.addEventListener("click", (event) => {
  const drawerClose = event.target.closest("[data-drawer-close]");

  if (drawerClose) {
    event.preventDefault();
    closeDrawer();
    return;
  }

  const runTrigger = event.target.closest("[data-run-trigger]");

  if (runTrigger) {
    event.preventDefault();
    openDrawer(runTrigger.dataset.runTrigger, runTrigger);
    return;
  }

  const filterTrigger = event.target.closest("[data-run-filter-trigger]");

  if (filterTrigger) {
    event.preventDefault();
    state.activeRunFilter = filterTrigger.dataset.runFilterTrigger;
    render();
    return;
  }

  const apiModeTrigger = event.target.closest("[data-api-mode-trigger]");

  if (apiModeTrigger) {
    event.preventDefault();
    state.activeApiMode = apiModeTrigger.dataset.apiModeTrigger;
    render();
    return;
  }

  const monitoringTrigger = event.target.closest("[data-monitor-window-trigger]");

  if (monitoringTrigger) {
    event.preventDefault();
    state.activeMonitoringWindow = monitoringTrigger.dataset.monitorWindowTrigger;
    render();
    return;
  }

  const diffToggle = event.target.closest("[data-toggle-diff]");

  if (diffToggle) {
    event.preventDefault();
    state.showDraftDiff = !state.showDraftDiff;
    render();
    return;
  }

  const nodeTrigger = event.target.closest("[data-node-trigger]");

  if (nodeTrigger) {
    event.preventDefault();
    state.activeNodeId = nodeTrigger.dataset.nodeTrigger;

    if (state.activeView !== "orchestration") {
      setView("orchestration");
      return;
    }

    render();
    return;
  }

  const viewTrigger = event.target.closest("[data-view-trigger]");

  if (viewTrigger) {
    event.preventDefault();
    setView(viewTrigger.dataset.viewTrigger, {
      nodeId: viewTrigger.dataset.nodeId,
      runFilter: viewTrigger.dataset.runFilter,
      apiMode: viewTrigger.dataset.apiMode,
      monitoringWindow: viewTrigger.dataset.monitorWindow,
    });
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !drawer.hidden) {
    event.preventDefault();
    closeDrawer();
    return;
  }

  trapDrawerFocus(event);
});

window.addEventListener("hashchange", () => {
  state.activeView = getHashView();
  render();
});

state.activeView = getHashView();
render();
