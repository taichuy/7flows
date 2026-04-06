"use client";

import { useSearchParams, useSelectedLayoutSegment } from "next/navigation";
import type { ReactNode } from "react";

import { WorkflowStudioLayoutShell } from "@/components/workflow-studio-layout-shell";
import { WorkflowStudioSidebar } from "@/components/workflow-studio-sidebar";
import { WorkspaceShell } from "@/components/workspace-shell";
import {
  appendWorkflowLibraryViewState,
  readWorkflowLibraryViewState
} from "@/lib/workflow-library-query";
import {
  appendSearchParamsToHref,
  buildWorkflowStudioSearchParams
} from "@/lib/workflow-studio-route-state";
import {
  buildWorkspaceToolsHref,
  buildWorkflowStudioSurfaceHref,
  getWorkflowStudioSurfaceDefinitions,
  type WorkflowStudioSurface
} from "@/lib/workbench-links";
import {
  buildWorkflowEditorHrefFromWorkspaceStarterViewState,
  buildWorkflowPublishHrefFromWorkspaceStarterViewState,
  buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState,
  readWorkspaceStarterLibraryViewState
} from "@/lib/workspace-starter-governance-query";
import type { WorkspaceMemberRole } from "@/lib/workspace-access";

type WorkflowStudioShellFrameProps = {
  children: ReactNode;
  userName: string;
  userRole: WorkspaceMemberRole;
  workflowId: string;
  workflowName: string;
  workspaceName: string;
};

export function WorkflowStudioShellFrame({
  children,
  userName,
  userRole,
  workflowId,
  workflowName,
  workspaceName
}: WorkflowStudioShellFrameProps) {
  const searchParams = useSearchParams();
  const resolvedSearchParams = new URLSearchParams(searchParams?.toString() ?? "");
  const selectedSegment = useSelectedLayoutSegment();
  const activeStudioSurface = isWorkflowStudioSurface(selectedSegment)
    ? selectedSegment
    : "editor";
  const workspaceStarterViewState = readWorkspaceStarterLibraryViewState(resolvedSearchParams);
  const workflowLibraryViewState = readWorkflowLibraryViewState(resolvedSearchParams);
  const surfaceSearchParams = buildWorkflowStudioSearchParams(resolvedSearchParams, {
    omitKeys: ["surface"]
  });
  const surfaceHrefs = Object.fromEntries(
    getWorkflowStudioSurfaceDefinitions().map((item) => [
      item.key,
      appendSearchParamsToHref(
        buildWorkflowStudioSurfaceHref(workflowId, item.key),
        surfaceSearchParams
      )
    ])
  ) as Record<WorkflowStudioSurface, string>;
  const currentSurfaceHref = appendSearchParamsToHref(
    buildWorkflowStudioSurfaceHref(workflowId, activeStudioSurface),
    surfaceSearchParams
  );
  const toolsHref = buildWorkspaceToolsHref({
    returnHref: currentSurfaceHref,
    workflowId,
    workflowSurface: activeStudioSurface
  });
  const workspaceStarterLibraryHref =
    buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState(
      workspaceStarterViewState
    );
  const editorSurfaceHref = appendWorkflowLibraryViewState(
    buildWorkflowEditorHrefFromWorkspaceStarterViewState(
      workflowId,
      workspaceStarterViewState
    ),
    workflowLibraryViewState
  );
  const publishSurfaceHref = appendWorkflowLibraryViewState(
    buildWorkflowPublishHrefFromWorkspaceStarterViewState(
      workflowId,
      workspaceStarterViewState
    ),
    workflowLibraryViewState
  );

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
          className={[
            "workflow-studio-shell",
            activeStudioSurface === "editor" ? "workflow-studio-shell-editor" : null
          ]
            .filter(Boolean)
            .join(" ")}
          contentClassName={[
            "workflow-studio-stage",
            activeStudioSurface === "editor" ? "workflow-studio-stage-editor" : null
          ]
            .filter(Boolean)
            .join(" ")}
          dataSurfaceLayout={activeStudioSurface === "editor" ? "canvas-overlay" : "rail"}
          sidebar={
            <WorkflowStudioSidebar
              activeStudioSurface={activeStudioSurface}
              className="workflow-studio-shell-bar workflow-studio-rail"
              dataComponent="workflow-studio-rail"
              surfaceHrefs={{
                ...surfaceHrefs,
                editor: editorSurfaceHref,
                publish: publishSurfaceHref
              }}
              workflowId={workflowId}
              workflowName={workflowName}
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

function isWorkflowStudioSurface(
  value: string | null
): value is WorkflowStudioSurface {
  return getWorkflowStudioSurfaceDefinitions().some((item) => item.key === value);
}
