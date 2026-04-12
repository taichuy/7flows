import { getDefaultApiBaseUrl } from '../../../../web/packages/api-client/src/index.ts';
import { createEmbedContext } from '../../../../web/packages/embed-sdk/src/index.ts';
import {
  createEmbeddedAppManifest,
  type EmbeddedAppManifest
} from '../../../../web/packages/embedded-contracts/src/index.ts';
import type { PageDefinition } from '../../../../web/packages/page-protocol/src/index.ts';

export type ViewId =
  | 'overview'
  | 'orchestration'
  | 'api'
  | 'logs'
  | 'monitoring';

export type BadgeStatus =
  | 'running'
  | 'waiting'
  | 'failed'
  | 'success'
  | 'draft'
  | 'published'
  | 'healthy';

export type RunFilter = 'all' | 'running' | 'waiting' | 'failed' | 'success';
export type ContractMode = 'openai' | 'claude' | 'native';
export type MonitoringWindow = '24h' | '7d';

export interface WorkspacePage {
  id: ViewId;
  route: string;
  title: string;
  summary: string;
}

export interface SummaryStat {
  label: string;
  value: string;
  note: string;
}

export interface RepoRealityItem {
  title: string;
  note: string;
  status: BadgeStatus;
  statusLabel: string;
}

export interface FlowNode {
  id: string;
  kind: string;
  title: string;
  summary: string;
  description: string;
  status: Exclude<RunFilter, 'all'>;
  statusLabel: string;
  input: string;
  output: string;
  role: string;
  change: string;
  contractMode: ContractMode;
  logsFilter: RunFilter;
  isDraftChanged: boolean;
  position: { left: number; top: number };
}

export interface FlowRunEvent {
  time: string;
  title: string;
  note: string;
}

export interface FlowRun {
  id: string;
  title: string;
  subtitle: string;
  status: Exclude<RunFilter, 'all'>;
  statusLabel: string;
  runtime: string;
  contract: string;
  currentNode: string;
  startedAt: string;
  reason: string;
  recovery: string;
  events: FlowRunEvent[];
}

export interface ContractDefinition {
  id: ContractMode;
  label: string;
  status: 'draft' | 'published';
  statusLabel: string;
  endpoint: string;
  auth: string;
  callback: string;
  consumers: string[];
  draftNote: string;
  requestExample: string;
  responseExample: string;
  checklist: string[];
}

export interface MonitoringMetric {
  title: string;
  value: string;
  note: string;
  status: BadgeStatus;
  statusLabel: string;
  spark: number[];
}

export interface MonitoringHotspot {
  title: string;
  note: string;
  status: Exclude<RunFilter, 'all'>;
  actionView: 'logs' | 'api';
  runFilter?: RunFilter;
  contractMode?: ContractMode;
  actionLabel: string;
}

export interface OverviewRunSummary {
  runId: string;
  note: string;
  actionLabel: string;
}

export interface OverviewFocusItem {
  id: string;
  title: string;
  note: string;
  status: BadgeStatus;
  statusLabel: string;
  actionLabel: string;
  actionView: 'api' | 'logs' | 'monitoring';
  runId?: string;
  contractMode?: ContractMode;
}

export const workspaceMeta = {
  code: 'revenue-copilot',
  name: 'Revenue Copilot',
  description:
    '基于当前仓库路由、契约与 embedded runtime 线索整理的可运行 workspace demo。',
  owner: 'Iris Chen',
  publishedVersion: 'v0.8.14',
  updatedAt: '2026-04-13 01:05'
};

export const workspacePages: WorkspacePage[] = [
  {
    id: 'overview',
    route: '/',
    title: '应用概览',
    summary: '当前状态、repo 现实与唯一主入口'
  },
  {
    id: 'orchestration',
    route: '/orchestration',
    title: '编排',
    summary: '画布、Inspector 与发布准备条'
  },
  {
    id: 'api',
    route: '/api',
    title: '应用 API',
    summary: 'Published contract、兼容模式与接入方式'
  },
  {
    id: 'logs',
    route: '/logs',
    title: '调用日志',
    summary: '运行列表、恢复原因与失败样本'
  },
  {
    id: 'monitoring',
    route: '/monitoring',
    title: '监控报表',
    summary: '健康摘要、热点、state 与 plugin 观测'
  }
];

export const pageDefinitions: PageDefinition[] = workspacePages.map((page) => ({
  route: page.route,
  title: page.title
}));

export const repoReality: RepoRealityItem[] = [
  {
    title: 'Home /',
    note: '真实代码已打通 bootstrap 与 API health，但仍不是工作区首页。',
    status: 'healthy',
    statusLabel: 'Online'
  },
  {
    title: 'AgentFlow /agent-flow',
    note: '正式代码仍是 placeholder；本 demo 负责先把工作区语言、状态语义与编辑路径讲清楚。',
    status: 'draft',
    statusLabel: 'Placeholder'
  },
  {
    title: 'Embedded Apps /embedded-apps',
    note: '路由已在真实仓库存在，但只到列表与详情壳层，缺少真正的 artifact 管理与发布链路。',
    status: 'draft',
    statusLabel: 'Shell only'
  },
  {
    title: 'Embedded Mount /embedded/:id',
    note: '宿主接缝已经有类型和上下文，mount runtime 仍未接入 live traffic。',
    status: 'draft',
    statusLabel: 'Host gap'
  }
];

export const iterationCritique = [
  '旧版 demo 仍是静态 HTML，无法证明和当前 `web/` 依赖体系一起运行。',
  '概览页曾出现多个动作按钮，违背了“唯一主入口是进入编排”的页面语法。',
  '真实项目里 `@1flowse/ui` 仍然很薄，说明工作区组件语言需要继续沉淀，demo 不能假装正式代码已经具备。'
];

export const nextIterationFocus = [
  '如果 Inspector 和日志抽屉交互稳定，下轮应开始拆出可复用的 workspace primitives。',
  '一旦 embedded runtime 真正接通，需要把当前 mock 的 route manifest 换成真实 artifact 元数据。',
  'frontend skill 的视觉基线和仓库 DESIGN 仍冲突，后续应该回修文档源，而不是继续依赖人工记忆。'
];

export const nodes: FlowNode[] = [
  {
    id: 'intake',
    kind: 'Trigger',
    title: 'Email intake',
    summary: '接收销售来信并统一抽取 tenant、account 与入口意图。',
    description: '入口节点只做归一化，不在这里掺入审批和回复策略。',
    status: 'success',
    statusLabel: 'Success',
    input: 'Raw message + tenant headers',
    output: 'Normalized intent + account selectors',
    role: '把所有入口统一成稳定的 flow 变量。',
    change: 'locale 与 tenant snapshot 已同步到 published contract。',
    contractMode: 'openai',
    logsFilter: 'success',
    isDraftChanged: false,
    position: { left: 36, top: 118 }
  },
  {
    id: 'classifier',
    kind: 'Model',
    title: 'Risk classifier',
    summary: '判断风险等级、回调必要性和是否进入人工审批。',
    description: '运行状态、selected 态和 draft change 被刻意拆开，不再共用一种颜色。',
    status: 'running',
    statusLabel: 'Running',
    input: 'Normalized intent + account context',
    output: 'riskScore + callback.required + route',
    role: '把系统级阈值判断集中在一个模型节点里。',
    change: '本轮草稿新增 `callback.required` 显式输出，并重写回复阈值。',
    contractMode: 'claude',
    logsFilter: 'running',
    isDraftChanged: true,
    position: { left: 312, top: 118 }
  },
  {
    id: 'crm',
    kind: 'Tool',
    title: 'CRM lookup',
    summary: '读取账户健康快照，把业务上下文映射到稳定的 flow 变量。',
    description: '失败样本需要保留到日志与监控里，而不是偷偷改 live contract。',
    status: 'failed',
    statusLabel: 'Failed sample',
    input: 'Account selector',
    output: 'Account health snapshot',
    role: '宿主层工具输出与 flow 变量结构对齐。',
    change: '保留失败样本，后续只修 adapter，不在节点层吞异常。',
    contractMode: 'openai',
    logsFilter: 'failed',
    isDraftChanged: false,
    position: { left: 588, top: 118 }
  },
  {
    id: 'approval',
    kind: 'State',
    title: 'Approval gate',
    summary: '进入等待态前写 checkpoint，等待财务审批恢复。',
    description: '等待态不是失败，也不能借用 selected 的颜色。',
    status: 'waiting',
    statusLabel: 'Waiting callback',
    input: 'Current run snapshot',
    output: 'Checkpoint metadata',
    role: '把显式暂停与恢复边界做成系统行为。',
    change: '恢复来源与审批 owner 已同步到日志 Drawer 和监控热点。',
    contractMode: 'openai',
    logsFilter: 'waiting',
    isDraftChanged: true,
    position: { left: 588, top: 292 }
  },
  {
    id: 'reply',
    kind: 'Output',
    title: 'Reply composer',
    summary: '组合 CRM 上下文、风险判断与审批结果，生成最终回复。',
    description: '输出层承接最终契约，不在这里处理隐式恢复逻辑。',
    status: 'success',
    statusLabel: 'Success',
    input: 'Risk result + account snapshot + approval result',
    output: 'text + outputs + callback summary',
    role: '保证 published contract 的最终返回结构稳定。',
    change: '草稿版重写了 disclaimer 文案，等待下一次 publish。',
    contractMode: 'openai',
    logsFilter: 'success',
    isDraftChanged: true,
    position: { left: 864, top: 292 }
  }
];

export const nodePaths = [
  'M252 168 C 286 168, 288 168, 312 168',
  'M528 168 C 560 168, 562 168, 588 168',
  'M410 218 C 494 238, 528 270, 588 344',
  'M804 344 C 830 344, 838 344, 864 344'
];

export const runs: FlowRun[] = [
  {
    id: 'run_2048',
    title: 'Finance approval backlog',
    subtitle: 'Paused before sending enterprise quote',
    status: 'waiting',
    statusLabel: 'Waiting callback',
    runtime: 'callback',
    contract: 'OpenAI compatible',
    currentNode: 'Approval gate',
    startedAt: '2026-04-12 10:41',
    reason:
      '系统已经停在等待态，checkpoint 与恢复来源都已显式写入；这里不允许继续往下跑。',
    recovery:
      '财务审批完成后，从同一 checkpoint 恢复，并保留新的 run 记录，不回写已发布版本。',
    events: [
      {
        time: '10:41:08',
        title: 'Classifier returned callback.required = true',
        note: '风险判断把当前会话转入人工审批路径。'
      },
      {
        time: '10:41:10',
        title: 'Checkpoint persisted',
        note: 'state action 已落盘，等待态具备恢复条件。'
      },
      {
        time: '10:41:11',
        title: 'Run paused for finance sign-off',
        note: '当前等待 owner 为 Finance Ops。'
      }
    ]
  },
  {
    id: 'run_2047',
    title: 'CRM enrichment retry',
    subtitle: 'Latest failure sample retained',
    status: 'failed',
    statusLabel: 'Failed',
    runtime: '08s',
    contract: 'OpenAI compatible',
    currentNode: 'CRM lookup',
    startedAt: '2026-04-12 09:12',
    reason:
      'CRM adapter 在 enrichment 阶段超时，失败样本被保留给日志与监控页共同复盘。',
    recovery:
      '先修 adapter，再从 draft 重新发布；失败日志本身不会偷偷修改 live contract。',
    events: [
      {
        time: '09:12:00',
        title: 'Email intake normalized request',
        note: 'tenant 与 account selector 都已准备好。'
      },
      {
        time: '09:12:05',
        title: 'CRM lookup timeout',
        note: 'Adapter 在 5 秒阈值后失败退出。'
      },
      {
        time: '09:12:08',
        title: 'Failure sample retained',
        note: 'run 详情已落到 logs drawer 与 monitoring hotspot。'
      }
    ]
  },
  {
    id: 'run_2046',
    title: 'Revenue intake pipeline',
    subtitle: 'Published contract v0.8.14',
    status: 'success',
    statusLabel: 'Success',
    runtime: '02m 14s',
    contract: 'OpenAI compatible',
    currentNode: 'Reply composer',
    startedAt: '2026-04-12 08:26',
    reason:
      'Published contract 正常返回，风险评分、回复正文和 callback 摘要都已写入 outputs。',
    recovery:
      '无需恢复；若要复盘，可在日志页继续查看事件轨迹和请求样本。',
    events: [
      {
        time: '08:26:04',
        title: 'Intake normalized payload',
        note: 'tenant / locale / account selector 对齐完成。'
      },
      {
        time: '08:27:08',
        title: 'CRM lookup returned healthy snapshot',
        note: '未触发等待态，也没有失败样本。'
      },
      {
        time: '08:28:18',
        title: 'Reply composer produced final text',
        note: 'run 正常完成并输出 text + outputs。'
      }
    ]
  },
  {
    id: 'run_2045',
    title: 'Draft parity review',
    subtitle: 'Claude compatible dry-run',
    status: 'running',
    statusLabel: 'Running',
    runtime: '58s',
    contract: 'Claude compatible',
    currentNode: 'Risk classifier',
    startedAt: '2026-04-12 07:58',
    reason:
      '正在校验 draft contract 与 published contract 的输出一致性，当前停在分类阈值对比阶段。',
    recovery:
      '校验完成后再决定是否发布 Claude compatible exposure mode；不会影响现有 OpenAI 入口。',
    events: [
      {
        time: '07:58:02',
        title: 'Draft contract loaded',
        note: '使用 Claude compatible payload 做 dry-run。'
      },
      {
        time: '07:58:19',
        title: 'Classifier threshold compare running',
        note: 'callback.required 与 riskScore 正在对齐。'
      },
      {
        time: '07:58:58',
        title: 'Awaiting parity verdict',
        note: '结果会同步到 API contract 视图。'
      }
    ]
  }
];

export const overviewRunSummaries: OverviewRunSummary[] = [
  {
    runId: 'run_2048',
    note: '审批等待必须显式停住并保留 checkpoint，不能被系统悄悄跳过。',
    actionLabel: '查看等待态 run_2048'
  },
  {
    runId: 'run_2047',
    note: '失败样本继续暴露在 logs 与 monitoring，先修 adapter，再谈重新发布。',
    actionLabel: '查看失败样本 run_2047'
  },
  {
    runId: 'run_2045',
    note: '兼容模式还在运行中校验，说明 draft parity 还没有收敛成正式暴露面。',
    actionLabel: '查看运行中 run_2045'
  }
];

export const overviewFocusItems: OverviewFocusItem[] = [
  {
    id: 'published-surface',
    title: 'Published surface',
    note: 'OpenAI compatible 仍是唯一 live 入口，先保证对外契约稳定，再扩更多 exposure mode。',
    status: 'published',
    statusLabel: 'Live traffic',
    actionLabel: '查看发布面',
    actionView: 'api',
    contractMode: 'openai'
  },
  {
    id: 'approval-backlog',
    title: 'Approval backlog',
    note: 'run_2048 停在 Approval gate；checkpoint 已落盘，当前最需要的是明确恢复而不是继续下游执行。',
    status: 'waiting',
    statusLabel: 'Waiting',
    actionLabel: '打开 backlog',
    actionView: 'logs',
    runId: 'run_2048'
  },
  {
    id: 'host-runtime-gap',
    title: 'Host runtime gap',
    note: 'embedded route、manifest 和 host context 都在，但真正的 mount handshake 还没进入 live runtime。',
    status: 'draft',
    statusLabel: 'Shell only',
    actionLabel: '检查 host gap',
    actionView: 'monitoring'
  }
];

const apiBaseUrl = getDefaultApiBaseUrl({
  protocol: 'http:',
  hostname: '127.0.0.1'
});

export const contracts: Record<ContractMode, ContractDefinition> = {
  openai: {
    id: 'openai',
    label: 'OpenAI compatible',
    status: 'published',
    statusLabel: 'Published',
    endpoint: `${apiBaseUrl}/v1/apps/${workspaceMeta.code}/responses`,
    auth: 'Bearer token + application scope rate limit',
    callback: '等待态必须先写 checkpoint，再通过 host callback 恢复。',
    consumers: ['Sales assistant', 'CSR widget', 'Internal workflow relay'],
    draftNote: '当前 published contract，与 live traffic 一致。',
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
      '请求结构继续保持轻量；调用方不用理解内部节点。',
      'callback.required 是显式字段，不靠异常或隐式暂停表达。',
      '回复正文与 outputs 分离，便于外部 UI 与监控共用。'
    ]
  },
  claude: {
    id: 'claude',
    label: 'Claude compatible',
    status: 'draft',
    statusLabel: 'Draft candidate',
    endpoint: `${apiBaseUrl}/v1/apps/${workspaceMeta.code}/messages`,
    auth: 'API key + tenant allowlist',
    callback:
      '与 published 路径共享 checkpoint discipline，但 exposure mode 仍在 parity 校验中。',
    consumers: ['Draft QA harness', 'Parity review task'],
    draftNote: '本轮重点是校验 classifier 阈值与 callback 输出一致性。',
    requestExample: `{
  "messages": [
    { "role": "user", "content": "Summarize account risk" }
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
      '只复用 published flow，不发明第二套运行逻辑。',
      '兼容模式切换只影响 envelope，不改变 state / callback discipline。',
      '发布前必须通过 parity review run。'
    ]
  },
  native: {
    id: 'native',
    label: 'Native invoke',
    status: 'draft',
    statusLabel: 'Internal only',
    endpoint: `${apiBaseUrl}/runtime/apps/${workspaceMeta.code}/execute`,
    auth: 'Internal runtime actor + capability slots',
    callback:
      '保留同一套等待态约束，但当前仍限定在内部 runtime 流程中使用。',
    consumers: ['Host runtime', 'Embedded mount handshake'],
    draftNote: '对应未来 embedded mount 与 runtime host 的真正接缝。',
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
      '内部 invoke 仍应复用同一张状态语义表。',
      'embedded runtime 不能绕过 checkpoint 与 logs。',
      'runtime mount 接通前，不应伪装成已上线能力。'
    ]
  }
};

export const monitoringWindows: Record<
  MonitoringWindow,
  {
    metrics: MonitoringMetric[];
    hotspots: MonitoringHotspot[];
    stateRows: { title: string; note: string }[];
    pluginRows: RepoRealityItem[];
  }
> = {
  '24h': {
    metrics: [
      {
        title: 'Callback recovery',
        value: '98.4%',
        note: '14 / 15 waiting runs 顺利恢复，没有出现隐式 side effect。',
        status: 'healthy',
        statusLabel: 'Healthy',
        spark: [32, 40, 46, 54, 60, 68, 72, 84]
      },
      {
        title: 'Queue wait p95',
        value: '18s',
        note: '当前最长等待来自 Approval gate，但仍在允许阈值内。',
        status: 'waiting',
        statusLabel: 'Waiting',
        spark: [10, 12, 16, 18, 20, 24, 28, 36]
      },
      {
        title: 'CRM timeout hotspot',
        value: '1 sample',
        note: '失败样本已保存在 logs drawer，可直接复盘 adapter 行为。',
        status: 'failed',
        statusLabel: 'Failed',
        spark: [8, 10, 14, 18, 24, 46, 18, 12]
      },
      {
        title: 'Embedded mount host',
        value: 'shell only',
        note: '真实路由已存在，runtime host 仍未接通。',
        status: 'draft',
        statusLabel: 'Draft',
        spark: [8, 8, 8, 8, 8, 8, 8, 8]
      }
    ],
    hotspots: [
      {
        title: 'Approval gate backlog',
        note: '当前 waiting run 停在 Approval gate，可直接跳到 logs 过滤等待态。',
        status: 'waiting',
        actionView: 'logs',
        runFilter: 'waiting',
        actionLabel: '打开等待态'
      },
      {
        title: 'CRM adapter timeout',
        note: '失败样本已经保留；应先修 adapter，再考虑重发草稿。',
        status: 'failed',
        actionView: 'logs',
        runFilter: 'failed',
        actionLabel: '打开失败样本'
      },
      {
        title: 'Classifier threshold parity',
        note: 'Draft contract 还在校验 callback.required 的阈值一致性。',
        status: 'running',
        actionView: 'api',
        contractMode: 'claude',
        actionLabel: '看 draft contract'
      }
    ],
    stateRows: [
      {
        title: '显式 state writes',
        note: '所有等待态与恢复入口都仍然经过 state action 落盘。'
      },
      {
        title: 'Checkpoint provenance',
        note: 'logs drawer 与 monitoring 都保留恢复来源，不让人猜测 run 是怎么停下来的。'
      },
      {
        title: 'Published / draft split',
        note: '恢复动作只生成新的 draft，不会改写 live contract。'
      }
    ],
    pluginRows: [
      {
        title: 'CRM adapter',
        note: '失败样本存在，但 published contract 没被污染。',
        status: 'failed',
        statusLabel: 'Needs fix'
      },
      {
        title: 'Callback host',
        note: '等待态恢复仍由 host 负责，flow 本身不偷跑恢复逻辑。',
        status: 'healthy',
        statusLabel: 'Healthy'
      },
      {
        title: 'Embedded mount host',
        note: '真实路由已预留，但 mount runtime 还没进 live traffic。',
        status: 'draft',
        statusLabel: 'Pending'
      }
    ]
  },
  '7d': {
    metrics: [
      {
        title: 'Callback recovery',
        value: '97.8%',
        note: '一周内等待态恢复稳定，未出现回放污染。',
        status: 'healthy',
        statusLabel: 'Healthy',
        spark: [24, 28, 36, 44, 50, 60, 70, 78]
      },
      {
        title: 'Queue wait p95',
        value: '21s',
        note: '审批 backlog 在周中放大，但仍未超过告警阈值。',
        status: 'waiting',
        statusLabel: 'Watch',
        spark: [10, 12, 16, 22, 26, 20, 18, 16]
      },
      {
        title: 'CRM timeout samples',
        value: '3',
        note: '问题集中在同一 adapter，说明更像插件边界问题，而不是 flow 设计错误。',
        status: 'failed',
        statusLabel: 'Hotspot',
        spark: [6, 8, 10, 12, 20, 24, 14, 10]
      },
      {
        title: 'Contract parity reviews',
        value: '5',
        note: '兼容模式扩展仍在验证 envelope 对齐，不改运行时语义。',
        status: 'running',
        statusLabel: 'Running',
        spark: [2, 4, 4, 5, 6, 5, 5, 5]
      }
    ],
    hotspots: [
      {
        title: 'Weekly parity reviews',
        note: '继续先校验契约封装，再决定是否开放 Claude exposure mode。',
        status: 'running',
        actionView: 'api',
        contractMode: 'claude',
        actionLabel: '看兼容模式'
      },
      {
        title: 'Retained CRM failures',
        note: '一周内仍有三条失败样本，说明插件边界治理还需要补。',
        status: 'failed',
        actionView: 'logs',
        runFilter: 'failed',
        actionLabel: '打开失败样本'
      },
      {
        title: 'Approval queue drift',
        note: '等待态数量没有失控，但审批链路仍需要更清晰的 owner 显示。',
        status: 'waiting',
        actionView: 'logs',
        runFilter: 'waiting',
        actionLabel: '看等待态'
      }
    ],
    stateRows: [
      {
        title: 'State model remains explicit',
        note: '周级趋势仍然证明 state writes 没有被绕过。'
      },
      {
        title: 'Logs + monitoring stay aligned',
        note: '失败样本和等待样本都能被跨页追踪，不再是孤立页面。'
      },
      {
        title: 'Draft never mutates live',
        note: '所有实验性兼容模式都还停留在 draft，避免污染 published traffic。'
      }
    ],
    pluginRows: [
      {
        title: 'CRM adapter',
        note: '需要回到 adapter 层做重试和超时治理，而不是在 flow 里兜底。',
        status: 'failed',
        statusLabel: 'Needs owner'
      },
      {
        title: 'Approval callback host',
        note: '恢复链路可用，但 owner 展示仍然过于文本化。',
        status: 'waiting',
        statusLabel: 'Needs polish'
      },
      {
        title: 'Embedded runtime bridge',
        note: 'manifest 和 embed context 都在，缺的是真正的 host handshake。',
        status: 'draft',
        statusLabel: 'Backlog'
      }
    ]
  }
};

export const embeddedArtifacts: EmbeddedAppManifest[] = [
  createEmbeddedAppManifest({
    appId: 'pricing-console',
    name: 'Pricing Console',
    version: '0.3.2',
    entry: 'dist/index.html',
    routePrefix: '/embedded/pricing-console'
  }),
  createEmbeddedAppManifest({
    appId: 'revenue-handoff',
    name: 'Revenue Handoff',
    version: '0.2.0',
    entry: 'dist/index.html',
    routePrefix: '/embedded/revenue-handoff'
  })
];

export const embedRuntimeSnapshot = createEmbedContext({
  applicationId: workspaceMeta.code,
  teamId: 'team_growth_ops'
});

export function getNode(nodeId: string) {
  return nodes.find((node) => node.id === nodeId) ?? nodes[0];
}

export function getRun(runId: string | null) {
  return runs.find((run) => run.id === runId);
}

export function getRunsByFilter(filter: RunFilter) {
  return filter === 'all' ? runs : runs.filter((run) => run.status === filter);
}

export function getWorkspacePageForPath(pathname: string) {
  return (
    workspacePages.find((page) =>
      page.route === '/' ? pathname === page.route : pathname.startsWith(page.route)
    ) ?? workspacePages[0]
  );
}
