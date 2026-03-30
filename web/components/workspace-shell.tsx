import type { ReactNode } from "react";
import Link from "next/link";

import {
  canManageWorkspaceMembers,
  formatWorkspaceRole,
  type WorkspaceMemberRole
} from "@/lib/workspace-access";
import { getWorkspaceBadgeLabel } from "@/lib/workspace-ui";
import { WorkspaceLogoutButton } from "@/components/workspace-logout-button";

type WorkspaceShellProps = {
  activeNav: "workspace" | "workflows" | "runs" | "starters" | "ops" | "team";
  children: ReactNode;
  layout?: "default" | "focused" | "editor";
  userName: string;
  userRole: WorkspaceMemberRole;
  workspaceName: string;
};

type WorkspaceShellLayout = NonNullable<WorkspaceShellProps["layout"]>;

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
  const isEditorLayout = layout === "editor";
  const isFocusedLayout = layout === "focused";
  const workspaceBadgeLabel = getWorkspaceBadgeLabel(workspaceName);
  const userBadgeLabel = getWorkspaceBadgeLabel(userName, "A");
  const canManageMembers = canManageWorkspaceMembers(userRole);
  const shellSurfaceLabel = getWorkspaceShellSurfaceLabel(activeNav, layout);
  const visibleNavigationItems = navigationItems.filter((item) => {
    if (item.key === "team" && !canManageMembers) {
      return false;
    }

    if (isEditorLayout) {
      return item.key === "workspace" || item.key === "workflows" || item.key === "runs" || item.key === "team";
    }

    if (isFocusedLayout) {
      return item.key === "workspace" || item.key === "workflows" || item.key === "team";
    }

    return true;
  });
  const primaryAction =
    layout === "default"
      ? {
          href: "/workflows/new",
          label: "新建应用"
        }
      : null;

  return (
    <div className={`workspace-shell workspace-shell-${layout}`.trim()} data-component="workspace-shell" data-layout={layout}>
      <header className="workspace-topbar">
        <div className={`workspace-topbar-inner ${isEditorLayout ? "workspace-topbar-inner-editor" : ""}`.trim()}>
          <div className="workspace-brand-row">
            <Link className="workspace-brand" href="/workspace">
              <span className="workspace-brand-mark">7</span>
              <span>Flows</span>
            </Link>
            <div className="workspace-shell-context" data-component="workspace-shell-context">
              <span aria-hidden="true" className="workspace-name-badge">
                {workspaceBadgeLabel}
              </span>
              <div className="workspace-shell-context-copy">
                <strong>{workspaceName}</strong>
                <span>{shellSurfaceLabel}</span>
              </div>
            </div>
          </div>
          <nav
            className={`workspace-nav ${isEditorLayout ? "workspace-nav-editor" : ""}`.trim()}
            aria-label="Workspace"
            data-component="workspace-shell-nav"
          >
            {visibleNavigationItems.map((item) => (
              <Link
                aria-current={item.key === activeNav ? "page" : undefined}
                className={`workspace-nav-link ${item.key === activeNav ? "active" : ""}`}
                href={item.href}
                key={item.key}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="workspace-user-actions" data-component="workspace-shell-actions">
            {primaryAction ? (
              <Link className="workspace-primary-button compact workspace-topbar-create" href={primaryAction.href}>
                {primaryAction.label}
              </Link>
            ) : null}
            <div className="workspace-user-summary">
              <div className="workspace-user-chip">
                <span aria-hidden="true" className="workspace-avatar-badge">
                  {userBadgeLabel}
                </span>
                <strong>{userName}</strong>
              </div>
              <span className="workspace-user-role-pill">{formatWorkspaceRole(userRole)}</span>
            </div>
            <WorkspaceLogoutButton className="workspace-ghost-button compact" />
          </div>
        </div>
      </header>
      <div className={`workspace-content ${isEditorLayout ? "workspace-content-editor" : ""}`.trim()}>
        {children}
      </div>
    </div>
  );
}

function getWorkspaceShellSurfaceLabel(
  activeNav: WorkspaceShellProps["activeNav"],
  layout: WorkspaceShellLayout
) {
  if (layout === "editor") {
    return "xyflow Studio";
  }

  if (layout === "focused") {
    if (activeNav === "team") {
      return "工作台设置";
    }

    if (activeNav === "workflows") {
      return "创建应用";
    }

    return "聚焦入口";
  }

  if (activeNav === "team") {
    return "成员与权限";
  }

  if (activeNav === "starters") {
    return "Starter 模板";
  }

  if (activeNav === "runs") {
    return "运行追踪";
  }

  if (activeNav === "workflows") {
    return "应用中心";
  }

  return "作者工作台";
}
