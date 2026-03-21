import {
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

export type WorkflowPublishPanelSurfaceCopy = {
  description: string;
  headerLinks: WorkbenchEntryLinksConfig;
  emptyStateDescription: string;
};

export type WorkflowCreateWizardSurfaceCopy = {
  heroLinks: WorkbenchEntryLinksConfig;
  emptyStateDescription: string;
  emptyStateLinks: WorkbenchEntryLinksConfig;
  scopedGovernanceDescription: string;
  scopedGovernanceBackLinkLabel: string;
  sourceGovernanceDescription: string;
  sourceGovernanceFollowUpPrefix: string;
  sourceGovernanceFollowUpLinkLabel: string;
};

export function buildRunLibrarySurfaceCopy(): RunLibrarySurfaceCopy {
  return {
    heroDescription:
      "首页和 operator 面板只保留摘要；从这里继续进入独立 run 诊断页、回到 workflow 编辑器，或沿着同一条执行事实继续排障。",
    heroLinks: {
      keys: ["operatorInbox", "workflowLibrary", "home"],
      overrides: {
        operatorInbox: {
          label: "回到 sensitive access inbox"
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
        }
      },
      primaryKey: "operatorInbox",
      variant: "inline"
    }
  };
}

export function buildAuthorFacingRunDetailLinkSurface({
  runId,
  variant = "activity"
}: {
  runId: string;
  variant?: AuthorFacingRunDetailLinkVariant;
}): OperatorFollowUpLinkSurface {
  return buildRequiredOperatorRunDetailLinkSurface({
    runId,
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

export function buildWorkflowLibrarySurfaceCopy(): WorkflowLibrarySurfaceCopy {
  return {
    heroDescription:
      "这里汇总可编辑 workflow、工具治理信号与下一步动作，避免从 sensitive access 或首页回链时落到不存在的 workflows 路由。",
    heroLinks: {
      keys: ["createWorkflow", "workspaceStarterLibrary", "runLibrary", "home"]
    },
    editorListDescription:
      "列表继续复用 editor chip 语义，优先暴露节点数、工具治理与强隔离信号，让作者与 operator 都能直接进入正确的 workflow 详情。",
    emptyState:
      "当前还没有可编辑的 workflow。现在可以从 workspace starter 或新建向导继续补主链，而不用再回退到 API 层手工创建。",
    governanceDescription:
      "workflow 列表不再只是跳板；它同时提示当前还有多少 workflow 需要继续处理缺失工具、强隔离或运行 follow-up。",
    nextStepTitle: "继续推进主链",
    nextStepDescription:
      "如果还需要补 starter 来源治理或回到 operator 收件箱，可以从这里继续进入 workspace starter library 或 sensitive access inbox。",
    nextStepLinks: {
      keys: ["workspaceStarterLibrary", "operatorInbox", "runLibrary"],
      overrides: {
        workspaceStarterLibrary: {
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
  runId
}: {
  focusMatchesEntry: boolean;
  entryNodeRunId?: string | null;
  focusNodeName: string;
  focusInboxHref?: string | null;
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
        ? "slice to focus node"
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
  createWorkflowHref,
  workspaceStarterLibraryHref,
  plannedNodeSummary
}: {
  createWorkflowHref: string;
  workspaceStarterLibraryHref: string;
  plannedNodeSummary?: string | null;
}): WorkflowEditorHeroSurfaceCopy {
  return {
    heroLinks: {
      keys: ["workflowLibrary", "home", "createWorkflow", "workspaceStarterLibrary"],
      overrides: {
        workflowLibrary: {
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

export function buildWorkflowPublishPanelSurfaceCopy(): WorkflowPublishPanelSurfaceCopy {
  return {
    description:
      "工作流页现在直接消费 publish binding、activity、rate-limit window 与 cache inventory 事实层，不再让开放 API 能力只停留在后端可用、前端不可见。",
    headerLinks: {
      keys: ["workflowLibrary", "runLibrary", "operatorInbox", "home"],
      overrides: {
        workflowLibrary: {
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
