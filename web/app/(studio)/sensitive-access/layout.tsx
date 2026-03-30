import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { StudioShell } from "@/components/studio-shell";
import { getServerWorkspaceContext } from "@/lib/server-workspace-access";

export default async function SensitiveAccessLayout({ children }: { children: ReactNode }) {
  const workspaceContext = await getServerWorkspaceContext();

  if (!workspaceContext) {
    redirect("/login?next=/sensitive-access");
  }

  return (
    <StudioShell
      activeNav="ops"
      userName={workspaceContext.current_user.display_name}
      userRole={workspaceContext.current_member.role}
      workspaceName={workspaceContext.workspace.name}
    >
      {children}
    </StudioShell>
  );
}
