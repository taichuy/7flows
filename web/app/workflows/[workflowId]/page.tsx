import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { WorkspaceShell } from "@/components/workspace-shell";
import { WorkflowEditorWorkbench } from "@/components/workflow-editor-workbench";
import { WorkflowPublishPanel } from "@/components/workflow-publish-panel";
import { getPluginRegistrySnapshot } from "@/lib/get-plugin-registry";
import { getServerWorkspaceContext } from "@/lib/server-workspace-access";
import { getSystemOverview } from "@/lib/get-system-overview";
import { getWorkflowLibrarySnapshot } from "@/lib/get-workflow-library";
import { getWorkflowPublishedEndpoints } from "@/lib/get-workflow-publish";
import { getWorkflowPublishGovernanceSnapshot } from "@/lib/get-workflow-publish-governance";
import { getWorkflowRuns } from "@/lib/get-workflow-runs";
import {
  appendWorkflowLibraryViewState,
  readWorkflowLibraryViewState
} from "@/lib/workflow-library-query";
import {
  buildWorkflowCreateHrefFromWorkspaceStarterViewState,
  buildWorkflowEditorHrefFromWorkspaceStarterViewState,
  buildWorkflowLibraryHrefFromWorkspaceStarterViewState,
  buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState,
  hasScopedWorkspaceStarterGovernanceFilters,
  pickWorkspaceStarterGovernanceQueryScope,
  readWorkspaceStarterLibraryViewState
} from "@/lib/workspace-starter-governance-query";
import {
  readWorkflowPublishActivityQueryScope,
  resolveWorkflowPublishActivityFilters
} from "@/lib/workflow-publish-activity-query";
import { getWorkflowDetail, getWorkflows } from "@/lib/get-workflows";

type WorkflowEditorPageProps = {
  params: Promise<{ workflowId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type WorkflowStudioSurface = "editor" | "publish";

export async function generateMetadata({
  params
}: WorkflowEditorPageProps): Promise<Metadata> {
  const { workflowId } = await params;

  return {
    title: `Workflow ${workflowId} | 7Flows Studio`
  };
}

export default async function WorkflowEditorPage({
  params,
  searchParams
}: WorkflowEditorPageProps) {
  const { workflowId } = await params;
  const resolvedSearchParams = await searchParams;
  const [workspaceContext, workflow, workflows, workflowLibrary, pluginRegistry, systemOverview, recentRuns, publishedEndpoints] =
    await Promise.all([
      getServerWorkspaceContext(),
      getWorkflowDetail(workflowId),
      getWorkflows(),
      getWorkflowLibrarySnapshot(),
      getPluginRegistrySnapshot(),
      getSystemOverview(),
      getWorkflowRuns(workflowId),
      getWorkflowPublishedEndpoints(workflowId, {
        includeAllVersions: true
      })
    ]);

  if (!workspaceContext) {
    redirect(`/login?next=/workflows/${encodeURIComponent(workflowId)}`);
  }

  if (!workflow) {
    notFound();
  }

  const workspaceStarterViewState = readWorkspaceStarterLibraryViewState(
    resolvedSearchParams
  );
  const activeStudioSurface = readWorkflowStudioSurface(
    resolvedSearchParams.surface
  );
  const workflowLibraryViewState = readWorkflowLibraryViewState(resolvedSearchParams);
  const workflowLibraryHref = appendWorkflowLibraryViewState(
    buildWorkflowLibraryHrefFromWorkspaceStarterViewState(
      workspaceStarterViewState
    ),
    workflowLibraryViewState
  );
  const createWorkflowHref = buildWorkflowCreateHrefFromWorkspaceStarterViewState(
    workspaceStarterViewState
  );
  const currentEditorHref = appendWorkflowLibraryViewState(
    buildWorkflowEditorHrefFromWorkspaceStarterViewState(
      workflow.id,
      workspaceStarterViewState
    ),
    workflowLibraryViewState
  );
  const editorSurfaceHref = appendWorkflowStudioSurface(currentEditorHref, "editor");
  const publishSurfaceHref = appendWorkflowStudioSurface(currentEditorHref, "publish");
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
  const publishActivityQueryScope = readWorkflowPublishActivityQueryScope(
    resolvedSearchParams
  );
  const publishActivityFilters = resolveWorkflowPublishActivityFilters(
    publishActivityQueryScope,
    publishedEndpoints
  );

  const {
    cacheInventories,
    apiKeysByBinding,
    invocationAuditsByBinding,
    invocationDetailsByBinding,
    rateLimitWindowAuditsByBinding
  } = await getWorkflowPublishGovernanceSnapshot(workflow.id, publishedEndpoints, {
    activeInvocationFilter: publishActivityFilters.governanceFetchFilter
  });
  const workflowStageLabel =
    publishedEndpoints.length > 0 ? "publish ready" : "draft only";
  const isEditorSurface = activeStudioSurface === "editor";
  const studioModeLabel = isEditorSurface ? "xyflow studio" : "publish governance";

  return (
    <WorkspaceShell
      activeNav="workflows"
      layout="editor"
      userName={workspaceContext.current_user.display_name}
      userRole={workspaceContext.current_member.role}
      workspaceName={workspaceContext.workspace.name}
    >
      <div className="workspace-main workflow-studio-main">
        <section
          className={[
            "workflow-studio-shell-bar",
            isEditorSurface ? "workflow-studio-shell-bar-compact" : null
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="workflow-studio-shell-row">
            <div className="workflow-studio-breadcrumb-row">
              <Link className="workflow-studio-breadcrumb-link" href={workflowLibraryHref}>
                编排中心
              </Link>
              <span className="workflow-studio-breadcrumb-current">{workflow.name}</span>
              <span className="workflow-studio-inline-tag">v{workflow.version}</span>
              <span className="workflow-studio-inline-tag">{workflowStageLabel}</span>
              <span className="workflow-studio-shell-mode">{studioModeLabel}</span>
            </div>

            <nav className="workflow-studio-surface-nav" aria-label="Workflow studio surfaces">
              <Link
                className={`workflow-studio-surface-link ${
                  activeStudioSurface === "editor" ? "active" : ""
                }`.trim()}
                href={editorSurfaceHref}
              >
                画布编排
              </Link>
              <Link
                className={`workflow-studio-surface-link ${
                  activeStudioSurface === "publish" ? "active" : ""
                }`.trim()}
                href={publishSurfaceHref}
              >
                发布治理
              </Link>
              <span className="workflow-studio-surface-nav-spacer" aria-hidden="true" />
              <div className="workflow-studio-utility-links">
                <Link className="workflow-studio-secondary-link" href="/runs">
                  运行诊断
                </Link>
                <Link className="workflow-studio-secondary-link" href={workspaceStarterLibraryHref}>
                  Starter 模板
                </Link>
              </div>
            </nav>
          </div>
        </section>

        <section
          className="workflow-studio-surface"
          data-surface="editor"
          hidden={activeStudioSurface !== "editor"}
        >
          <WorkflowEditorWorkbench
            workflow={workflow}
            workflows={workflows}
            nodeCatalog={workflowLibrary.nodes}
            nodeSourceLanes={workflowLibrary.nodeSourceLanes}
            toolSourceLanes={workflowLibrary.toolSourceLanes}
            tools={workflowLibrary.tools}
            adapters={pluginRegistry.adapters}
            callbackWaitingAutomation={systemOverview.callback_waiting_automation}
            sandboxReadiness={systemOverview.sandbox_readiness}
            sandboxBackends={systemOverview.sandbox_backends}
            recentRuns={recentRuns}
            currentEditorHref={editorSurfaceHref}
            workflowLibraryHref={workflowLibraryHref}
            createWorkflowHref={createWorkflowHref}
            workspaceStarterLibraryHref={workspaceStarterLibraryHref}
            hasScopedWorkspaceStarterFilters={hasScopedWorkspaceStarterFilters}
            workspaceStarterGovernanceQueryScope={workspaceStarterGovernanceQueryScope}
          />
        </section>

        <section
          className="workflow-studio-surface workflow-studio-surface-governance"
          data-surface="publish"
          hidden={activeStudioSurface !== "publish"}
        >
          <WorkflowPublishPanel
            workflow={workflow}
            tools={pluginRegistry.tools}
            bindings={publishedEndpoints}
            cacheInventories={cacheInventories}
            apiKeysByBinding={apiKeysByBinding}
            invocationAuditsByBinding={invocationAuditsByBinding}
            invocationDetailsByBinding={invocationDetailsByBinding}
            selectedInvocationId={publishActivityFilters.selectedInvocationId}
            rateLimitWindowAuditsByBinding={rateLimitWindowAuditsByBinding}
            callbackWaitingAutomation={systemOverview.callback_waiting_automation}
            sandboxReadiness={systemOverview.sandbox_readiness}
            activeInvocationFilter={publishActivityFilters.panelActiveFilter}
            workflowLibraryHref={workflowLibraryHref}
            currentHref={publishSurfaceHref}
            workspaceStarterGovernanceQueryScope={workspaceStarterGovernanceQueryScope}
          />
        </section>
      </div>
    </WorkspaceShell>
  );
}

function readWorkflowStudioSurface(
  value: string | string[] | undefined
): WorkflowStudioSurface {
  const resolvedValue = Array.isArray(value) ? value[0] : value;
  return resolvedValue === "publish" ? "publish" : "editor";
}

function appendWorkflowStudioSurface(
  href: string,
  surface: WorkflowStudioSurface
) {
  const [path, hash = ""] = href.split("#", 2);
  const url = new URL(path, "http://sevenflows.local");
  url.searchParams.set("surface", surface);
  return `${url.pathname}${url.search}${hash ? `#${hash}` : ""}`;
}
