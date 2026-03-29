"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  canManageWorkspaceMembers,
  formatWorkspaceRole,
  type WorkspaceMemberRole
} from "@/lib/workspace-access";
import { getWorkspaceBadgeLabel } from "@/lib/workspace-ui";

type WorkspaceShellProps = {
  activeNav: "workspace" | "workflows" | "runs" | "starters" | "ops" | "team";
  children: ReactNode;
  layout?: "default" | "editor";
  userName: string;
  userRole: WorkspaceMemberRole;
  workspaceName: string;
};

const navigationItems: Array<{
  key: WorkspaceShellProps["activeNav"];
  href: string;
  label: string;
}> = [
  { key: "workspace", href: "/workspace", label: "工作台" },
  { key: "workflows", href: "/workflows", label: "编排" },
  { key: "starters", href: "/workspace-starters", label: "模板" },
  { key: "runs", href: "/runs", label: "运行" },
  { key: "team", href: "/admin/members", label: "团队" }
];

export function WorkspaceShell({
  activeNav,
  children,
  layout = "default",
  userName,
  userRole,
  workspaceName
}: WorkspaceShellProps) {
  const router = useRouter();
  const isEditorLayout = layout === "editor";
  const workspaceBadgeLabel = getWorkspaceBadgeLabel(workspaceName);
  const userBadgeLabel = getWorkspaceBadgeLabel(userName, "A");
  const canManageMembers = canManageWorkspaceMembers(userRole);
  const visibleNavigationItems = navigationItems.filter((item) => {
    if (item.key === "team" && !canManageMembers) {
      return false;
    }

    if (!isEditorLayout) {
      return true;
    }

    return item.key === "workspace" || item.key === "workflows" || item.key === "runs" || item.key === "team";
  });

  const handleLogout = async () => {
    await fetch("/api/session/logout", {
      method: "POST"
    }).catch(() => null);
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className={`workspace-shell ${isEditorLayout ? "workspace-shell-editor" : ""}`.trim()}>
      <header className={`workspace-topbar ${isEditorLayout ? "workspace-topbar-editor" : ""}`.trim()}>
        <div
          className={`workspace-topbar-inner ${isEditorLayout ? "workspace-topbar-inner-editor" : ""}`.trim()}
        >
          <div className="workspace-brand-row">
            <Link className="workspace-brand" href="/workspace">
              <span className="workspace-brand-mark">7</span>
              <span>Flows</span>
            </Link>
            <span aria-hidden="true" className="workspace-shell-divider">
              /
            </span>
            <div className="workspace-name-chip">
              <span aria-hidden="true" className="workspace-name-badge">
                {workspaceBadgeLabel}
              </span>
              <div>
                <strong>{workspaceName}</strong>
                <span>{isEditorLayout ? "xyflow Studio" : "作者工作台"}</span>
              </div>
            </div>
          </div>
          <nav
            className={`workspace-nav ${isEditorLayout ? "workspace-nav-editor" : ""}`.trim()}
            aria-label="Workspace"
          >
            {visibleNavigationItems.map((item) => (
              <Link
                className={`workspace-nav-link ${item.key === activeNav ? "active" : ""}`}
                href={item.href}
                key={item.key}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="workspace-user-actions">
            <Link className="workspace-primary-button compact workspace-topbar-create" href="/workflows/new">
              新建应用
            </Link>
            <div className="workspace-user-chip">
              <span aria-hidden="true" className="workspace-avatar-badge">
                {userBadgeLabel}
              </span>
              <div>
                <strong>{userName}</strong>
                <span>{formatWorkspaceRole(userRole)}</span>
              </div>
            </div>
            <button className="workspace-ghost-button compact" onClick={handleLogout} type="button">
              退出登录
            </button>
          </div>
        </div>
      </header>
      <div className={`workspace-content ${isEditorLayout ? "workspace-content-editor" : ""}`.trim()}>
        {children}
      </div>
    </div>
  );
}
