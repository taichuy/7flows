import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { WorkflowApiSurface } from "@/components/workflow-api-surface";
import { WorkflowStudioLayoutShell } from "@/components/workflow-studio-layout-shell";
import { WorkflowLogsSurface } from "@/components/workflow-logs-surface";
import { WorkflowMonitorSurface } from "@/components/workflow-monitor-surface";
import { WorkflowPublishPanel } from "@/components/workflow-publish-panel";
import { WorkflowStudioSidebar } from "@/components/workflow-studio-sidebar";
import { loadWorkflowEditorWorkbenchBootstrap } from "@/components/workflow-editor-workbench/bootstrap";
import { WorkflowEditorWorkbenchEntry } from "@/components/workflow-editor-workbench-entry";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getSystemOverview } from "@/lib/get-system-overview";
import {
  getPluginRegistrySnapshot,
  type PluginToolRegistryItem
} from "@/lib/get-plugin-registry";
import { getWorkflowPublishGovernanceSnapshot } from "@/lib/get-workflow-publish-governance";
import {
  getServerPublishedEndpointInvocationDetail,
  getServerRunDetail,
  getServerRunEvidenceView,
  getServerRunExecutionView,
  getServerWorkflowDetail,
  getServerWorkflowPublishedEndpoints,
  getServerWorkflowRuns,
  requireServerWorkflowStudioSurfaceAccess
} from "@/lib/server-workspace-access";
import {
  readWorkflowApiSampleInvocationQueryScope,
  WORKFLOW_API_SAMPLE_QUERY_KEYS
} from "@/lib/workflow-api-surface";
import {
  readWorkflowLogsRequestedRunId,
  selectWorkflowLogsInvocation,
  selectWorkflowLogsRun
} from "@/lib/workflow-logs-surface";
import {
  appendWorkflowLibraryViewState,
  readWorkflowLibraryViewState
} from "@/lib/workflow-library-query";
import {
  readWorkflowPublishActivityQueryScope,
  resolveWorkflowPublishActivityFilters
} from "@/lib/workflow-publish-activity-query";
import {
  buildWorkspaceToolsHref,
  buildRunDetailHref,
  buildWorkflowStudioSurfaceHref,
  getWorkflowStudioSurfaceDefinition,
  getWorkflowStudioSurfaceDefinitions,
  type WorkflowStudioSurface
} from "@/lib/workbench-links";
import {
  buildWorkflowCreateHrefFromWorkspaceStarterViewState,
  buildWorkflowEditorHrefFromWorkspaceStarterViewState,
  buildWorkflowLibraryHrefFromWorkspaceStarterViewState,
  buildWorkflowPublishHrefFromWorkspaceStarterViewState,
  buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState,
  hasScopedWorkspaceStarterGovernanceFilters,
  pickWorkspaceStarterGovernanceQueryScope,
  readWorkspaceStarterLibraryViewState
} from "@/lib/workspace-starter-governance-query";
import type { WorkspaceMemberRole } from "@/lib/workspace-access";

export type WorkflowStudioPageProps = {
  params: Promise<{ workflowId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type WorkflowStudioSharedContext = {
  workspaceName: string;
  userName: string;
  userRole: WorkspaceMemberRole;
  workflow: NonNullable<Awaited<ReturnType<typeof getServerWorkflowDetail>>>;
  workflowStageLabel: string;
  resolvedSearchParams: Record<string, string | string[] | undefined>;
  workflowLibraryHref: string;
  createWorkflowHref: string;
  surfaceHrefs: Record<WorkflowStudioSurface, string>;
  toolsHref: string;
  currentEditorHref: string;
  currentPublishHref: string;
  workspaceStarterLibraryHref: string;
  workspaceStarterGovernanceQueryScope: ReturnType<
    typeof pickWorkspaceStarterGovernanceQueryScope
  >;
  hasScopedWorkspaceStarterFilters: boolean;
};

type WorkflowStudioShellProps = {
  workflowId: string;
  workspaceName: string;
  userName: string;
  userRole: WorkspaceMemberRole;
  workflowName: string;
  workflowVersion: string;
  workflowStageLabel: string;
  workflowLibraryHref: string;
  activeStudioSurface: WorkflowStudioSurface;
  surfaceHrefs: Record<WorkflowStudioSurface, string>;
  toolsHref: string;
  workspaceStarterLibraryHref: string;
  children: ReactNode;
};

export async function generateWorkflowStudioMetadata({
  params
}: WorkflowStudioPageProps): Promise<Metadata> {
  const { workflowId } = await params;

  return {
    title: `Workflow ${workflowId} | 7Flows Studio`
  };
}

export async function buildLegacyWorkflowStudioSurfaceRedirectHref({
  params,
  searchParams
}: WorkflowStudioPageProps) {
  const { workflowId } = await params;
  const resolvedSearchParams = await searchParams;
  const activeStudioSurface = readWorkflowStudioSurface(resolvedSearchParams.surface);

  return appendSearchParamsToHref(
    buildWorkflowStudioSurfaceHref(workflowId, activeStudioSurface),
    buildWorkflowStudioSearchParams(resolvedSearchParams, { omitKeys: ["surface"] })
  );
}

export async function renderWorkflowStudioPage({
  params,
  searchParams,
  surface
}: WorkflowStudioPageProps & {
  surface: WorkflowStudioSurface;
}) {
  const sharedContext = await resolveWorkflowStudioSharedContext({
    params,
    searchParams,
    surface
  });

  if (surface === "editor") {
    return renderWorkflowEditorSurface(sharedContext);
  }

  if (surface === "publish") {
    return renderWorkflowPublishSurface(sharedContext);
  }

  return renderWorkflowUtilitySurface(sharedContext, surface);
}

export function readWorkflowStudioSurface(
  value: string | string[] | undefined
): WorkflowStudioSurface {
  const resolvedValue = Array.isArray(value) ? value[0] : value;
  return getWorkflowStudioSurfaceDefinitions().some((item) => item.key === resolvedValue)
    ? (resolvedValue as WorkflowStudioSurface)
    : "editor";
}

async function resolveWorkflowStudioSharedContext({
  params,
  searchParams,
  surface
}: WorkflowStudioPageProps & {
  surface: WorkflowStudioSurface;
}): Promise<WorkflowStudioSharedContext> {
  const { workflowId } = await params;
  const resolvedSearchParams = await searchParams;
  const requestedSurfaceHref = appendSearchParamsToHref(
    buildWorkflowStudioSurfaceHref(workflowId, surface),
    buildWorkflowStudioSearchParams(resolvedSearchParams, { omitKeys: ["surface"] })
  );
  const workspaceContext = await requireServerWorkflowStudioSurfaceAccess({
    surface,
    requestedHref: requestedSurfaceHref
  });
  const workflow = await getServerWorkflowDetail(workflowId);

  if (!workflow) {
    notFound();
  }

  const workspaceStarterViewState = readWorkspaceStarterLibraryViewState(
    resolvedSearchParams
  );
  const workflowLibraryViewState = readWorkflowLibraryViewState(resolvedSearchParams);
  const workflowLibraryHref = appendWorkflowLibraryViewState(
    buildWorkflowLibraryHrefFromWorkspaceStarterViewState(workspaceStarterViewState),
    workflowLibraryViewState
  );
  const createWorkflowHref = buildWorkflowCreateHrefFromWorkspaceStarterViewState(
    workspaceStarterViewState
  );
  const editorSurfaceHref = appendWorkflowLibraryViewState(
    buildWorkflowEditorHrefFromWorkspaceStarterViewState(
      workflow.id,
      workspaceStarterViewState
    ),
    workflowLibraryViewState
  );
  const publishSurfaceHref = appendWorkflowLibraryViewState(
    buildWorkflowPublishHrefFromWorkspaceStarterViewState(
      workflow.id,
      workspaceStarterViewState
    ),
    workflowLibraryViewState
  );
  const surfaceSearchParams = buildWorkflowStudioSearchParams(resolvedSearchParams, {
    omitKeys: ["surface"]
  });
  const surfaceHrefs = Object.fromEntries(
    getWorkflowStudioSurfaceDefinitions().map((item) => [
      item.key,
      appendSearchParamsToHref(
        buildWorkflowStudioSurfaceHref(workflow.id, item.key),
        surfaceSearchParams
      )
    ])
  ) as Record<WorkflowStudioSurface, string>;
  const currentEditorHref = appendSearchParamsToHref(
    buildWorkflowStudioSurfaceHref(workflow.id, "editor"),
    surfaceSearchParams
  );
  const currentSurfaceHref = appendSearchParamsToHref(
    buildWorkflowStudioSurfaceHref(workflow.id, surface),
    surfaceSearchParams
  );
  const currentPublishHref = appendSearchParamsToHref(
    buildWorkflowStudioSurfaceHref(workflow.id, "publish"),
    surfaceSearchParams
  );
  const toolsHref = buildWorkspaceToolsHref({
    returnHref: currentSurfaceHref,
    workflowId: workflow.id,
    workflowSurface: surface
  });
  const workspaceStarterLibraryHref =
    buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState(
      workspaceStarterViewState
    );
  const workspaceStarterGovernanceQueryScope = pickWorkspaceStarterGovernanceQueryScope(
    workspaceStarterViewState
  );
  const hasScopedWorkspaceStarterFilters = hasScopedWorkspaceStarterGovernanceFilters(
    workspaceStarterViewState
  );

  return {
    workspaceName: workspaceContext.workspace.name,
    userName: workspaceContext.current_user.display_name,
    userRole: workspaceContext.current_member.role,
    workflow,
    workflowStageLabel:
      typeof workflow.publish_count === "number" && workflow.publish_count > 0
        ? "publish ready"
        : "draft only",
    resolvedSearchParams,
    workflowLibraryHref,
    createWorkflowHref,
    surfaceHrefs: {
      ...surfaceHrefs,
      editor: editorSurfaceHref,
      publish: publishSurfaceHref
    },
    toolsHref,
    currentEditorHref,
    currentPublishHref,
    workspaceStarterLibraryHref,
    workspaceStarterGovernanceQueryScope,
    hasScopedWorkspaceStarterFilters
  };
}

async function renderWorkflowEditorSurface(sharedContext: WorkflowStudioSharedContext) {
  const bootstrapRequest = {
    workflowId: sharedContext.workflow.id,
    surface: "editor" as const
  };
  const initialBootstrapData = await loadWorkflowEditorWorkbenchBootstrap(bootstrapRequest);

  return (
    <WorkflowStudioShell
      workflowId={sharedContext.workflow.id}
      workspaceName={sharedContext.workspaceName}
      userName={sharedContext.userName}
      userRole={sharedContext.userRole}
      workflowName={sharedContext.workflow.name}
      workflowVersion={sharedContext.workflow.version}
      workflowStageLabel={sharedContext.workflowStageLabel}
      workflowLibraryHref={sharedContext.workflowLibraryHref}
      activeStudioSurface="editor"
      surfaceHrefs={sharedContext.surfaceHrefs}
      toolsHref={sharedContext.toolsHref}
      workspaceStarterLibraryHref={sharedContext.workspaceStarterLibraryHref}
    >
      <section className="workflow-studio-surface" data-surface="editor">
        <WorkflowEditorWorkbenchEntry
          bootstrapRequest={bootstrapRequest}
          initialBootstrapData={initialBootstrapData}
          workflow={sharedContext.workflow}
          currentEditorHref={sharedContext.currentEditorHref}
          workflowLibraryHref={sharedContext.workflowLibraryHref}
          createWorkflowHref={sharedContext.createWorkflowHref}
          workspaceStarterLibraryHref={sharedContext.workspaceStarterLibraryHref}
          hasScopedWorkspaceStarterFilters={sharedContext.hasScopedWorkspaceStarterFilters}
          workspaceStarterGovernanceQueryScope={
            sharedContext.workspaceStarterGovernanceQueryScope
          }
        />
      </section>
    </WorkflowStudioShell>
  );
}

async function renderWorkflowPublishSurface(sharedContext: WorkflowStudioSharedContext) {
  const publishedEndpoints = await getServerWorkflowPublishedEndpoints(
    sharedContext.workflow.id,
    {
      includeAllVersions: true
    }
  );
  const workflowStageLabel =
    publishedEndpoints.length > 0 ? "publish ready" : sharedContext.workflowStageLabel;
  const publishActivityQueryScope = readWorkflowPublishActivityQueryScope(
    sharedContext.resolvedSearchParams
  );
  const publishActivityFilters = resolveWorkflowPublishActivityFilters(
    publishActivityQueryScope,
    publishedEndpoints
  );
  const expandedBindingId = publishActivityFilters.governanceFetchFilter?.bindingId ?? null;
  const expandedBindings = expandedBindingId
    ? publishedEndpoints.filter((binding) => binding.id === expandedBindingId)
    : [];

  let tools: PluginToolRegistryItem[] = [];
  let callbackWaitingAutomation = null;
  let sandboxReadiness = null;
  let governanceSnapshot = {
    cacheInventories: {},
    apiKeysByBinding: {},
    invocationAuditsByBinding: {},
    invocationDetailsByBinding: {},
    rateLimitWindowAuditsByBinding: {}
  };

  if (expandedBindings.length > 0) {
    const [pluginRegistry, systemOverview, nextGovernanceSnapshot] = await Promise.all([
      getPluginRegistrySnapshot(),
      getSystemOverview(),
      getWorkflowPublishGovernanceSnapshot(sharedContext.workflow.id, expandedBindings, {
        activeInvocationFilter: publishActivityFilters.governanceFetchFilter
      })
    ]);

    tools = pluginRegistry.tools;
    callbackWaitingAutomation = systemOverview.callback_waiting_automation;
    sandboxReadiness = systemOverview.sandbox_readiness;
    governanceSnapshot = nextGovernanceSnapshot;
  }

  const {
    cacheInventories,
    apiKeysByBinding,
    invocationAuditsByBinding,
    invocationDetailsByBinding,
    rateLimitWindowAuditsByBinding
  } = governanceSnapshot;

  return (
    <WorkflowStudioShell
      workflowId={sharedContext.workflow.id}
      workspaceName={sharedContext.workspaceName}
      userName={sharedContext.userName}
      userRole={sharedContext.userRole}
      workflowName={sharedContext.workflow.name}
      workflowVersion={sharedContext.workflow.version}
      workflowStageLabel={workflowStageLabel}
      workflowLibraryHref={sharedContext.workflowLibraryHref}
      activeStudioSurface="publish"
      surfaceHrefs={sharedContext.surfaceHrefs}
      toolsHref={sharedContext.toolsHref}
      workspaceStarterLibraryHref={sharedContext.workspaceStarterLibraryHref}
    >
      <section
        className="workflow-studio-surface workflow-studio-surface-governance"
        data-surface="publish"
      >
        <WorkflowPublishPanel
          workflow={sharedContext.workflow}
          tools={tools}
          bindings={publishedEndpoints}
          cacheInventories={cacheInventories}
          apiKeysByBinding={apiKeysByBinding}
          invocationAuditsByBinding={invocationAuditsByBinding}
          invocationDetailsByBinding={invocationDetailsByBinding}
          selectedInvocationId={publishActivityFilters.selectedInvocationId}
          rateLimitWindowAuditsByBinding={rateLimitWindowAuditsByBinding}
          callbackWaitingAutomation={callbackWaitingAutomation}
          sandboxReadiness={sandboxReadiness}
          activeInvocationFilter={publishActivityFilters.panelActiveFilter}
          expandedBindingId={expandedBindingId}
          workflowLibraryHref={sharedContext.workflowLibraryHref}
          currentHref={sharedContext.currentPublishHref}
          workspaceStarterGovernanceQueryScope={
            sharedContext.workspaceStarterGovernanceQueryScope
          }
        />
      </section>
    </WorkflowStudioShell>
  );
}

async function renderWorkflowUtilitySurface(
  sharedContext: WorkflowStudioSharedContext,
  surface: Exclude<WorkflowStudioSurface, "editor" | "publish">
) {
  if (surface === "api") {
    const bindings = await getServerWorkflowPublishedEndpoints(sharedContext.workflow.id, {
      includeAllVersions: true
    });
    const apiSampleQueryScope = readWorkflowApiSampleInvocationQueryScope(
      sharedContext.resolvedSearchParams
    );
    const apiSearchParams = buildWorkflowStudioSearchParams(sharedContext.resolvedSearchParams, {
      omitKeys: ["surface", ...WORKFLOW_API_SAMPLE_QUERY_KEYS]
    });
    const canonicalApiHref = appendSearchParamsToHref(
      buildWorkflowStudioSurfaceHref(sharedContext.workflow.id, "api"),
      apiSearchParams
    );

    return (
      <WorkflowStudioShell
        workflowId={sharedContext.workflow.id}
        workspaceName={sharedContext.workspaceName}
        userName={sharedContext.userName}
        userRole={sharedContext.userRole}
        workflowName={sharedContext.workflow.name}
        workflowVersion={sharedContext.workflow.version}
        workflowStageLabel={sharedContext.workflowStageLabel}
        workflowLibraryHref={sharedContext.workflowLibraryHref}
        activeStudioSurface={surface}
        surfaceHrefs={sharedContext.surfaceHrefs}
        toolsHref={sharedContext.toolsHref}
        workspaceStarterLibraryHref={sharedContext.workspaceStarterLibraryHref}
      >
        <section
          className="workflow-studio-surface workflow-studio-surface-utility"
          data-surface={surface}
        >
          <WorkflowApiSurface
            workflowId={sharedContext.workflow.id}
            bindings={bindings}
            apiHref={canonicalApiHref}
            publishHref={sharedContext.surfaceHrefs.publish}
            logsHref={sharedContext.surfaceHrefs.logs}
            monitorHref={sharedContext.surfaceHrefs.monitor}
            sampleQueryScope={apiSampleQueryScope}
          />
        </section>
      </WorkflowStudioShell>
    );
  }

  if (surface === "logs") {
    const [bindings, recentRuns] = await Promise.all([
      getServerWorkflowPublishedEndpoints(sharedContext.workflow.id, {
        includeAllVersions: true
      }),
      getServerWorkflowRuns(sharedContext.workflow.id)
    ]);
    const publishedBindings = bindings.filter((binding) => binding.lifecycle_status === "published");
    const governanceSnapshot = publishedBindings.length
      ? await getWorkflowPublishGovernanceSnapshot(sharedContext.workflow.id, publishedBindings)
      : {
          cacheInventories: {},
          apiKeysByBinding: {},
          invocationAuditsByBinding: {},
          invocationDetailsByBinding: {},
          rateLimitWindowAuditsByBinding: {}
        };
    const publishActivityQueryScope = readWorkflowPublishActivityQueryScope(
      sharedContext.resolvedSearchParams
    );
    const invocationSelection = selectWorkflowLogsInvocation(
      publishedBindings,
      governanceSnapshot.invocationAuditsByBinding,
      publishActivityQueryScope.bindingId,
      publishActivityQueryScope.invocationId
    );
    const activeBinding =
      publishedBindings.find((binding) => binding.id === invocationSelection.activeBindingId) ?? null;
    const activeInvocationAudit = activeBinding
      ? governanceSnapshot.invocationAuditsByBinding[activeBinding.id] ?? null
      : null;
    const activeInvocationItem =
      activeInvocationAudit?.items.find(
        (item) => item.id === invocationSelection.selectedInvocationId
      ) ?? null;
    const requestedRunId = readWorkflowLogsRequestedRunId(sharedContext.resolvedSearchParams.run);
    const runSelection = selectWorkflowLogsRun(recentRuns, requestedRunId);
    const logsSearchParams = buildWorkflowStudioSearchParams(sharedContext.resolvedSearchParams, {
      omitKeys: ["surface", "run", "publish_binding", "publish_invocation"]
    });
    const canonicalLogsHref = buildWorkflowStudioSurfaceHref(sharedContext.workflow.id, "logs");
    const buildLogsHrefWithInvocation = (bindingId: string, invocationId?: string | null) => {
      const searchParams = new URLSearchParams(logsSearchParams.toString());
      searchParams.set("publish_binding", bindingId);
      if (invocationId) {
        searchParams.set("publish_invocation", invocationId);
      }

      return appendSearchParamsToHref(canonicalLogsHref, searchParams);
    };
    const runs = recentRuns.map((run) => {
      const runLogsParams = new URLSearchParams(logsSearchParams.toString());
      runLogsParams.set("run", run.id);

      return {
        id: run.id,
        workflowVersion: run.workflow_version,
        status: run.status,
        createdAt: run.created_at,
        startedAt: run.started_at,
        finishedAt: run.finished_at,
        lastEventAt: run.last_event_at,
        nodeRunCount: run.node_run_count,
        eventCount: run.event_count,
        errorMessage: run.error_message,
        logsHref: appendSearchParamsToHref(canonicalLogsHref, runLogsParams),
        detailHref: buildRunDetailHref(run.id)
      };
    });

    const activeInvocationDetail =
      activeBinding && invocationSelection.selectedInvocationId
        ? await getServerPublishedEndpointInvocationDetail(
            sharedContext.workflow.id,
            activeBinding.id,
            invocationSelection.selectedInvocationId
          )
        : null;
    const activeInvocationRunId =
      activeInvocationDetail?.kind === "ok"
        ? activeInvocationDetail.data.run?.id ??
          activeInvocationDetail.data.invocation.run_id ??
          activeInvocationItem?.run_id ??
          null
        : activeInvocationItem?.run_id ?? null;
    const fallbackRunSummary =
      runs.find((run) => run.id === runSelection.activeRun?.id) ?? null;
    const activeRunSummary =
      runs.find((run) => run.id === activeInvocationRunId) ?? fallbackRunSummary;
    let activeRunDetail = null;
    let executionView = null;
    let evidenceView = null;
    let systemOverview = null;

    if (activeRunSummary || (activeInvocationAudit?.items.length ?? 0) > 0) {
      [activeRunDetail, executionView, evidenceView, systemOverview] = await Promise.all([
        activeRunSummary ? getServerRunDetail(activeRunSummary.id) : Promise.resolve(null),
        activeRunSummary ? getServerRunExecutionView(activeRunSummary.id) : Promise.resolve(null),
        activeRunSummary ? getServerRunEvidenceView(activeRunSummary.id) : Promise.resolve(null),
        getSystemOverview()
      ]);
    }

    const logsSelectionNotice = [
      (activeInvocationAudit?.items.length ?? 0) > 0 ? invocationSelection.selectionNotice : null,
      activeBinding && (activeInvocationAudit?.items.length ?? 0) === 0 && recentRuns.length > 0
        ? "当前 published binding 还没有 recent invocations，页面已回退到 workflow recent runs 事实，避免把空审计面伪装成完整日志。"
        : null,
      (activeInvocationAudit?.items.length ?? 0) === 0 ? runSelection.selectionNotice : null
    ]
      .filter((notice): notice is string => Boolean(notice))
      .join(" ");

    return (
      <WorkflowStudioShell
        workflowId={sharedContext.workflow.id}
        workspaceName={sharedContext.workspaceName}
        userName={sharedContext.userName}
        userRole={sharedContext.userRole}
        workflowName={sharedContext.workflow.name}
        workflowVersion={sharedContext.workflow.version}
        workflowStageLabel={sharedContext.workflowStageLabel}
        workflowLibraryHref={sharedContext.workflowLibraryHref}
        activeStudioSurface={surface}
        surfaceHrefs={sharedContext.surfaceHrefs}
        toolsHref={sharedContext.toolsHref}
        workspaceStarterLibraryHref={sharedContext.workspaceStarterLibraryHref}
      >
        <section
          className="workflow-studio-surface workflow-studio-surface-utility"
          data-surface={surface}
        >
          <WorkflowLogsSurface
            workflowId={sharedContext.workflow.id}
            workflow={sharedContext.workflow}
            activeBinding={
              activeBinding
                ? {
                    id: activeBinding.id,
                    endpointAlias: activeBinding.endpoint_alias,
                    routePath: activeBinding.route_path,
                    protocol: activeBinding.protocol,
                    authMode: activeBinding.auth_mode,
                    workflowVersion: activeBinding.workflow_version
                  }
                : null
            }
            invocationAudit={activeInvocationAudit}
            selectedInvocationId={invocationSelection.selectedInvocationId}
            selectedInvocationDetail={activeInvocationDetail}
            buildInvocationHref={
              activeBinding ? (invocationId) => buildLogsHrefWithInvocation(activeBinding.id, invocationId) : undefined
            }
            clearInvocationHref={
              activeBinding
                ? buildLogsHrefWithInvocation(activeBinding.id)
                : appendSearchParamsToHref(canonicalLogsHref, logsSearchParams)
            }
            recentRuns={runs}
            selectionSource={
              (activeInvocationAudit?.items.length ?? 0) > 0
                ? invocationSelection.selectionSource
                : runSelection.selectionSource
            }
            selectionNotice={logsSelectionNotice || null}
            activeRunSummary={activeRunSummary}
            activeRunDetail={activeRunDetail}
            executionView={executionView}
            evidenceView={evidenceView}
            publishHref={sharedContext.surfaceHrefs.publish}
            runLibraryHref="/runs"
            workflowEditorHref={sharedContext.surfaceHrefs.editor}
            callbackWaitingAutomation={
              systemOverview?.callback_waiting_automation ?? {
                status: "disabled",
                scheduler_required: true,
                detail: "当前还没有 callback automation facts。",
                scheduler_health_status: "unknown",
                scheduler_health_detail: "当前 logs surface 没有拿到 scheduler 概览。",
                steps: [],
                affected_run_count: 0,
                affected_workflow_count: 0,
                primary_blocker_kind: null,
                recommended_action: null
              }
            }
            sandboxReadiness={systemOverview?.sandbox_readiness ?? null}
          />
        </section>
      </WorkflowStudioShell>
    );
  }

  if (surface === "monitor") {
    const bindings = await getServerWorkflowPublishedEndpoints(sharedContext.workflow.id, {
      includeAllVersions: true
    });
    const publishedBindings = bindings.filter((binding) => binding.lifecycle_status === "published");
    const monitorActivityQueryScope = readWorkflowPublishActivityQueryScope(
      sharedContext.resolvedSearchParams
    );
    const requestedMonitorRunId = readWorkflowLogsRequestedRunId(
      sharedContext.resolvedSearchParams.run
    );
    const monitorActivityFilters = resolveWorkflowPublishActivityFilters(
      monitorActivityQueryScope,
      publishedBindings
    );
    const focusedMonitorBindings = monitorActivityFilters.governanceFetchFilter?.bindingId
      ? publishedBindings.filter(
          (binding) => binding.id === monitorActivityFilters.governanceFetchFilter?.bindingId
        )
      : publishedBindings;
    let governanceSnapshot: Awaited<ReturnType<typeof getWorkflowPublishGovernanceSnapshot>> = {
      cacheInventories: {},
      apiKeysByBinding: {},
      invocationAuditsByBinding: {},
      invocationDetailsByBinding: {},
      rateLimitWindowAuditsByBinding: {}
    };

    if (focusedMonitorBindings.length > 0) {
      let activeInvocationFilter = monitorActivityFilters.governanceFetchFilter;

      if (
        activeInvocationFilter &&
        monitorActivityQueryScope.invocationId &&
        monitorActivityQueryScope.timeWindow === "all"
      ) {
        const focusedInvocationDetail = await getServerPublishedEndpointInvocationDetail(
          sharedContext.workflow.id,
          activeInvocationFilter.bindingId,
          monitorActivityQueryScope.invocationId
        );
        const focusWindow =
          focusedInvocationDetail?.kind === "ok"
            ? buildWorkflowMonitorFocusWindow(
                focusedInvocationDetail.data.invocation.created_at
              )
            : null;

        if (focusWindow) {
          activeInvocationFilter = {
            ...activeInvocationFilter,
            ...focusWindow,
            limit: 24
          };
        }
      }

      governanceSnapshot = await getWorkflowPublishGovernanceSnapshot(
        sharedContext.workflow.id,
        focusedMonitorBindings,
        activeInvocationFilter ? { activeInvocationFilter } : undefined
      );
    }

    return (
      <WorkflowStudioShell
        workflowId={sharedContext.workflow.id}
        workspaceName={sharedContext.workspaceName}
        userName={sharedContext.userName}
        userRole={sharedContext.userRole}
        workflowName={sharedContext.workflow.name}
        workflowVersion={sharedContext.workflow.version}
        workflowStageLabel={sharedContext.workflowStageLabel}
        workflowLibraryHref={sharedContext.workflowLibraryHref}
        activeStudioSurface={surface}
        surfaceHrefs={sharedContext.surfaceHrefs}
        toolsHref={sharedContext.toolsHref}
        workspaceStarterLibraryHref={sharedContext.workspaceStarterLibraryHref}
      >
        <section
          className="workflow-studio-surface workflow-studio-surface-utility"
          data-surface={surface}
        >
          <WorkflowMonitorSurface
            workflowId={sharedContext.workflow.id}
            bindings={bindings}
            invocationAuditsByBinding={governanceSnapshot.invocationAuditsByBinding}
            publishHref={sharedContext.surfaceHrefs.publish}
            logsHref={sharedContext.surfaceHrefs.logs}
            workflowEditorHref={sharedContext.surfaceHrefs.editor}
            currentHref={sharedContext.surfaceHrefs.monitor}
            focusBindingId={monitorActivityQueryScope.bindingId}
            focusInvocationId={monitorActivityQueryScope.invocationId}
            focusRunId={requestedMonitorRunId}
          />
        </section>
      </WorkflowStudioShell>
    );
  }

  const surfaceDefinition = getWorkflowStudioSurfaceDefinition(surface);

  return (
    <WorkflowStudioShell
      workflowId={sharedContext.workflow.id}
      workspaceName={sharedContext.workspaceName}
      userName={sharedContext.userName}
      userRole={sharedContext.userRole}
      workflowName={sharedContext.workflow.name}
      workflowVersion={sharedContext.workflow.version}
      workflowStageLabel={sharedContext.workflowStageLabel}
      workflowLibraryHref={sharedContext.workflowLibraryHref}
      activeStudioSurface={surface}
      surfaceHrefs={sharedContext.surfaceHrefs}
      toolsHref={sharedContext.toolsHref}
      workspaceStarterLibraryHref={sharedContext.workspaceStarterLibraryHref}
    >
      <section className="workflow-studio-surface workflow-studio-surface-utility" data-surface={surface}>
        <div
          className="workflow-studio-placeholder-card"
          data-component="workflow-studio-placeholder"
          data-placeholder-surface={surface}
        >
          <p className="workflow-studio-placeholder-eyebrow">Workflow surface</p>
          <h2>{surfaceDefinition.label}</h2>
          <p>{surfaceDefinition.description}</p>
          <div className="workflow-studio-placeholder-actions">
            <Link className="workflow-studio-secondary-link" href={sharedContext.surfaceHrefs.publish}>
              查看发布治理
            </Link>
            <Link className="workflow-studio-secondary-link" href="/runs">
              查看运行诊断
            </Link>
          </div>
        </div>
      </section>
    </WorkflowStudioShell>
  );
}

function WorkflowStudioShell({
  workflowId,
  workspaceName,
  userName,
  userRole,
  workflowName,
  workflowVersion,
  workflowStageLabel,
  workflowLibraryHref,
  activeStudioSurface,
  surfaceHrefs,
  toolsHref,
  workspaceStarterLibraryHref,
  children
}: WorkflowStudioShellProps) {
  const isCanvasEditorSurface = activeStudioSurface === "editor";

  const shellClassName = [
    "workflow-studio-shell",
    isCanvasEditorSurface ? "workflow-studio-shell-editor" : null
  ]
    .filter(Boolean)
    .join(" ");
  const stageClassName = [
    "workflow-studio-stage",
    isCanvasEditorSurface ? "workflow-studio-stage-editor" : null
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <WorkspaceShell
      activeNav="workspace"
      layout="editor"
      navigationHrefOverrides={{ tools: toolsHref }}
      userName={userName}
      userRole={userRole}
      workspaceName={workspaceName}
    >
      <div className="workspace-main workflow-studio-main">
        <WorkflowStudioLayoutShell
          className={shellClassName}
          contentClassName={stageClassName}
          dataSurfaceLayout={isCanvasEditorSurface ? "canvas-overlay" : "rail"}
          sidebar={
            <WorkflowStudioSidebar
              activeStudioSurface={activeStudioSurface}
              className="workflow-studio-shell-bar workflow-studio-rail"
              dataComponent="workflow-studio-rail"
              surfaceHrefs={surfaceHrefs}
              workflowId={workflowId}
              workflowLibraryHref={workflowLibraryHref}
              workflowName={workflowName}
              workflowStageLabel={workflowStageLabel}
              workflowVersion={workflowVersion}
              workspaceStarterLibraryHref={workspaceStarterLibraryHref}
            />
          }
        >
          {children}
        </WorkflowStudioLayoutShell>
      </div>
    </WorkspaceShell>
  );
}

function buildWorkflowStudioSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
  options: { omitKeys?: string[] } = {}
) {
  const result = new URLSearchParams();
  const omittedKeys = new Set([...(options.omitKeys ?? []), ...WORKFLOW_API_SAMPLE_QUERY_KEYS]);

  for (const [key, rawValue] of Object.entries(searchParams).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    if (omittedKeys.has(key) || typeof rawValue === "undefined") {
      continue;
    }

    const values = Array.isArray(rawValue) ? rawValue : [rawValue];

    for (const value of values) {
      result.append(key, value);
    }
  }

  return result;
}

function appendSearchParamsToHref(href: string, searchParams: URLSearchParams) {
  const query = searchParams.toString();
  return query ? `${href}?${query}` : href;
}

function buildWorkflowMonitorFocusWindow(createdAt: string | null | undefined) {
  const timestamp = Date.parse(createdAt ?? "");

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const createdAtDate = new Date(timestamp);
  const windowStart = new Date(createdAtDate);
  windowStart.setUTCMinutes(0, 0, 0);

  return {
    createdFrom: windowStart.toISOString(),
    createdTo: new Date(windowStart.getTime() + 60 * 60 * 1000).toISOString()
  };
}
