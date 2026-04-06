import Link from "next/link";

import type { WorkspaceMemberRole } from "@/lib/workspace-access";
import {
  canViewConsoleNavItem,
  getWorkspaceConsoleNavigationItems,
  getWorkspaceShellNavigationKeys,
  type WorkspaceConsoleNavKey,
  type WorkspaceShellNavigationMode
} from "@/lib/workspace-console";

export type WorkspaceShellNavigationLink = {
  key: WorkspaceConsoleNavKey;
  label: string;
  href: string;
  isActive?: boolean;
};

type BuildWorkspaceShellNavigationLinksArgs = {
  activeNav: WorkspaceConsoleNavKey;
  navigationMode: WorkspaceShellNavigationMode;
  navigationHrefOverrides?: Partial<Record<WorkspaceConsoleNavKey, string>>;
  userRole: WorkspaceMemberRole;
};

type WorkspaceShellNavigationProps = {
  items: WorkspaceShellNavigationLink[];
};

export function buildWorkspaceShellNavigationLinks({
  activeNav,
  navigationMode,
  navigationHrefOverrides,
  userRole
}: BuildWorkspaceShellNavigationLinksArgs) {
  const allowedNavigationKeys = new Set(getWorkspaceShellNavigationKeys(navigationMode));

  return getWorkspaceConsoleNavigationItems()
    .filter((item) => {
      if (!allowedNavigationKeys.has(item.key)) {
        return false;
      }

      return canViewConsoleNavItem(item.key, userRole);
    })
    .map((item) => ({
      key: item.key,
      label: item.label,
      href: navigationHrefOverrides?.[item.key] ?? item.href,
      isActive: item.key === activeNav
    })) satisfies WorkspaceShellNavigationLink[];
}

export function WorkspaceShellNavigation({ items }: WorkspaceShellNavigationProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Workspace" className="workspace-nav" data-component="workspace-shell-nav">
      {items.map((item) => (
        <Link
          aria-current={item.isActive ? "page" : undefined}
          className={["workspace-nav-link", item.isActive ? "active" : null]
            .filter(Boolean)
            .join(" ")}
          data-current={item.isActive ? "true" : "false"}
          data-nav-key={item.key}
          href={item.href}
          key={item.key}
          suppressHydrationWarning
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
