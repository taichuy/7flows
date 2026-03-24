import {
  buildOperatorFollowUpSurfaceCopy,
  buildRequiredOperatorRunDetailLinkSurface,
  type OperatorFollowUpLinkSurface
} from "@/lib/operator-follow-up-presenters";
import type { WorkbenchEntryLinksConfig } from "@/lib/workbench-entry-links";
import { buildWorkflowDetailHref } from "@/lib/workbench-links";

export type AuthorFacingRunDetailLinkVariant = "activity" | "latest";
export type AuthorFacingWorkflowDetailLinkVariant = "chip" | "editor" | "recent" | "source";

const authorFacingRunDetailLinkLabels: Record<AuthorFacingRunDetailLinkVariant, string> = {
  activity: "查看 run 诊断面板",
  latest: "打开最新 run 诊断面板"
};

const authorFacingWorkflowDetailLinkLabels: Record<
  AuthorFacingWorkflowDetailLinkVariant,
  string
> = {
  chip: "打开 workflow 详情",
  editor: "回到 workflow 编辑器",
  recent: "打开最近 workflow",
  source: "打开源 workflow"
};

export type RunLibrarySurfaceCopy = {
  heroDescription: string;
  heroLinks: WorkbenchEntryLinksConfig;
  recentRunsDescription: string;
  emptyState: string;
  operatorEntryTitle: string;
  operatorEntryDescription: string;
  operatorEntryLinks: WorkbenchEntryLinksConfig;
};

export type WorkflowLibrarySurfaceCopy = {
  heroDescription: string;
  heroLinks: WorkbenchEntryLinksConfig;
  editorListDescription: string;
  emptyState: string;
  governanceDescription: string;
  nextStepTitle: string;
  nextStepDescription: string;
  nextStepLinks: WorkbenchEntryLinksConfig;
};

export type SensitiveAccessInboxSurfaceCopy = {
  heroDescription: string;
  heroLinks: WorkbenchEntryLinksConfig;
};

export type SensitiveAccessInboxEntryExecutionSurfaceCopy = {
  focusDescription: string;
  recommendedNextStepLabel: string;
  recommendedNextStepHref: string | null;
  recommendedNextStepHrefLabel: string | null;
  recommendedNextStepFallbackDetail: string;
};

export type RunDetailExecutionFocusSurfaceCopy = {
  recommendedNextStepFallbackDetail: string;
  focusedSkillTraceDescription: string;
};

export type RunDiagnosticsOperatorFollowUpSurfaceCopy = {
  description: string;
  callbackFallbackDetail: string;
};

export type WorkflowEditorHeroSurfaceCopy = {
  heroLinks: WorkbenchEntryLinksConfig;
  saveChainValue: string;
  plannedNodeBoundaryValue: string;
  governanceEntryValue: string;
  scopedGovernancePrefix: string;
  scopedGovernanceBackLinkLabel: string;
  scopedGovernanceInfix: string;
  scopedGovernanceCreateWorkflowLabel: string;
};

export type WorkflowEditorStarterSaveSurfaceCopy = {
  description: string;
  nextStepTitle: string;
  nextStepLinks: WorkbenchEntryLinksConfig;
};

export type WorkflowPublishPanelSurfaceCopy = {
  eyebrow: string;
  title: string;
  description: string;
  primaryFollowUpTitle: string;
  sandboxReadinessTitle: string;
  sandboxReadinessDescription: string;
  headerLinks: WorkbenchEntryLinksConfig;
  emptyStateDescription: string;
};

export type WorkflowCreateWizardSurfaceCopy = {
  heroLinks: WorkbenchEntryLinksConfig;
  recommendedNextStepTitle: string;
  createWorkflowRecommendedNextStepLabel: string;
  emptyStateDescription: string;
  emptyStateLinks: WorkbenchEntryLinksConfig;
  scopedGovernanceDescription: string;
  scopedGovernanceBackLinkLabel: string;
  sourceGovernanceDescription: string;
  sourceGovernanceFollowUpPrefix: string;
  sourceGovernanceFollowUpLinkLabel: string;
};

export type WorkspaceStarterGovernanceHeroSurfaceCopy = {
  heroDescription: string;
  heroLinks: WorkbenchEntryLinksConfig;
};

export type WorkspaceStarterTemplateListSurfaceCopy = {
  sectionDescription: string;
  sourceGovernanceMeta: string;
  followUpQueueLabel: string;
  followUpQueueMeta: string;
  emptyStateDescription: string;
  emptyStateLinks: WorkbenchEntryLinksConfig;
};

export function buildWorkspaceStarterGovernanceHeroSurfaceCopy({
  createWorkflowHref
}: {
  createWorkflowHref: string;
}): WorkspaceStarterGovernanceHeroSurfaceCopy {
  return {
    heroDescription:
      "这条链路专门承接 editor 保存出来的 workspace starter，让团队能按业务主线查看、筛选、校对和更新模板元数据，而不是继续把模板治理留在编辑器里的单个按钮。",
    heroLinks: {
      keys: ["createWorkflow", "home"],
      overrides: {
        createWorkflow: {
          href: createWorkflowHref,
          label: "返回创建页"
        }
      },
      primaryKey: "createWorkflow",
      variant: "inline"
    }
  };
}

export function buildWorkspaceStarterTemplateListSurfaceCopy({
  createWorkflowHref
}: {
  createWorkflowHref: string;
}): WorkspaceStarterTemplateListSurfaceCopy {
  return {
    sectionDescription:
      "先按主业务线和关键字收敛范围，再进入具体模板详情，避免 workspace starter library 只停留在“知道它存在”。",
    sourceGovernanceMeta:
      "source_governance_kind 直接映射后端治理契约，让列表筛选、summary 和 deep link 口径一致。",
    followUpQueueLabel: "仅显示需要 follow-up 的 starter",
    followUpQueueMeta:
      "needs_follow_up=true 当前只圈出来源漂移 / 来源缺失，便于 operator 直接处理治理热点。",
    emptyStateDescription:
      "当前筛选条件下还没有 workspace starter。可以先回到创建页新建 workflow，再从 editor 保存一个模板进入治理库。",
    emptyStateLinks: {
      keys: ["createWorkflow"],
      overrides: {
        createWorkflow: {
          href: createWorkflowHref,
          label: "去创建第一个 starter"
        }
      },
      primaryKey: "createWorkflow",
      variant: "inline"
    }
  };
}

export function buildRunLibrarySurfaceCopy({
  workflowLibraryHref = "/workflows"
}: {
  workflowLibraryHref?: string;
} = {}): RunLibrarySurfaceCopy {
  return {
    heroDescription:
      "首页和 operator 面板只保留摘要；从这里继续进入独立 run 诊断页、回到 workflow 编辑器，或沿着同一条执行事实继续排障。",
    heroLinks: {
      keys: ["operatorInbox", "workflowLibrary", "home"],
      overrides: {
        operatorInbox: {
          label: "回到 sensitive access inbox"
        },
        workflowLibrary: {
          href: workflowLibraryHref
        }
      }
    },
    recentRunsDescription:
      "这里直接复用 system overview 的最近执行摘要，避免 operator 从阻断收件箱跳出后落到不存在的 runs 路由。",
    emptyState: "当前还没有历史 run，可先从 workflow 编辑器触发一次执行。",
    operatorEntryTitle: "Operator follow-up",
    operatorEntryDescription:
      "如果当前阻断来自审批、恢复或通知派发，可以从 runs 列表回到 sensitive access inbox 继续处理 operator 动作。",
    operatorEntryLinks: {
      keys: ["operatorInbox", "workflowLibrary"],
      overrides: {
        operatorInbox: {
          label: "打开 sensitive access inbox"
        },
        workflowLibrary: {
          href: workflowLibraryHref
        }
      },
      primaryKey: "operatorInbox",
      variant: "inline"
    }
  };
}

export function buildAuthorFacingRunDetailLinkSurface({
  runId,
  runHref,
  variant = "activity"
}: {
  runId: string;
  runHref?: string | null;
  variant?: AuthorFacingRunDetailLinkVariant;
}): OperatorFollowUpLinkSurface {
  return buildRequiredOperatorRunDetailLinkSurface({
    runId,
    runHref,
    hrefLabel: authorFacingRunDetailLinkLabels[variant]
  });
}

export function buildAuthorFacingWorkflowDetailLinkSurface({
  workflowId,
  variant = "chip"
}: {
  workflowId: string;
  variant?: AuthorFacingWorkflowDetailLinkVariant;
}): OperatorFollowUpLinkSurface {
  return {
    href: buildWorkflowDetailHref(workflowId),
    label: authorFacingWorkflowDetailLinkLabels[variant]
  };
}

export function buildWorkflowLibrarySurfaceCopy({
  createWorkflowHref = "/workflows/new",
  workspaceStarterLibraryHref = "/workspace-starters"
}: {
  createWorkflowHref?: string;
  workspaceStarterLibraryHref?: string;
} = {}): WorkflowLibrarySurfaceCopy {
  return {
    heroDescription:
      "这里汇总可编辑 workflow、工具治理信号与下一步动作，避免从 sensitive access 或首页回链时落到不存在的 workflows 路由。",
    heroLinks: {
      keys: ["createWorkflow", "workspaceStarterLibrary", "runLibrary", "home"],
      overrides: {
        createWorkflow: {
          href: createWorkflowHref
        },
        workspaceStarterLibrary: {
          href: workspaceStarterLibraryHref
        }
      }
    },
    editorListDescription:
      "列表继续复用 editor chip 语义，优先暴露节点数、工具治理与强隔离信号，让作者与 operator 都能直接进入正确的 workflow 详情。",
    emptyState:
      "当前还没有可编辑的 workflow。现在可以从 workspace starter 或新建向导继续补主链，而不用再回退到 API 层手工创建。",
    governanceDescription:
      "workflow 列表不再只是跳板；它同时提示当前还有多少 workflow 需要继续处理 publish auth 清理、缺失工具、强隔离或运行 follow-up。",
    nextStepTitle: "继续推进主链",
    nextStepDescription:
      "如果还需要补 starter 来源治理或回到 operator 收件箱，可以从这里继续进入 workspace starter library 或 sensitive access inbox。",
    nextStepLinks: {
      keys: ["workspaceStarterLibrary", "operatorInbox", "runLibrary"],
      overrides: {
        workspaceStarterLibrary: {
          href: workspaceStarterLibraryHref,
          label: "打开 workspace starter library"
        },
        operatorInbox: {
          label: "打开 sensitive access inbox"
        }
      },
      primaryKey: "workspaceStarterLibrary",
      variant: "inline"
    }
  };
}

export function buildSensitiveAccessInboxSurfaceCopy(): SensitiveAccessInboxSurfaceCopy {
  return {
    heroDescription:
      "把 sensitive access request、approval ticket、notification dispatch 与 callback waiting lifecycle 放到同一条 operator 主链里，减少“看得到阻断但处理动作还要四处跳”的排障成本。",
    heroLinks: {
      keys: ["runLibrary", "workflowLibrary", "home"],
      overrides: {
        workflowLibrary: {
          label: "回到 workflow 列表"
        }
      }
    }
  };
}

export function buildSensitiveAccessInboxEntryExecutionSurfaceCopy({
  focusMatchesEntry,
  entryNodeRunId,
  focusNodeName,
  focusInboxHref,
  focusInboxHrefLabel,
  runId
}: {
  focusMatchesEntry: boolean;
  entryNodeRunId?: string | null;
  focusNodeName: string;
  focusInboxHref?: string | null;
  focusInboxHrefLabel?: string | null;
  runId: string;
}): SensitiveAccessInboxEntryExecutionSurfaceCopy {
  const runDetailLink = buildRequiredOperatorRunDetailLinkSurface({ runId });

  return {
    focusDescription: focusMatchesEntry
      ? "当前票据已经命中后端选出的 canonical blocker；优先按本条目上的 approval / callback follow-up 恢复即可。"
      : entryNodeRunId
        ? `当前票据关联 node run ${entryNodeRunId}，但当前 run 的 canonical blocker 已切到 ${focusNodeName}；建议先跳到该 focus 节点统一排障。`
        : `当前票据还没有稳定映射到具体 node run，但当前 run 的 canonical blocker 已定位到 ${focusNodeName}。`,
    recommendedNextStepLabel: focusMatchesEntry
      ? "current approval ticket"
      : focusInboxHref
        ? "focus node"
        : "run detail",
    recommendedNextStepHref: focusMatchesEntry ? null : focusInboxHref ?? runDetailLink.href,
    recommendedNextStepHrefLabel: focusMatchesEntry
      ? null
      : focusInboxHref
        ? focusInboxHrefLabel?.trim() || "slice to focus node"
        : runDetailLink.label,
    recommendedNextStepFallbackDetail: focusMatchesEntry
      ? "当前票据已命中 canonical blocker；优先处理本条审批，再确认 run 是否继续推进。"
      : focusInboxHref
        ? `当前 run 的 canonical blocker 已定位到 ${focusNodeName}；优先切到该 focus node 的 inbox slice 统一排障。`
        : "当前 run 已回接 canonical execution focus；优先打开 run 继续检查 focus node 和执行证据。"
  };
}

export function buildRunDetailExecutionFocusSurfaceCopy(): RunDetailExecutionFocusSurfaceCopy {
  return {
    recommendedNextStepFallbackDetail:
      "当前 run 已回接 canonical execution focus；优先继续检查 focus node、runtime evidence 和 execution fallback / blocking 原因。",
    focusedSkillTraceDescription:
      "当前 diagnostics / overlay 已直接消费 run detail 里的 execution focus skill trace，不必再等 execution view 才知道当前聚焦节点注入了哪些参考资料。"
  };
}

export function buildRunDiagnosticsOperatorFollowUpSurfaceCopy(): RunDiagnosticsOperatorFollowUpSurfaceCopy {
  return {
    description:
      "这里直接复用后端生成的 canonical operator snapshot，保证 run diagnostics 与 inbox / publish detail 看到的是同一组 execution focus、waiting 和 follow-up 事实。",
    callbackFallbackDetail:
      "优先回看当前 run detail 的 waiting / callback 事实，再决定是否介入操作。"
  };
}

export function buildWorkflowEditorHeroSurfaceCopy({
  workflowLibraryHref = "/workflows",
  createWorkflowHref,
  workspaceStarterLibraryHref,
  plannedNodeSummary
}: {
  workflowLibraryHref?: string;
  createWorkflowHref: string;
  workspaceStarterLibraryHref: string;
  plannedNodeSummary?: string | null;
}): WorkflowEditorHeroSurfaceCopy {
  return {
    heroLinks: {
      keys: ["workflowLibrary", "home", "createWorkflow", "workspaceStarterLibrary"],
      overrides: {
        workflowLibrary: {
          href: workflowLibraryHref,
          label: "回到 workflow 列表"
        },
        createWorkflow: {
          href: createWorkflowHref
        },
        workspaceStarterLibrary: {
          href: workspaceStarterLibraryHref
        }
      },
      primaryKey: "workflowLibrary",
      variant: "inline"
    },
    saveChainValue: "web canvas -> workflow definition -> API versioning",
    plannedNodeBoundaryValue: plannedNodeSummary
      ? `${plannedNodeSummary} 仍保持 planned；发布网关 / 调试联动继续推进`
      : "发布网关 / 调试联动继续推进",
    governanceEntryValue: "editor -> workspace starter library",
    scopedGovernancePrefix: "当前 editor 继续保留 workspace starter 治理页的 query scope；可以",
    scopedGovernanceBackLinkLabel: "回到治理页",
    scopedGovernanceInfix: "继续 follow-up，或在同一范围内",
    scopedGovernanceCreateWorkflowLabel: "再新建一个 workflow"
  };
}

export function buildWorkflowEditorStarterSaveSurfaceCopy({
  createWorkflowHref,
  workspaceStarterLibraryHref,
  hasScopedWorkspaceStarterFilters = false
}: {
  createWorkflowHref: string;
  workspaceStarterLibraryHref: string;
  hasScopedWorkspaceStarterFilters?: boolean;
}): WorkflowEditorStarterSaveSurfaceCopy {
  const heroSurfaceCopy = buildWorkflowEditorHeroSurfaceCopy({
    createWorkflowHref,
    workspaceStarterLibraryHref,
    plannedNodeSummary: null
  });
  const createWizardSurfaceCopy = buildWorkflowCreateWizardSurfaceCopy({
    starterGovernanceHref: workspaceStarterLibraryHref
  });

  return {
    description: hasScopedWorkspaceStarterFilters
      ? "这个保存结果继续复用当前 workspace starter 治理页的 query scope；优先回到治理页确认来源 follow-up，再在同一范围内创建 workflow 验证它已可复用。"
      : "这个保存结果已经写回 workspace starter library；创建页会直接复用最新 starter 元数据，不再要求作者手动回填治理上下文。",
    nextStepTitle: createWizardSurfaceCopy.recommendedNextStepTitle,
    nextStepLinks: {
      keys: ["workspaceStarterLibrary", "createWorkflow"],
      overrides: {
        workspaceStarterLibrary: {
          href: workspaceStarterLibraryHref,
          label: hasScopedWorkspaceStarterFilters
            ? heroSurfaceCopy.scopedGovernanceBackLinkLabel
            : createWizardSurfaceCopy.sourceGovernanceFollowUpLinkLabel
        },
        createWorkflow: {
          href: createWorkflowHref,
          label: hasScopedWorkspaceStarterFilters
            ? heroSurfaceCopy.scopedGovernanceCreateWorkflowLabel
            : createWizardSurfaceCopy.createWorkflowRecommendedNextStepLabel
        }
      },
      primaryKey: "workspaceStarterLibrary",
      variant: "inline"
    }
  };
}

export function buildWorkflowPublishPanelSurfaceCopy({
  workflowLibraryHref = "/workflows"
}: {
  workflowLibraryHref?: string;
} = {}): WorkflowPublishPanelSurfaceCopy {
  return {
    eyebrow: "Publish",
    title: "Endpoint governance",
    description:
      "工作流页现在直接消费 publish binding、activity、rate-limit window 与 cache inventory 事实层，不再让开放 API 能力只停留在后端可用、前端不可见。",
    primaryFollowUpTitle: "Primary follow-up",
    sandboxReadinessTitle: "Live sandbox readiness",
    sandboxReadinessDescription:
      "Publish summary 先直接对齐当前 live sandbox readiness；进入 invocation entry/detail 前，就能先判断强隔离 execution class 是已 ready、正在 degraded，还是仍会 fail-closed。",
    headerLinks: {
      keys: ["workflowLibrary", "runLibrary", "operatorInbox", "home"],
      overrides: {
        workflowLibrary: {
          href: workflowLibraryHref,
          label: "回到 workflow 列表"
        }
      },
      primaryKey: "workflowLibrary",
      variant: "inline"
    },
    emptyStateDescription:
      "当前 workflow definition 还没有声明 `publish`，因此没有可治理的开放 API endpoint。"
  };
}

export function buildWorkflowCreateWizardSurfaceCopy({
  starterGovernanceHref
}: {
  starterGovernanceHref: string;
}): WorkflowCreateWizardSurfaceCopy {
  const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();

  return {
    heroLinks: {
      keys: ["home", "workspaceStarterLibrary"],
      overrides: {
        workspaceStarterLibrary: {
          href: starterGovernanceHref
        }
      },
      primaryKey: "home",
      variant: "inline"
    },
    recommendedNextStepTitle: operatorSurfaceCopy.recommendedNextStepTitle,
    createWorkflowRecommendedNextStepLabel: "创建 workflow",
    emptyStateDescription:
      "这通常说明你是从 workspace starter 治理页带着 follow-up / 搜索条件回来，但当前范围里没有仍可直接创建的 active starter。",
    emptyStateLinks: {
      keys: ["workspaceStarterLibrary", "createWorkflow"],
      overrides: {
        workspaceStarterLibrary: {
          href: starterGovernanceHref,
          label: "回到治理页"
        },
        createWorkflow: {
          label: "清除筛选并查看全部 starter"
        }
      },
      primaryKey: "workspaceStarterLibrary",
      variant: "inline"
    },
    scopedGovernanceDescription:
      "当前 starter 列表正在复用 workspace starter 治理页的 query scope；命中过滤时只展示匹配的 workspace starter，避免 builtin starter 把 follow-up 范围冲淡。",
    scopedGovernanceBackLinkLabel: "回到治理页",
    sourceGovernanceDescription:
      "创建页现在直接复用 workspace starter 的来源治理 follow-up，不再要求 operator / AI 先跳回模板库自己拼装“是否漂移、下一步做什么”。",
    sourceGovernanceFollowUpPrefix:
      "需要补 refresh / rebase 或排查来源缺失时，直接去",
    sourceGovernanceFollowUpLinkLabel: "管理这个 workspace starter"
  };
}
