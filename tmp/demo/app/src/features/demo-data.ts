export type DemoStatus =
  | 'running'
  | 'waiting'
  | 'failed'
  | 'healthy'
  | 'draft'
  | 'selected';

export interface MetricCard {
  label: string;
  value: string;
  status: DemoStatus;
  note: string;
}

export interface ConsoleEntry {
  title: string;
  href: string;
  description: string;
  note: string;
  status: DemoStatus;
  badge: string;
}

export interface GovernanceItem {
  id: string;
  title: string;
  detail: string;
  note: string;
  status: DemoStatus;
  statusLabel: string;
  actionLabel: string;
  href: string;
}

export interface SnapshotItem {
  key: string;
  label: string;
  value: string;
}

export interface QueueItem {
  id: string;
  title: string;
  area: string;
  owner: string;
  dueAt: string;
  status: DemoStatus;
  statusLabel: string;
  summary: string;
  detail: string;
  nextAction: string;
  followUps: string[];
  actionLabel: string;
  href: string;
}

export interface RunItem {
  id: string;
  flow: string;
  owner: string;
  startedAt: string;
  status: DemoStatus;
  summary: string;
  detail: string;
  events: string[];
}

export interface StudioNode {
  id: string;
  name: string;
  kind: string;
  owner: string;
  status: DemoStatus;
  statusLabel: string;
  description: string;
  output: string;
}

export interface StudioOverviewItem {
  label: string;
  value: string;
  note: string;
  status: DemoStatus;
}

export interface StudioReleaseItem {
  key: string;
  label: string;
  value: string;
  note: string;
  status: DemoStatus;
}

export interface StudioRuntimeItem {
  key: string;
  title: string;
  time: string;
  note: string;
  status: DemoStatus;
  statusLabel: string;
}

export interface StudioStateItem {
  key: string;
  label: string;
  value: string;
  note: string;
}

export interface StudioActionItem {
  key: string;
  title: string;
  description: string;
  href: string;
  status: DemoStatus;
  badge: string;
}

export interface StudioFocusItem {
  title: string;
  detail: string;
  origin: string;
  checkpoint: string;
  nextStep: string;
  actionLabel: string;
  actionHref: string;
  status: DemoStatus;
  statusLabel: string;
  runtimeKey: string;
  releaseKey: string;
}

export interface SubsystemItem {
  id: string;
  name: string;
  status: DemoStatus;
  statusLabel: string;
  routePrefix: string;
  owner: string;
  version: string;
  summary: string;
  mountMode: string;
  mountModeNote: string;
  authScope: string;
  lastUpdated: string;
  pendingActions: string[];
  actionLabel: string;
  actionHref: string;
}

export interface PageFocusItem {
  title: string;
  detail: string;
  note: string;
  actionLabel: string;
  actionHref: string;
  status: DemoStatus;
  statusLabel: string;
}

export interface SubsystemFocusItem extends PageFocusItem {
  subsystemId: string;
}

export interface SettingField {
  key: string;
  label: string;
  value: string;
}

export interface ApiSurfaceItem {
  key: string;
  method: string;
  path: string;
  exposure: string;
  note: string;
}

export interface ToolIncident {
  id: string;
  title: string;
  owner: string;
  domain: string;
  status: DemoStatus;
  statusLabel: string;
  severity: string;
  updatedAt: string;
  summary: string;
  detail: string;
  nextAction: string;
  relatedSurface: string;
  relatedEndpoint: string;
  playbook: string[];
  actionLabel: string;
  actionHref: string;
}

export const workbenchMetrics: MetricCard[] = [
  {
    label: '控制面健康',
    value: '99.94%',
    status: 'healthy',
    note: '过去 24 小时认证、接口与运行时状态稳定。'
  },
  {
    label: '治理待办',
    value: '03',
    status: 'waiting',
    note: '等待权限复核、回写确认与缓存策略拍板。'
  },
  {
    label: '已接入子系统',
    value: '12',
    status: 'running',
    note: '统一复用会话上下文和宿主挂载能力。'
  },
  {
    label: '本周交付窗口',
    value: '02',
    status: 'draft',
    note: '还有两项治理策略等待最终拍板。'
  }
];

export const consoleEntries: ConsoleEntry[] = [
  {
    title: '查看子系统接入',
    href: '/subsystems',
    description: '检查挂载路由、版本与访问边界，继续核对每个业务入口的宿主契约。',
    note: '12 个接入入口已纳入统一路由前缀。',
    status: 'running',
    badge: '持续同步'
  },
  {
    title: '查看工具台',
    href: '/tools',
    description: '集中处理接口审阅、运行告警与交付检查，不再散落在多张临时卡片里。',
    note: '当前有 3 条事件等待平台负责人排队收口。',
    status: 'waiting',
    badge: '事件处理中'
  },
  {
    title: '打开控制台设置',
    href: '/settings',
    description: '管理账户资料、安全策略、访问控制和接口文档入口。',
    note: '权限矩阵和审计入口已经固定到同一治理域。',
    status: 'draft',
    badge: '治理域'
  }
];

export const governanceNotes: GovernanceItem[] = [
  {
    id: 'incident-webhook',
    title: '发布闭环仍缺最终确认',
    detail: 'revision-24 已经完成发布动作，但回写窗口还没闭环，不能把这次交付当成“已完成”。',
    note: '先回到流程编排确认 checkpoint，再进入工具台处理阻塞事件。',
    status: 'waiting',
    statusLabel: '等待回写',
    actionLabel: '打开发布闭环',
    href: '/studio?focus=release-gateway&track=callback&incident=incident-webhook'
  },
  {
    id: 'incident-acl',
    title: '访问控制仍有授权口径冲突',
    detail: '当前阻塞不是缺一个页面，而是 own / all 这组授权语义还没统一，发布前校验会继续拦截。',
    note: '不要先翻 API 列表，直接回到访问控制完成角色矩阵复核。',
    status: 'failed',
    statusLabel: '阻塞发布',
    actionLabel: '直达访问控制',
    href: '/settings?section=access&focus=incident-acl'
  },
  {
    id: 'cache-rollout',
    title: '增长门户缓存切换仍未锁定窗口',
    detail: '资源包已经准备完成，但正式切换仍卡在缓存策略和同步窗口，子系统页需要承担这条治理语义。',
    note: '先看子系统摘要和挂载路径，再到工具台跟进缓存窗口。',
    status: 'running',
    statusLabel: '窗口未锁定',
    actionLabel: '查看接入窗口',
    href: '/subsystems?subsystem=growth-portal&focus=cache-rollout'
  }
];

export const workspaceSnapshot: SnapshotItem[] = [
  {
    key: 'team',
    label: '当前团队',
    value: '增长实验室'
  },
  {
    key: 'role',
    label: '当前角色',
    value: '平台负责人'
  },
  {
    key: 'release',
    label: '最近发布',
    value: '2026-04-13 18:40'
  }
];

export const homeActionQueue: QueueItem[] = [
  {
    id: 'queue-acl',
    title: '权限矩阵复核',
    area: '访问控制',
    owner: '安全团队',
    dueAt: '今天 11:30',
    status: 'waiting',
    statusLabel: '待确认',
    summary: '需要确认角色矩阵中的 own / all 收敛方式，再决定是否允许本周发布。',
    detail:
      '当前权限矩阵里仍有一个角色同时触发 own 与 all 两条授权语义，工作台只保留人工复核入口，不再在首页直接展开矩阵细节。',
    nextAction: '前往设置 / 访问控制完成授权复核',
    followUps: [
      '比对角色矩阵与 API 文档中的权限说明是否一致。',
      '确认该角色是否仍需要跨团队查询能力。',
      '复核完成后把结果同步到发布审批记录。'
    ],
    actionLabel: '打开访问控制复核',
    href: '/settings?section=access&focus=incident-acl'
  },
  {
    id: 'queue-webhook',
    title: '发布回写确认',
    area: '发布网关',
    owner: '平台运维',
    dueAt: '今天 10:15',
    status: 'waiting',
    statusLabel: '等待回写',
    summary: '外部回写窗口已开启，但仍未收到 revision-24 的最终确认。',
    detail:
      '发布网关已经生成 revision-24 快照并推送宿主扩展，当前需要跟第三方回调窗口对齐时间戳，避免误判为失败重试。',
    nextAction: '核对回调时间窗并补写发布确认',
    followUps: [
      '检查第三方 webhook 是否落在预期的五分钟窗口内。',
      '对齐发布网关和工具台的状态更新时间。',
      '如果超出窗口，补记一次人工确认说明。'
    ],
    actionLabel: '打开发布闭环',
    href: '/studio?focus=release-gateway&track=callback&incident=incident-webhook'
  },
  {
    id: 'queue-cache',
    title: '子系统缓存切换',
    area: '子系统接入',
    owner: '增长系统',
    dueAt: '今天 15:00',
    status: 'running',
    statusLabel: '处理中',
    summary: '新资源包已经准备完成，但缓存策略还未从“立即替换”切换到“分批刷新”。',
    detail:
      '增长门户的新资源包已经上传到宿主侧，当前需要先确定缓存刷新策略，再推进到正式挂载窗口。',
    nextAction: '确认缓存刷新方案后进入子系统发布窗口',
    followUps: [
      '确认新旧包共存时间是否需要跨越一个发布周期。',
      '比对子系统挂载版本与接入清单中的资源引用。',
      '为业务方准备一次回滚说明。'
    ],
    actionLabel: '查看子系统接入窗口',
    href: '/subsystems?subsystem=growth-portal&focus=cache-rollout'
  }
];

export const demoRuns: RunItem[] = [
  {
    id: 'run_1021',
    flow: '发布检查 / 修订 24',
    owner: '平台运维',
    startedAt: '09:40',
    status: 'waiting',
    summary: '等待回写',
    detail: '最近一次发布任务已完成，等待 webhook 回写，当前仍处于可恢复窗口内。',
    events: [
      '09:40 生成 revision-24 发布快照',
      '09:43 推送运行时配置到宿主扩展',
      '09:46 等待第三方 webhook 回写确认'
    ]
  },
  {
    id: 'run_1018',
    flow: '子系统同步 / 接入清单',
    owner: '增长系统',
    startedAt: '08:05',
    status: 'running',
    summary: '同步进行中',
    detail: '子系统挂载注册表正在增量同步，等待最后一轮接入清单校验完成。',
    events: [
      '08:05 读取最新接入清单',
      '08:11 更新挂载路径和访问上下文',
      '08:18 校验权限边界和宿主能力'
    ]
  },
  {
    id: 'run_1014',
    flow: '权限复核 / 角色矩阵',
    owner: '安全团队',
    startedAt: '昨天 17:20',
    status: 'failed',
    summary: '权限冲突',
    detail: '角色矩阵中存在一条 own/all 语义冲突，需要人工回到访问控制面板处理。',
    events: [
      '昨天 17:20 发现 API 文档与权限矩阵不一致',
      '昨天 17:35 自动修复失败并要求人工复核',
      '昨天 17:42 已写入治理待办'
    ]
  }
];

export const studioNodes: StudioNode[] = [
  {
    id: 'requirement-intake',
    name: '需求汇总',
    kind: '输入',
    owner: '产品运营',
    status: 'running',
    statusLabel: '处理中',
    description: '把需求、文档和边界约束整理成稳定上下文，避免直接把零散信息带进编排。',
    output: '输出结构化上下文，供后续权限校验和发布检查复用。'
  },
  {
    id: 'policy-check',
    name: '权限校验',
    kind: '校验',
    owner: '安全团队',
    status: 'waiting',
    statusLabel: '待校验',
    description: '校验权限、会话、暴露级别和当前宿主约束是否匹配。',
    output: '输出 allow / review-needed 结果，并标记影响范围。'
  },
  {
    id: 'release-gateway',
    name: '发布网关',
    kind: '执行',
    owner: '平台运行时',
    status: 'healthy',
    statusLabel: '已就绪',
    description: '负责把已确认流程发布到宿主运行时，并同步更新入口版本。',
    output: '生成 runtime revision，通知工具台和日志页回填状态。'
  }
];

export const studioOverview: StudioOverviewItem[] = [
  {
    label: '当前 Flow',
    value: '发布检查',
    note: '本轮演示围绕发布前治理闭环，而不是泛节点堆叠。',
    status: 'running'
  },
  {
    label: '对外入口',
    value: '/agentflows/publish-check/runs',
    note: 'Flow 发布后以稳定 Agent API 暴露，不再停留在控制台内调试。',
    status: 'healthy'
  },
  {
    label: '恢复点',
    value: '04',
    note: '包含 webhook、人工复核和回调恢复三个关键边界。',
    status: 'waiting'
  },
  {
    label: '状态字段',
    value: '06',
    note: '团队、权限、发布 revision 和回写窗口都进入结构化状态层。',
    status: 'selected'
  }
];

export const studioReleaseItems: StudioReleaseItem[] = [
  {
    key: 'endpoint',
    label: '发布入口',
    value: '/agentflows/publish-check/runs',
    note: '保持 Agent 友好的统一调用入口。',
    status: 'healthy'
  },
  {
    key: 'revision',
    label: '当前 revision',
    value: 'revision-24',
    note: '最新发布快照已生成，正在等待回写确认。',
    status: 'waiting'
  },
  {
    key: 'exposure',
    label: '暴露级别',
    value: '外部 Agent + 控制台治理',
    note: '公开调用与治理入口语义已经分开，不再混在一张表里。',
    status: 'running'
  },
  {
    key: 'callback',
    label: '回写窗口',
    value: '5 分钟可恢复',
    note: '超过时间窗后自动转入工具台阻塞事件。',
    status: 'failed'
  }
];

export const studioRuntimeTrack: StudioRuntimeItem[] = [
  {
    key: 'snapshot',
    title: '生成发布快照',
    time: '09:40',
    note: '把 Flow 定义、输入输出契约和当前 revision 一起固化成可恢复对象。',
    status: 'healthy',
    statusLabel: '已固化'
  },
  {
    key: 'checkpoint',
    title: '写入 checkpoint',
    time: '09:43',
    note: '在 webhook 等待前先落 checkpoint，避免回写失败后丢失运行上下文。',
    status: 'running',
    statusLabel: '已完成'
  },
  {
    key: 'callback',
    title: '等待第三方回写',
    time: '09:46',
    note: '当前仍在回写窗口内，超时后会进入工具台阻塞事件。',
    status: 'waiting',
    statusLabel: '等待回写'
  },
  {
    key: 'recovery',
    title: '恢复并补记发布状态',
    time: '下一步',
    note: '如果回写缺失，平台负责人需要根据日志和回调时间戳决定是否人工补记。',
    status: 'draft',
    statusLabel: '待执行'
  }
];

export const studioStateItems: StudioStateItem[] = [
  {
    key: 'memory',
    label: '长期记忆：团队发布偏好',
    value: '保留 5 分钟回写窗口，允许人工补记成功状态。',
    note: '属于跨会话可复用策略，不应散落在页面临时提示里。'
  },
  {
    key: 'session',
    label: '当前会话：增长实验室 / 平台负责人',
    value: '继承控制台会话与当前工作区上下文。',
    note: '确保发布审批、工具台和子系统页看到同一组治理边界。'
  },
  {
    key: 'permissions',
    label: '权限绑定：发布审批 + 访问控制复核',
    value: 'own/all 冲突会直接阻塞发布，不允许绕过治理页。',
    note: '权限模型是一等运行前校验条件，不是纯展示字段。'
  }
];

export const studioActions: StudioActionItem[] = [
  {
    key: 'tools',
    title: '打开工具台事件队列',
    description: '查看回写超时、权限冲突和发布窗口异常是否需要人工接管。',
    href: '/tools?incident=incident-webhook',
    status: 'waiting',
    badge: '阻塞事件'
  },
  {
    key: 'settings',
    title: '返回访问控制',
    description: '继续收口角色矩阵、公开接口边界和审计要求。',
    href: '/settings?section=access&focus=incident-acl',
    status: 'failed',
    badge: '治理出口'
  },
  {
    key: 'subsystems',
    title: '核对子系统挂载',
    description: '确认最新 revision 已同步到宿主扩展与业务入口。',
    href: '/subsystems?subsystem=growth-portal&focus=cache-rollout',
    status: 'running',
    badge: '发布影响面'
  }
];

export const studioFocusItems: Record<string, StudioFocusItem> = {
  default: {
    title: '当前交付主线',
    detail: '这条 Flow 的重点不是把节点排完，而是确认发布、回写、恢复点和状态记忆已经形成稳定闭环。',
    origin: '工作台 / 流程编排',
    checkpoint: '发布检查 · revision-24 · 运行前复核',
    nextStep: '继续核对发布入口、运行轨道和状态记忆是否一致。',
    actionLabel: '打开工具台事件队列',
    actionHref: '/tools',
    status: 'running',
    statusLabel: '持续治理中',
    runtimeKey: 'checkpoint',
    releaseKey: 'revision'
  },
  'incident-webhook': {
    title: 'Webhook 回写超时',
    detail: '当前发布动作已经完成，但回写窗口还没闭环，所以这次 Flow 仍不能被当作真正完成交付。',
    origin: '工作台 / 发布回写确认',
    checkpoint: '发布网关 · revision-24 · 09:46 等待回写',
    nextStep: '先核对回写时间窗，再到工具台决定是否人工补记发布成功。',
    actionLabel: '前往工具台处理事件',
    actionHref: '/tools?incident=incident-webhook',
    status: 'failed',
    statusLabel: '交付未闭环',
    runtimeKey: 'callback',
    releaseKey: 'callback'
  }
};

export const subsystems: SubsystemItem[] = [
  {
    id: 'growth-portal',
    name: '增长门户',
    status: 'healthy',
    statusLabel: '稳定',
    routePrefix: '/embedded/growth-portal',
    owner: '增长系统',
    version: '0.4.2',
    summary: '营销工作台，当前通过宿主扩展方式挂到控制台。',
    mountMode: '宿主扩展',
    mountModeNote: 'host-extension',
    authScope: '继承当前控制台会话',
    lastUpdated: '2026-04-13 18:10',
    pendingActions: ['确认新版资源包的缓存策略', '补齐默认团队欢迎页'],
    actionLabel: '进入接入治理',
    actionHref: '/tools?incident=incident-registry'
  },
  {
    id: 'ops-board',
    name: '运营看板',
    status: 'running',
    statusLabel: '同步中',
    routePrefix: '/embedded/ops-board',
    owner: '运营团队',
    version: '0.3.8',
    summary: '运营协同板，依赖统一会话和权限上下文。',
    mountMode: '运行时嵌入',
    mountModeNote: 'embedded-runtime',
    authScope: '控制台会话 + 运行时权限映射',
    lastUpdated: '2026-04-13 15:35',
    pendingActions: ['等待最新接入清单校验完成'],
    actionLabel: '查看同步事件',
    actionHref: '/tools?incident=incident-registry'
  },
  {
    id: 'docs-hub',
    name: '文档中心',
    status: 'draft',
    statusLabel: '待发布',
    routePrefix: '/embedded/docs-hub',
    owner: '开发者体验',
    version: '0.2.0',
    summary: '正在收口 API 文档与最佳实践入口，还未进入正式发布。',
    mountMode: '静态资源包',
    mountModeNote: 'static-bundle',
    authScope: '只读文档访问',
    lastUpdated: '2026-04-12 21:20',
    pendingActions: ['补齐 API 文档跳转入口', '确认版本切换策略'],
    actionLabel: '查看 API 文档',
    actionHref: '/settings?section=api&focus=incident-api'
  }
];

export const subsystemFocusItems: Record<string, SubsystemFocusItem> = {
  'cache-rollout': {
    subsystemId: 'growth-portal',
    title: '增长门户缓存切换',
    detail: '这轮关注点不是子系统数量，而是增长门户的新资源包虽然已就绪，但缓存刷新窗口还没锁定。',
    note: '先确认资源包切换策略，再到工具台跟进同步事件是否需要人工放行。',
    actionLabel: '前往工具台跟进缓存窗口',
    actionHref: '/tools?incident=incident-registry',
    status: 'running',
    statusLabel: '窗口待锁定'
  },
  'registry-lag': {
    subsystemId: 'ops-board',
    title: '运营看板同步滞后',
    detail: '接入清单的宿主能力校验还没结束，所以这条子系统同步不能提前标记为稳定。',
    note: '确认缺失能力后，再回到工具台解除同步滞后事件。',
    actionLabel: '前往工具台查看同步事件',
    actionHref: '/tools?incident=incident-registry',
    status: 'waiting',
    statusLabel: '等待校验'
  }
};

export const apiSurface: ApiSurfaceItem[] = [
  {
    key: 'me',
    method: 'GET',
    path: '/api/console/me',
    exposure: '控制台内',
    note: '读取当前登录用户、角色和团队上下文。'
  },
  {
    key: 'permissions',
    method: 'GET',
    path: '/api/console/permissions',
    exposure: '控制台内',
    note: '获取控制台可绑定的权限定义。'
  },
  {
    key: 'team',
    method: 'PATCH',
    path: '/api/console/team',
    exposure: '控制台内',
    note: '更新团队显示名、通知策略和工作区默认配置。'
  },
  {
    key: 'signin',
    method: 'POST',
    path: '/api/public/auth/providers/password-local/sign-in',
    exposure: '公开入口',
    note: '本地账号登录，建立当前设备会话。'
  }
];

export const monitoringSignals: MetricCard[] = [
  {
    label: '运行时告警',
    value: '02',
    status: 'failed',
    note: '一条权限冲突，一条 webhook 超时。'
  },
  {
    label: '待审核变更',
    value: '05',
    status: 'waiting',
    note: '需要平台负责人或安全团队二次确认。'
  },
  {
    label: '稳定窗口',
    value: '18h',
    status: 'healthy',
    note: '最近一段时间无 API 级中断。'
  }
];

export const toolIncidents: ToolIncident[] = [
  {
    id: 'incident-acl',
    title: '权限矩阵冲突',
    owner: '安全团队',
    domain: '访问控制',
    status: 'waiting',
    statusLabel: '待确认',
    severity: '高',
    updatedAt: '今天 09:48',
    summary: '同一角色同时命中 own 与 all 两类授权，需要回到访问控制面板重新确认范围。',
    detail:
      '工具台保留的是事件级视角：这条事件代表发布前的治理阻塞，不再把完整权限矩阵直接摊在工具页首屏。',
    nextAction: '回到设置 / 访问控制，确认 own 与 all 的最终授权口径。',
    relatedSurface: '角色矩阵 / 发布审批',
    relatedEndpoint: '/api/console/permissions',
    playbook: [
      '先确认问题是否只影响单个角色，避免扩大 blast radius。',
      '对照 API 文档中的权限说明，确认是否存在过期描述。',
      '复核完成后更新发布审批记录，再解除阻塞状态。'
    ],
    actionLabel: '前往访问控制',
    actionHref: '/settings?section=access&focus=incident-acl'
  },
  {
    id: 'incident-webhook',
    title: 'Webhook 回写超时',
    owner: '平台运维',
    domain: '发布网关',
    status: 'failed',
    statusLabel: '已阻塞',
    severity: '高',
    updatedAt: '今天 09:41',
    summary: 'revision-24 的第三方回写超过约定窗口，需要人工判断是否补记成功。',
    detail:
      '当前运行时已经完成发布动作，但回写通道没有在预期窗口内返回最终确认，工具台需要把它收口成阻塞事件而不是停留在模糊“待处理”。',
    nextAction: '比对发布日志与第三方回调时间戳，决定是否补记发布成功。',
    relatedSurface: '修订 24 / 发布网关',
    relatedEndpoint: '外部回写通道',
    playbook: [
      '核对发布网关日志中的请求标识和第三方回调日志。',
      '确认是否需要人工补记一次成功状态，避免误触发重试。',
      '为下轮发布补充回写窗口的监控告警。'
    ],
    actionLabel: '查看发布检查',
    actionHref: '/studio?focus=release-gateway&track=callback&incident=incident-webhook'
  },
  {
    id: 'incident-registry',
    title: '子系统清单同步滞后',
    owner: '增长系统',
    domain: '子系统注册',
    status: 'running',
    statusLabel: '处理中',
    severity: '中',
    updatedAt: '今天 08:26',
    summary: '接入清单增量同步已经开始，但仍有一个入口未完成宿主能力校验。',
    detail:
      '子系统清单同步仍在进行中，工具台只展示影响治理的收口动作，不把整张接入清单当作主界面内容。',
    nextAction: '补完宿主能力校验，再回写到子系统页的版本摘要。',
    relatedSurface: '接入清单 / 同步窗口',
    relatedEndpoint: '/embedded/ops-board',
    playbook: [
      '确认缺失的 capability 是否来自最新资源包。',
      '完成校验后同步更新子系统页的挂载版本。',
      '记录本次同步滞后是否来自缓存策略。'
    ],
    actionLabel: '打开子系统页',
    actionHref: '/subsystems?subsystem=ops-board&focus=registry-lag'
  },
  {
    id: 'incident-api',
    title: '接口暴露级别待复核',
    owner: '平台内核',
    domain: '接口治理',
    status: 'draft',
    statusLabel: '排队中',
    severity: '中',
    updatedAt: '今天 07:58',
    summary: '公开接口和控制台接口的边界已收口，但还未完成最终复核。',
    detail:
      '工具台保留这条排队事件，用来提示本轮仍有接口治理事项未关闭，但不会把它放到首页行动队列里抢主位。',
    nextAction: '确认公开接口只保留明确对外入口，再更新治理结论。',
    relatedSurface: '公开接口 / 控制台接口',
    relatedEndpoint: '/api/public/auth/providers/password-local/sign-in',
    playbook: [
      '列出当前所有公开暴露面，确认是否仍有非预期开口。',
      '将通过复核的接口回写到文档说明中。',
      '把未通过复核的接口标记到下一轮治理清单。'
    ],
    actionLabel: '查看 API 文档',
    actionHref: '/settings?section=api&focus=incident-api'
  }
];

export const toolFollowUps = [
  '工具台定位固定为事件处理中枢，接口面摘要只作为辅助证据出现。',
  '工作台不再承担运维细节，所有阻塞事件统一回收到工具台。',
  '移动端优先保留行动和入口，深度治理内容一律走 Drawer 或独立页。'
];

export const profileFields: SettingField[] = [
  {
    key: 'display-name',
    label: '显示名',
    value: 'Mina Chen'
  },
  {
    key: 'email',
    label: '邮箱',
    value: 'mina@growthlab.dev'
  },
  {
    key: 'role',
    label: '默认角色',
    value: '平台负责人'
  },
  {
    key: 'active',
    label: '最近活跃',
    value: '2026-04-14 00:48'
  }
];

export const securityFields: SettingField[] = [
  {
    key: 'password-policy',
    label: '密码策略',
    value: '90 天轮换一次'
  },
  {
    key: 'session-duration',
    label: '会话时长',
    value: '12 小时自动失效'
  },
  {
    key: 'mfa',
    label: '双重验证',
    value: '高风险操作必须二次确认'
  }
];

export const securityNotes = [
  '最近 30 天未出现异常设备登录。',
  '当前设备已绑定最近一次密码修改记录。',
  '删除会话和重置密码会统一写入审计日志。'
];

export const accessMatrix = [
  {
    key: 'owner',
    role: '平台负责人',
    scope: '全局',
    permissions: '成员管理、角色治理、文档审阅、发布审批'
  },
  {
    key: 'ops',
    role: '运营负责人',
    scope: '团队',
    permissions: '运行记录、监控排查、发布复核'
  },
  {
    key: 'builder',
    role: '流程构建者',
    scope: '本人',
    permissions: '流程编排、草稿发布'
  }
];

export const apiDocHighlights = [
  '控制台内嵌后端文档入口，减少上下文切换。',
  '文档与角色权限矩阵一起校验，避免接口与授权说明脱节。',
  '后续切换到真实接口后，只替换数据源，不改变页面结构。'
];

export const settingsFocusItems: Record<string, PageFocusItem> = {
  'incident-acl': {
    title: '权限矩阵冲突',
    detail: '当前有一条发布前阻塞事件直接指向访问控制，需要先统一授权口径。',
    note: '先收敛 own / all，再把结果回写到发布审批和 API 文档说明。',
    actionLabel: '回到工具台查看阻塞事件',
    actionHref: '/tools?incident=incident-acl',
    status: 'failed',
    statusLabel: '阻塞发布'
  },
  'incident-api': {
    title: '公开接口边界待复核',
    detail: '当前 API 文档区需要承担治理结论，明确哪些接口属于公开暴露面，哪些只留在控制台内。',
    note: '只替换数据源，不改变文档页结构，确保后续接真接口时不再返工信息层级。',
    actionLabel: '回到工具台继续复核',
    actionHref: '/tools?incident=incident-api',
    status: 'waiting',
    statusLabel: '等待复核'
  }
};
