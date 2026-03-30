import { redirect } from "next/navigation";

import { WorkspaceMemberAdminPanel } from "@/components/workspace-member-admin-panel";
import { WorkspaceShell } from "@/components/workspace-shell";
import {
  getServerWorkspaceContext,
  getServerWorkspaceMembers
} from "@/lib/server-workspace-access";

export default async function AdminMembersPage() {
  const [workspaceContext, members] = await Promise.all([
    getServerWorkspaceContext(),
    getServerWorkspaceMembers()
  ]);

  if (!workspaceContext) {
    redirect("/login?next=/admin/members");
  }

  if (!workspaceContext.can_manage_members) {
    redirect("/workspace");
  }

  return (
    <WorkspaceShell
      activeNav="team"
      layout="focused"
      userName={workspaceContext.current_user.display_name}
      userRole={workspaceContext.current_member.role}
      workspaceName={workspaceContext.workspace.name}
    >
      <main className="workspace-main">
        <WorkspaceMemberAdminPanel
          availableRoles={workspaceContext.available_roles}
          canManageMembers={workspaceContext.can_manage_members}
          initialMembers={members}
          workspaceName={workspaceContext.workspace.name}
        />
      </main>
    </WorkspaceShell>
  );
}
