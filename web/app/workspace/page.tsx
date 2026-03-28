import { redirect } from "next/navigation";

import { WorkspaceAppsWorkbench } from "@/components/workspace-apps-workbench";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getSystemOverview } from "@/lib/get-system-overview";
import { getWorkflowDetail, getWorkflows } from "@/lib/get-workflows";
import {
  getWorkspaceAppModeMeta,
  inferWorkspaceAppMode,
  isWorkspaceAppModeId,
  listWorkspaceAppModes,
  type WorkspaceAppModeId
} from "@/lib/workspace-app-modes";
import { getWorkflowLibrarySnapshot } from "@/lib/get-workflow-library";
import {
  getWorkflowBusinessTrack,
  WORKFLOW_BUSINESS_TRACKS,
  type WorkflowBusinessTrack
} from "@/lib/workflow-business-tracks";
import { inferWorkflowBusinessTrack } from "@/lib/workflow-starters";
import { getServerWorkspaceContext } from "@/lib/server-workspace-access";
import { formatWorkspaceRole } from "@/lib/workspace-access";

type WorkspacePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type WorkspaceFilterKey = "all" | "draft" | "published" | "follow_up";

type WorkspaceAppCard = {
  id: string;
  name: string;
  href: string;
  status: string;
  healthLabel: string;
  mode: ReturnType<typeof getWorkspaceAppModeMeta>;
  recommendedNextStep: string;
  track: ReturnType<typeof getWorkflowBusinessTrack>;
  nodeCount: number;
  publishCount: number;
  updatedAt: string;
  missingToolCount: number;
  followUpCount: number;
};

function readSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return "";
}

function buildWorkspaceHref(options: {
  filter?: WorkspaceFilterKey;
  mode?: WorkspaceAppModeId;
  track?: string;
  keyword?: string;
}) {
  const searchParams = new URLSearchParams();

  if (options.filter && options.filter !== "all") {
    searchParams.set("filter", options.filter);
  }
  if (options.mode && options.mode !== "all") {
    searchParams.set("mode", options.mode);
  }
  if (options.track && options.track !== "all") {
    searchParams.set("track", options.track);
  }
  if (options.keyword && options.keyword.trim()) {
    searchParams.set("keyword", options.keyword.trim());
  }

  const query = searchParams.toString();
  return query ? `/workspace?${query}` : "/workspace";
}

function buildWorkflowStarterCreateHref(starterId: string) {
  return `/workflows/new?starter=${encodeURIComponent(starterId)}`;
}

export default async function WorkspacePage({ searchParams }: WorkspacePageProps) {
  const workspaceContext = await getServerWorkspaceContext();
  if (!workspaceContext) {
    redirect("/login?next=/workspace");
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const requestedFilter = readSearchParam(resolvedSearchParams, "filter");
  const requestedMode = readSearchParam(resolvedSearchParams, "mode");
  const requestedTrack = readSearchParam(resolvedSearchParams, "track");
  const requestedKeyword = readSearchParam(resolvedSearchParams, "keyword").trim();
  const activeFilter: WorkspaceFilterKey =
    requestedFilter === "draft" ||
    requestedFilter === "published" ||
    requestedFilter === "follow_up"
      ? requestedFilter
      : "all";
  const activeMode: WorkspaceAppModeId = isWorkspaceAppModeId(requestedMode)
    ? requestedMode
    : "all";
  const activeTrack: WorkflowBusinessTrack | "all" =
    requestedTrack && WORKFLOW_BUSINESS_TRACKS.some((track) => track.id === requestedTrack)
      ? (requestedTrack as WorkflowBusinessTrack)
      : "all";
  const normalizedKeyword = requestedKeyword.toLowerCase();

  const [workflowSummaries, workflowLibrary, systemOverview] = await Promise.all([
    getWorkflows(),
    getWorkflowLibrarySnapshot(),
    getSystemOverview()
  ]);
  const workflowDetails = (
    await Promise.all(workflowSummaries.map((workflow) => getWorkflowDetail(workflow.id)))
  ).filter((workflow): workflow is NonNullable<typeof workflow> => Boolean(workflow));

  const appCards: WorkspaceAppCard[] = workflowDetails.map((workflow) => {
    const mode = getWorkspaceAppModeMeta(inferWorkspaceAppMode(workflow.definition));
    const track = getWorkflowBusinessTrack(inferWorkflowBusinessTrack(workflow.definition));
    const publishCount = Array.isArray(workflow.definition.publish)
      ? workflow.definition.publish.length
      : 0;
    const missingToolCount = workflow.tool_governance.missing_tool_ids.length;
    const followUpCount = missingToolCount + (workflow.definition_issues?.length ?? 0);
    const healthLabel =
      followUpCount > 0
        ? `${followUpCount} 个治理待办`
        : workflow.status === "published"
          ? "可调用"
          : "草稿可继续编排";

    return {
      id: workflow.id,
      name: workflow.name,
      href: `/workflows/${encodeURIComponent(workflow.id)}`,
      status: workflow.status,
      healthLabel,
      mode,
      recommendedNextStep:
        missingToolCount > 0
          ? `先补齐 ${missingToolCount} 个工具缺口，再进入 xyflow 继续编排。`
          : workflow.status === "published"
            ? "继续在 xyflow 维护版本，必要时从运行诊断核对线上调用。"
            : "继续在 xyflow 完成节点配置、上下文授权和发布准备。",
      track,
      nodeCount: workflow.node_count,
      publishCount,
      updatedAt: workflow.updated_at,
      missingToolCount,
      followUpCount
    };
  });

  const filteredApps = appCards.filter((card) => {
    const matchesMode = activeMode === "all" || card.mode.id === activeMode;
    const matchesStatus =
      activeFilter === "draft"
        ? card.status !== "published"
        : activeFilter === "published"
          ? card.status === "published"
          : activeFilter === "follow_up"
            ? card.followUpCount > 0
            : true;

    const matchesTrack = activeTrack === "all" || card.track.id === activeTrack;
    const matchesKeyword =
      !normalizedKeyword ||
      [card.name, card.mode.label, card.track.id, card.track.summary, card.track.focus].some((value) =>
        value.toLowerCase().includes(normalizedKeyword)
      );

    return matchesMode && matchesStatus && matchesTrack && matchesKeyword;
  });

  const filterItems = [
    { key: "all", label: `全部 ${appCards.length}` },
    {
      key: "draft",
      label: `草稿 ${appCards.filter((card) => card.status !== "published").length}`
    },
    {
      key: "published",
      label: `已发布 ${appCards.filter((card) => card.status === "published").length}`
    },
    {
      key: "follow_up",
      label: `待治理 ${appCards.filter((card) => card.followUpCount > 0).length}`
    }
  ];
  const modeItems = [
    {
      key: "all" as WorkspaceAppModeId,
      label: "全部",
      count: appCards.length,
      description: "像 Dify 一样先按应用类型收敛入口，再进入 7Flows 的 xyflow 编排。"
    },
    ...listWorkspaceAppModes().map((mode) => ({
      key: mode.id,
      label: mode.label,
      count: appCards.filter((card) => card.mode.id === mode.id).length,
      description: mode.description
    }))
  ];
  const activeModeMeta = activeMode === "all" ? null : getWorkspaceAppModeMeta(activeMode);
  const workspaceSignals = [
    { label: "应用", value: String(appCards.length) },
    {
      label: "草稿",
      value: String(appCards.filter((card) => card.status !== "published").length)
    },
    {
      label: "已发布",
      value: String(appCards.filter((card) => card.status === "published").length)
    },
    {
      label: "待治理",
      value: String(appCards.filter((card) => card.followUpCount > 0).length)
    },
    {
      label: "Sandbox",
      value: systemOverview.sandbox_readiness.primary_blocker_kind ? "需处理" : "正常"
    }
  ];
  const starterHighlights = workflowLibrary.starters
    .filter((starter) => activeMode === "all" || inferWorkspaceAppMode(starter.definition) === activeMode)
    .slice(0, 3)
    .map((starter) => ({
      id: starter.id,
      name: starter.name,
      description: starter.description,
      href: buildWorkflowStarterCreateHref(starter.id),
      track: starter.businessTrack,
      priority: getWorkflowBusinessTrack(starter.businessTrack).priority,
      mode: getWorkspaceAppModeMeta(inferWorkspaceAppMode(starter.definition))
    }));
  const visibleAppSummary =
    activeMode !== "all"
      ? `${activeModeMeta?.label ?? "应用"} ${filteredApps.length} 个`
      : filteredApps.length === appCards.length
      ? `全部 ${filteredApps.length} 个应用`
      : `筛选结果 ${filteredApps.length} / ${appCards.length}`;
  const primaryCreateEntry =
    activeMode === "agent"
      ? {
          title: "新建 Agent 草稿",
          detail: `${activeModeMeta?.description ?? "继续补 Agent 节点配置。"} 创建后继续进入 xyflow。`,
          href: "/workflows/new?starter=agent",
          badge: activeModeMeta?.shortLabel ?? "Agent"
        }
      : activeMode === "tool_agent"
        ? {
            title: "新建 Tool Agent",
            detail: `${activeModeMeta?.description ?? "继续补工具调用链。"} 创建后继续进入 xyflow。`,
            href: "/workflows/new?starter=tool-enabled-agent",
            badge: activeModeMeta?.shortLabel ?? "工具 Agent"
          }
        : activeMode === "sandbox"
          ? {
              title: "新建 Sandbox Flow",
              detail: `${activeModeMeta?.description ?? "继续补沙盒执行链路。"} 创建后继续进入 xyflow。`,
              href: "/workflows/new?starter=sandbox-code",
              badge: activeModeMeta?.shortLabel ?? "Sandbox"
            }
          : {
              title: "新建空白 ChatFlow",
              detail: "直接生成最小 workflow 草稿，创建后继续进入 xyflow。",
              href: "/workflows/new",
              badge: "Blank Flow"
            };
  const quickCreateEntries = [
    primaryCreateEntry,
    {
      title: "从应用模板创建",
      detail: "先按 starter 业务轨道挑入口，再把草稿送进画布。",
      href: "/workspace-starters",
      badge: `${workflowLibrary.starters.length} 个 Starter`
    },
    workspaceContext.can_manage_members
      ? {
          title: "管理成员与权限",
          detail: "管理员可直接开通成员账号，并在工作空间里完成角色配置。",
          href: "/admin/members",
          badge: `${workspaceContext.available_roles.length} 种角色`
        }
      : {
          title: "查看运行诊断",
          detail: "没有成员管理权限时，优先从 runs 追踪运行状态与治理阻塞。",
          href: "/runs",
          badge: `${systemOverview.runtime_activity.summary.recent_run_count} 条运行`
        }
  ];

  const modeTabs = modeItems.map((modeItem) => ({
    ...modeItem,
    active: modeItem.key === activeMode,
    href: buildWorkspaceHref({
      filter: activeFilter,
      mode: modeItem.key,
      track: activeTrack,
      keyword: requestedKeyword
    })
  }));
  const statusFilters = filterItems.map((filterItem) => ({
    ...filterItem,
    active: filterItem.key === activeFilter,
    href: buildWorkspaceHref({
      filter: filterItem.key as WorkspaceFilterKey,
      mode: activeMode,
      track: activeTrack,
      keyword: requestedKeyword
    })
  }));
  const searchState = {
    filter: activeFilter === "all" ? null : activeFilter,
    mode: activeMode === "all" ? null : activeMode,
    track: activeTrack === "all" ? null : activeTrack,
    clearHref: requestedKeyword
      ? buildWorkspaceHref({ filter: activeFilter, mode: activeMode, track: activeTrack })
      : null
  };
  const activeTrackMeta = activeTrack === "all" ? null : getWorkflowBusinessTrack(activeTrack);
  const scopePills = [
    ...(activeTrackMeta
      ? [
          {
            key: "track",
            label: "业务焦点",
            value: `${activeTrackMeta.priority} ${activeTrack}`,
            href: buildWorkspaceHref({
              filter: activeFilter,
              mode: activeMode,
              keyword: requestedKeyword
            })
          }
        ]
      : []),
    ...(requestedKeyword
      ? [
          {
            key: "keyword",
            label: "关键词",
            value: requestedKeyword,
            href: buildWorkspaceHref({
              filter: activeFilter,
              mode: activeMode,
              track: activeTrack
            })
          }
        ]
      : [])
  ];
  const starterWorkBenchHighlights = starterHighlights.map((starter) => ({
    ...starter,
    modeShortLabel: starter.mode.shortLabel
  }));
  const currentRoleLabel = formatWorkspaceRole(workspaceContext.current_member.role);
  const activeModeDescription =
    activeMode === "all"
      ? "像 Dify 一样先按应用类型收敛入口，再进入 7Flows 的 xyflow 编排。"
      : activeModeMeta?.description ?? "当前应用入口会继续回到 xyflow 事实源。";

  return (
    <WorkspaceShell
      activeNav="workspace"
      userName={workspaceContext.current_user.display_name}
      userRole={workspaceContext.current_member.role}
      workspaceName={workspaceContext.workspace.name}
    >
      <WorkspaceAppsWorkbench
        activeModeDescription={activeModeDescription}
        activeModeLabel={activeModeMeta?.label ?? null}
        currentRoleLabel={currentRoleLabel}
        currentUserDisplayName={workspaceContext.current_user.display_name}
        filteredApps={filteredApps}
        modeTabs={modeTabs}
        quickCreateEntries={quickCreateEntries}
        requestedKeyword={requestedKeyword}
        searchState={searchState}
        scopePills={scopePills}
        starterCount={workflowLibrary.starters.length}
        starterHighlights={starterWorkBenchHighlights}
        statusFilters={statusFilters}
        visibleAppSummary={visibleAppSummary}
        workspaceName={workspaceContext.workspace.name}
        workspaceSignals={workspaceSignals}
      />
    </WorkspaceShell>
  );
}
