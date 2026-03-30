import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/workspace-shell";
import type { WorkspaceShellActiveNav } from "@/components/workspace-shell";
import type { WorkspaceMemberRole } from "@/lib/workspace-access";

type StudioShellProps = {
  activeNav: WorkspaceShellActiveNav;
  children: ReactNode;
  userName: string;
  userRole: WorkspaceMemberRole;
  workspaceName: string;
};

export function StudioShell({
  activeNav,
  children,
  userName,
  userRole,
  workspaceName
}: StudioShellProps) {
  return (
    <WorkspaceShell
      activeNav={activeNav}
      layout="default"
      userName={userName}
      userRole={userRole}
      workspaceName={workspaceName}
    >
      {children}
    </WorkspaceShell>
  );
}
