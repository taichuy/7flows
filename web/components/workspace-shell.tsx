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
  userName: string;
  userRole: WorkspaceMemberRole;
  workspaceName: string;
};

const navigationItems: Array<{
  key: WorkspaceShellProps["activeNav"];
  href: string;
  label: string;
}> = [
  { key: "workspace", href: "/workspace", label: "工作空间" },
  { key: "workflows", href: "/workflows", label: "编排中心" },
  { key: "starters", href: "/workspace-starters", label: "Starter 模板" },
  { key: "runs", href: "/runs", label: "运行诊断" },
  { key: "ops", href: "/", label: "运维总览" },
  { key: "team", href: "/admin/members", label: "团队设置" }
];

export function WorkspaceShell({
  activeNav,
  children,
  userName,
  userRole,
  workspaceName
}: WorkspaceShellProps) {
  const router = useRouter();
  const workspaceBadgeLabel = getWorkspaceBadgeLabel(workspaceName);
  const userBadgeLabel = getWorkspaceBadgeLabel(userName, "A");
  const canManageMembers = canManageWorkspaceMembers(userRole);

  const handleLogout = async () => {
    await fetch("/api/session/logout", {
      method: "POST"
    }).catch(() => null);
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="workspace-shell">
      <header className="workspace-topbar">
        <div className="workspace-topbar-inner">
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
                <span>Workspace</span>
              </div>
            </div>
          </div>
          <nav className="workspace-nav" aria-label="Workspace">
            {navigationItems
              .filter((item) => (item.key === "team" ? canManageMembers : true))
              .map((item) => (
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
              + 新建应用
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
      <div className="workspace-content">{children}</div>
    </div>
  );
}
