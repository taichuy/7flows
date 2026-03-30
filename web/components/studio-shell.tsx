"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import type { WorkspaceMemberRole } from "@/lib/workspace-access";

type StudioShellProps = {
  children: ReactNode;
  userName: string;
  userRole: WorkspaceMemberRole;
  workspaceName: string;
};

export function StudioShell({
  children,
  userName,
  userRole,
  workspaceName
}: StudioShellProps) {
  const pathname = usePathname() ?? "/";

  let activeNav: "workspace" | "workflows" | "runs" | "starters" | "ops" | "team" = "workspace";
  
  if (pathname.startsWith("/runs")) {
    activeNav = "runs";
  } else if (pathname.startsWith("/sensitive-access")) {
    activeNav = "ops";
  } else if (pathname.startsWith("/workflows")) {
    activeNav = "workflows";
  } else if (pathname.startsWith("/workspace-starters")) {
    activeNav = "starters";
  }

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