const viewDefs = [
  {
    id: "orchestration",
    label: "编排",
    summary: "编辑 flow、检查节点、准备发布",
  },
  {
    id: "api",
    label: "应用 API",
    summary: "对外契约、请求样例与兼容模式",
  },
  {
    id: "logs",
    label: "调用日志",
    summary: "最近运行、恢复路径与失败样本",
  },
  {
    id: "monitoring",
    label: "监控报表",
    summary: "runtime、state、plugin 的统一观测",
  },
];

const repoScope = [
  {
    title: "Home /",
    note: "当前已接通 workspace bootstrap 与 API health。",
    status: "healthy",
    statusLabel: "Online",
  },
  {
    title: "AgentFlow /agent-flow",
    note: "真实代码仍是 placeholder，本 demo 负责把目标工作区讲清楚。",
    status: "draft",
    statusLabel: "Placeholder",
  },
  {
    title: "Embedded Apps /embedded-apps",
    note: "列表、详情、runtime mount 路由都已预留，但还没进入完整交互层。",
    status: "draft",
    statusLabel: "Shell only",
  },
  {
    title: "@1flowse/ui AppShell",
    note: "真实路由已经使用统一壳层；demo 在这个基础上提前演示最终语义。",
    status: "healthy",
    statusLabel: "In use",
  },
];

const iterationFocus = [
  {
    title: "视觉基线回到深色控制台",
    note: "按当前 DESIGN.md 的 token 与状态语义收敛。",
  },
  {
    title: "跨视图 interaction 不再是假按钮",
    note: "节点、监控、日志、契约之间都能直接跳转。",
  },
  {
    title: "demo 改成单一数据源",
    note: "避免 HTML 与 JS 双份文案继续漂移。",
  },
];

const nodes = [
  {
    id: "intake",
    kind: "Trigger",
    title: "Email intake",
    summary: "接收销售来信并统一抽取 tenant、account 与入口意图。",
    description: "入口只做归一化，不在这里掺入审批和回复策略。",
    status: "healthy",
    statusLabel: "Healthy",
    input: "Raw message + tenant headers",
    output: "Normalized intent + account selectors",
    role: "把所有入口统一成稳定的 flow 变量。",
    change: "补齐了 locale 与 tenant snapshot，published contract 已同步。",
    contractImpact: "请求 payload 仍保持稳定，不需要改调用方。",
    logsFilter: "healthy",
    apiMode: "openai",
    isDraftChanged: false,
    position: { left: 28, top: 94 },
    ports: ["right"],
  },
  {
    id: "classifier",
    kind: "Model",
    title: "Risk classifier",
    summary: "判断风险等级、回调必要性和是否进入人工审批。",
    description: "运行状态与 draft change 分离；running 只表达最近观测真相。",
    status: "running",
    statusLabel: "Running",
    input: "Normalized intent + account context",
    output: "riskScore + callback.required + route",
    role: "把系统级阈值判断集中在一个模型节点里。",
    change: "本轮草稿新增 `callback.required` 显式输出，并重写回复模板阈值。",
    contractImpact: "OpenAI / Claude 兼容模式的输出结构都受它影响。",
    logsFilter: "running",
    apiMode: "claude",
    isDraftChanged: true,
    position: { left: 284, top: 94 },
    ports: ["left", "right"],
  },
  {
    id: "crm",
    kind: "Tool",
    title: "CRM lookup",
    summary: "读取账户健康快照，把业务上下文映射到稳定的 flow 变量。",
    description: "失败样本需要留在日志与监控里，而不是偷改 published contract。",
    status: "failed",
    statusLabel: "Failed sample",
    input: "Account selector",
    output: "Account health snapshot",
    role: "宿主层工具输出与 flow 变量结构对齐。",
    change: "保留了失败样本，后续只修 adapter，不在节点层吞异常。",
    contractImpact: "不会改对外 API，但会影响运行观测与重试路径。",
    logsFilter: "failed",
    apiMode: "openai",
    isDraftChanged: false,
    position: { left: 548, top: 94 },
    ports: ["left", "right"],
  },
  {
    id: "approval",
    kind: "State",
    title: "Approval gate",
    summary: "进入等待态前写入 checkpoint，等待财务审批恢复。",
    description: "等待态不是失败，也不借用 selected 的颜色。",
    status: "waiting",
    statusLabel: "Waiting callback",
    input: "Current run snapshot",
    output: "Checkpoint metadata",
    role: "把显式暂停与恢复边界做成系统行为。",
    change: "恢复来源和审批 owner 已同步到 logs drawer 与 monitoring hotspot。",
    contractImpact: "影响 callback policy 与恢复文案，不影响 request shape。",
    logsFilter: "waiting",
    apiMode: "openai",
    isDraftChanged: true,
    position: { left: 548, top: 248 },
    ports: ["left", "right"],
  },
  {
    id: "reply",
    kind: "Output",
    title: "Reply composer",
    summary: "组合 CRM 上下文、风险判断与审批结果，生成最终回复。",
    description: "输出层承接最终契约，不在这里处理隐式恢复逻辑。",
    status: "healthy",
    statusLabel: "Healthy",
    input: "Risk result + account snapshot + approval result",
    output: "text + outputs + callback summary",
    role: "保证 published contract 的最终返回结构稳定。",
    change: "草稿版重写了 disclaimer 文案，等待下一次 publish。",
    contractImpact: "直接影响返回正文与 outputs 可读性。",
    logsFilter: "healthy",
    apiMode: "openai",
    isDraftChanged: true,
    position: { left: 804, top: 248 },
    ports: ["left"],
  },
];

const connectors = [
  "M250 146 C 274 146, 276 146, 284 146",
  "M506 146 C 528 146, 532 146, 548 146",
  "M396 200 C 458 224, 480 248, 548 300",
  "M770 300 C 782 300, 790 300, 804 300",
];

const runs = [
  {
    id: "run_2048",
    title: "Finance approval backlog",
    subtitle: "Paused before sending enterprise quote",
    status: "waiting",
    statusLabel: "Waiting callback",
    runtime: "callback",
    contract: "OpenAI compatible",
    currentNode: "Approval gate",
    startedAt: "2026-04-12 10:41",
    reason:
      "系统已经停在等待态，checkpoint 与恢复来源都已显式写入；这里不允许继续往下跑。",
    recovery:
      "财务审批完成后，从同一 checkpoint 恢复，并保留一条新的 run 记录，不回写已发布版本。",
    events: [
      {
        time: "10:41:08",
        title: "Classifier returned callback.required = true",
        note: "风险判断把当前会话转入人工审批路径。",
      },
      {
        time: "10:41:10",
        title: "Checkpoint persisted",
        note: "state action 已落盘，等待态具备恢复条件。",
      },
      {
        time: "10:41:11",
        title: "Run paused for finance sign-off",
        note: "当前等待 owner 为 Finance Ops。",
      },
    ],
  },
  {
    id: "run_2047",
    title: "CRM enrichment retry",
    subtitle: "Latest failure sample retained",
    status: "failed",
    statusLabel: "Failed",
    runtime: "08s",
    contract: "OpenAI compatible",
    currentNode: "CRM lookup",
    startedAt: "2026-04-12 09:12",
    reason:
      "CRM adapter 在 enrichment 阶段超时，失败样本被保留给日志与监控页共同复盘。",
    recovery:
      "先修复 adapter，再从 draft 重新发布；失败日志本身不会偷偷修改 live contract。",
    events: [
      {
        time: "09:12:00",
        title: "Email intake normalized request",
        note: "tenant 与 account selector 都已准备好。",
      },
      {
        time: "09:12:05",
        title: "CRM lookup timeout",
        note: "Adapter 在 5 秒阈值后失败退出。",
      },
      {
        time: "09:12:08",
        title: "Failure sample retained",
        note: "run 详情已落到 logs drawer 和 monitoring hotspot。",
      },
    ],
  },
  {
    id: "run_2046",
    title: "Revenue intake pipeline",
    subtitle: "Published contract v0.8.14",
    status: "healthy",
    statusLabel: "Healthy",
    runtime: "02m 14s",
    contract: "OpenAI compatible",
    currentNode: "Reply composer",
    startedAt: "2026-04-12 08:26",
    reason:
      "Published contract 正常返回，风险评分、回复正文和 callback 摘要都已写入 outputs。",
    recovery:
      "无需恢复；若要复盘，可在日志页继续查看事件轨迹和请求样本。",
    events: [
      {
        time: "08:26:04",
        title: "Intake normalized payload",
        note: "tenant / locale / account selector 对齐完成。",
      },
      {
        time: "08:27:08",
        title: "CRM lookup returned healthy snapshot",
        note: "未触发等待态，也没有失败样本。",
      },
      {
        time: "08:28:18",
        title: "Reply composer produced final text",
        note: "run 正常完成并输出 text + outputs。",
      },
    ],
  },
  {
    id: "run_2045",
    title: "Draft parity review",
    subtitle: "Claude compatible dry-run",
    status: "running",
    statusLabel: "Running",
    runtime: "58s",
    contract: "Claude compatible",
    currentNode: "Risk classifier",
    startedAt: "2026-04-12 07:58",
    reason:
      "正在校验 draft contract 与 published contract 的输出一致性，当前停在分类阈值对比阶段。",
    recovery:
      "校验完成后再决定是否发布 Claude compatible exposure mode；不会影响现有 OpenAI 入口。",
    events: [
      {
        time: "07:58:02",
        title: "Draft contract loaded",
        note: "使用 claude compatible payload 做 dry-run。",
      },
      {
        time: "07:58:19",
        title: "Classifier threshold compare running",
        note: "callback.required 与 riskScore 正在对齐。",
      },
      {
        time: "07:58:58",
        title: "Awaiting parity verdict",
        note: "结果会同步到 API contract 视图。",
      },
    ],
  },
];

const contracts = {
  openai: {
    id: "openai",
    label: "OpenAI compatible",
    status: "published",
    statusLabel: "Published",
    endpoint: "/v1/apps/revenue-copilot/responses",
    auth: "Bearer token + application scope rate limit",
    callback:
      "等待态必须先写 checkpoint，再通过 host callback 恢复。",
    consumers: ["Sales assistant", "CSR widget", "Internal workflow relay"],
    draftNote: "当前 published contract，与 live traffic 一致。",
    requestExample: `{
  "input": "Summarize account risk",
  "conversationId": "conv_9f4",
  "userId": "u_205",
  "stateScope": "application"
}`,
    responseExample: `{
  "text": "Account risk is moderate. Finance approval is required.",
  "outputs": {
    "riskScore": 0.82,
    "callback": {
      "required": true,
      "checkpointId": "cp_2048"
    }
  }
}`,
    checklist: [
      "请求结构继续保持轻量；调用方不用理解内部节点。",
      "callback.required 是显式字段，不靠异常或隐式暂停表达。",
      "回复正文与 outputs 分离，便于外部 UI 与监控共用。",
    ],
  },
  claude: {
    id: "claude",
    label: "Claude compatible",
    status: "draft",
    statusLabel: "Draft candidate",
    endpoint: "/v1/apps/revenue-copilot/messages",
    auth: "API key + tenant allowlist",
    callback:
      "与 published 路径共享 checkpoint discipline，但 exposure mode 仍在 parity 校验中。",
    consumers: ["Draft QA harness", "Parity review task"],
    draftNote: "本轮重点是校验 classifier 阈值与 callback 输出一致性。",
    requestExample: `{
  "messages": [
    {
      "role": "user",
      "content": "Summarize account risk"
    }
  ],
  "metadata": {
    "conversationId": "conv_9f4",
    "tenantId": "tenant_001"
  }
}`,
    responseExample: `{
  "content": [
    {
      "type": "text",
      "text": "Finance approval is required before sending the quote."
    }
  ],
  "metadata": {
    "riskScore": 0.82,
    "callback": {
      "required": true
    }
  }
}`,
    checklist: [
      "只复用 published flow，不发明第二套运行逻辑。",
      "兼容模式切换只影响 envelope，不改变 state / callback discipline。",
      "发布前必须通过 parity review run。",
    ],
  },
  native: {
    id: "native",
    label: "Native invoke",
    status: "draft",
    statusLabel: "Internal only",
    endpoint: "/runtime/apps/revenue-copilot/execute",
    auth: "Internal runtime actor + capability slots",
    callback:
      "保留同一套等待态约束，但当前仍限定在内部 runtime 流程中使用。",
    consumers: ["Host runtime", "Embedded mount handshake"],
    draftNote: "对应未来 embedded mount 与 runtime host 的真正接缝。",
    requestExample: `{
  "actor": "runtime.host",
  "applicationCode": "revenue-copilot",
  "payload": {
    "input": "Summarize account risk",
    "accountId": "acct_501"
  }
}`,
    responseExample: `{
  "runId": "run_2045",
  "state": "running",
  "currentNode": "Risk classifier",
  "resumeToken": null
}`,
    checklist: [
      "内部 invoke 仍应复用同一张状态语义表。",
      "embedded runtime 不能绕过 checkpoint 与 logs。",
      "runtime mount 接通前，不应伪装成已上线能力。",
    ],
  },
};

const monitoringWindows = {
  "24h": {
    metrics: [
      {
        title: "Callback recovery",
        value: "98.4%",
        note: "14 / 15 waiting runs 顺利恢复，没有出现隐式 side effect。",
        status: "healthy",
        statusLabel: "Healthy",
        spark: [32, 40, 46, 54, 60, 68, 72, 84],
      },
      {
        title: "Queue wait p95",
        value: "18s",
        note: "当前最长等待来自 Approval gate，但仍在允许阈值内。",
        status: "waiting",
        statusLabel: "Waiting",
        spark: [10, 12, 16, 18, 20, 24, 28, 36],
      },
      {
        title: "CRM timeout hotspot",
        value: "1 sample",
        note: "失败样本已保存在 logs drawer，可直接复盘 adapter 行为。",
        status: "failed",
        statusLabel: "Failed",
        spark: [8, 10, 14, 18, 24, 46, 18, 12],
      },
      {
        title: "Embedded mount host",
        value: "shell only",
        note: "真实路由已存在，runtime host 仍未接通。",
        status: "draft",
        statusLabel: "Draft",
        spark: [8, 8, 8, 8, 8, 8, 8, 8],
      },
    ],
    hotspots: [
      {
        title: "Approval gate backlog",
        note: "当前 waiting run 停在 Approval gate，可直接跳到 logs 过滤等待态。",
        status: "waiting",
        actionView: "logs",
        runFilter: "waiting",
        actionLabel: "打开等待态",
      },
      {
        title: "CRM adapter timeout",
        note: "失败样本已经保留；应先修 adapter，再考虑重发草稿。",
        status: "failed",
        actionView: "logs",
        runFilter: "failed",
        actionLabel: "打开失败样本",
      },
      {
        title: "Classifier threshold parity",
        note: "Draft contract 还在校验 callback.required 的阈值一致性。",
        status: "running",
        actionView: "api",
        apiMode: "claude",
        actionLabel: "看 draft contract",
      },
    ],
    stateRows: [
      {
        title: "显式 state writes",
        note: "所有等待态与恢复入口都仍然经过 state action 落盘。",
      },
      {
        title: "Checkpoint provenance",
        note: "logs drawer 与 monitoring 都保留恢复来源，不让人猜测 run 是怎么停下来的。",
      },
      {
        title: "Published / draft split",
        note: "恢复动作只生成新的 draft，不会改写 live contract。",
      },
    ],
    pluginRows: [
      {
        title: "CRM adapter",
        note: "失败样本存在，但 published contract 没被污染。",
        status: "failed",
        statusLabel: "Needs fix",
      },
      {
        title: "Callback host",
        note: "等待态恢复仍由 host 负责，flow 本身不偷跑恢复逻辑。",
        status: "healthy",
        statusLabel: "Healthy",
      },
      {
        title: "Embedded mount host",
        note: "真实路由已预留，但 mount runtime 还没进 live traffic。",
        status: "draft",
        statusLabel: "Pending",
      },
    ],
  },
  "7d": {
    metrics: [
      {
        title: "Callback recovery",
        value: "97.8%",
        note: "一周内等待态恢复仍然稳定，未出现回放污染。",
        status: "healthy",
        statusLabel: "Healthy",
        spark: [24, 28, 36, 44, 50, 60, 70, 78],
      },
      {
        title: "Queue wait p95",
        value: "27s",
        note: "长尾等待主要来自大客户审批链，不是 runtime 本身阻塞。",
        status: "waiting",
        statusLabel: "Waiting",
        spark: [8, 10, 14, 20, 26, 30, 34, 42],
      },
      {
        title: "CRM timeout hotspot",
        value: "3 samples",
        note: "同一类 adapter failure 在一周内重复出现，应该单独立项处理。",
        status: "failed",
        statusLabel: "Failed",
        spark: [6, 12, 16, 24, 34, 46, 40, 30],
      },
      {
        title: "Embedded mount host",
        value: "0 connected",
        note: "runtime mount 仍是下一个阶段，不应在 demo 里伪装成已上线。",
        status: "draft",
        statusLabel: "Draft",
        spark: [4, 4, 4, 4, 4, 4, 4, 4],
      },
    ],
    hotspots: [
      {
        title: "Repeated CRM failure pattern",
        note: "同类 failure 已跨多次 run 出现，应先做 adapter 稳定性整治。",
        status: "failed",
        actionView: "logs",
        runFilter: "failed",
        actionLabel: "看失败集合",
      },
      {
        title: "Approval backlog remains narrow",
        note: "等待态主要集中在单一审批链，说明 flow 本身没有大规模卡死。",
        status: "waiting",
        actionView: "logs",
        runFilter: "waiting",
        actionLabel: "看等待集合",
      },
      {
        title: "OpenAI remains the only live contract",
        note: "其他 exposure mode 仍应先完成 parity review。",
        status: "healthy",
        actionView: "api",
        apiMode: "openai",
        actionLabel: "看 live contract",
      },
    ],
    stateRows: [
      {
        title: "State model discipline still intact",
        note: "一周维度也没有出现绕过 state action 的写入方式。",
      },
      {
        title: "Run provenance kept visible",
        note: "logs drawer 持续保留 contract、node 与 startedAt，不靠口头解释。",
      },
      {
        title: "Drafts are still explicit",
        note: "published 与 draft 没有被监控页混成一个状态。",
      },
    ],
    pluginRows: [
      {
        title: "CRM adapter",
        note: "仍是最明显的失败热点。",
        status: "failed",
        statusLabel: "Hotspot",
      },
      {
        title: "Host callback runtime",
        note: "恢复路径继续稳定，没有新风险。",
        status: "healthy",
        statusLabel: "Stable",
      },
      {
        title: "Embedded mount host",
        note: "继续保持 pending，不在 demo 里伪装成熟能力。",
        status: "draft",
        statusLabel: "Pending",
      },
    ],
  },
};

