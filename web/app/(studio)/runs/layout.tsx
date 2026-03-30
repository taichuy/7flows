import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { StudioShell } from "@/components/studio-shell";
import { getServerWorkspaceContext } from "@/lib/server-workspace-access";

export default async function RunsLayout({ children }: { children: ReactNode }) {
  const workspaceContext = await getServerWorkspaceContext();

  if (!workspaceContext) {
    redirect("/login?next=/runs");
  }

  return (
    <StudioShell
      activeNav="runs"
      userName={workspaceContext.current_user.display_name}
      userRole={workspaceContext.current_member.role}
      workspaceName={workspaceContext.workspace.name}
    >
      {children}
    </StudioShell>
  );
}
