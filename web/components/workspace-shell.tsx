import type { ReactNode } from "react";
import Link from "next/link";

import { formatWorkspaceRole, type WorkspaceMemberRole } from "@/lib/workspace-access";
import {
  canViewConsoleNavItem,
  getDefaultWorkspaceNavigationMode,
  getWorkspaceConsoleNavigationItems,
  getWorkspaceShellNavigationKeys,
  type WorkspaceConsoleNavKey,
  type WorkspaceShellNavigationMode
} from "@/lib/workspace-console";
import { getWorkspaceBadgeLabel } from "@/lib/workspace-ui";
import { WorkspaceLogoutButton } from "@/components/workspace-logout-button";

export type WorkspaceShellActiveNav = WorkspaceConsoleNavKey;

type WorkspaceShellProps = {
  activeNav: WorkspaceShellActiveNav;
  children: ReactNode;
  layout?: "default" | "focused" | "editor";
  navigationMode?: WorkspaceShellNavigationMode;
  navigationHrefOverrides?: Partial<Record<WorkspaceConsoleNavKey, string>>;
  userName: string;
  userRole: WorkspaceMemberRole;
  workspaceName: string;
};

type WorkspaceShellLayout = NonNullable<WorkspaceShellProps["layout"]>;

export function WorkspaceShell({
  activeNav,
  children,
  layout = "default",
  navigationMode,
  navigationHrefOverrides,
  userName,
  userRole,
  workspaceName
}: WorkspaceShellProps) {
  const isEditorLayout = layout === "editor";
  const resolvedNavigationMode = navigationMode ?? getDefaultWorkspaceNavigationMode(layout);
  const allowedNavigationKeys = new Set(getWorkspaceShellNavigationKeys(resolvedNavigationMode));
  const navigationItems = getWorkspaceConsoleNavigationItems();
  const workspaceBadgeLabel = getWorkspaceBadgeLabel(workspaceName);
  const userBadgeLabel = getWorkspaceBadgeLabel(userName, "A");
  const shellSurfaceLabel = getWorkspaceShellSurfaceLabel(activeNav, layout);
  const visibleNavigationItems = navigationItems.filter((item) => {
    if (!allowedNavigationKeys.has(item.key)) {
      return false;
    }

    return canViewConsoleNavItem(item.key, userRole);
  });
  const primaryAction =
    layout === "default"
      ? {
          href: "/workflows/new",
          label: "新建应用"
        }
      : null;

  return (
    <div
      className={`workspace-shell workspace-shell-${layout}`.trim()}
      data-component="workspace-shell"
      data-layout={layout}
      data-navigation-mode={resolvedNavigationMode}
    >
      <header className="workspace-topbar">
        <div className={`workspace-topbar-inner ${isEditorLayout ? "workspace-topbar-inner-editor" : ""}`.trim()}>
          <div className="workspace-brand-row">
            <Link className="workspace-brand" href="/workspace" suppressHydrationWarning>
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
            {visibleNavigationItems.map((item) => {
              const isActive = item.key === activeNav;
              const href = navigationHrefOverrides?.[item.key] ?? item.href;

              return (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={isActive ? "workspace-nav-link active" : "workspace-nav-link"}
                  href={href}
                  key={item.key}
                  suppressHydrationWarning
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="workspace-user-actions" data-component="workspace-shell-actions">
            {primaryAction ? (
              <Link
                className="workspace-primary-button compact workspace-topbar-create"
                href={primaryAction.href}
                suppressHydrationWarning
              >
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
    if (activeNav === "tools") {
      return "工具中心";
    }

    if (activeNav === "team") {
      return "工作台设置";
    }

    if (activeNav === "workspace") {
      return "创建应用";
    }

    return "聚焦入口";
  }

  if (activeNav === "tools") {
    return "工具中心";
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

  if (activeNav === "workspace") {
    return "应用中心";
  }

  return "作者工作台";
}
