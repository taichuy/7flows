import type { ReactNode } from "react";
import "@xyflow/react/dist/style.css";

import { WorkflowStudioShellFrame } from "@/components/workflow-studio-shell-frame";
import {
  getServerWorkflowDetail,
  getServerWorkspaceContext
} from "@/lib/server-workspace-access";

export default async function WorkflowDetailLayout({
  children,
  params
}: {
  children: ReactNode;
  params: Promise<{ workflowId: string }>;
}) {
  const { workflowId } = await params;
  const [workspaceContext, workflow] = await Promise.all([
    getServerWorkspaceContext(),
    getServerWorkflowDetail(workflowId)
  ]);

  if (!workspaceContext || !workflow) {
    return children;
  }

  return (
    <WorkflowStudioShellFrame
      userName={workspaceContext.current_user.display_name}
      userRole={workspaceContext.current_member.role}
      workflowId={workflow.id}
      workflowName={workflow.name}
      workspaceName={workspaceContext.workspace.name}
    >
      {children}
    </WorkflowStudioShellFrame>
  );
}
