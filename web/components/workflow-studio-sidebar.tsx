"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu } from "antd";
import type { ItemType } from "antd/es/menu/interface";

import {
  buildWorkflowStudioSurfaceHref,
  getWorkflowStudioSurfaceDefinitions,
  type WorkflowStudioSurface
} from "@/lib/workbench-links";

const PRIMARY_WORKFLOW_STUDIO_SURFACES = getWorkflowStudioSurfaceDefinitions().filter(
  (item) => item.key !== "publish"
);

type WorkflowStudioSidebarProps = {
  workflowId: string;
  workflowName: string;
  workflowSummary?: string;
  activeStudioSurface: WorkflowStudioSurface;
  workspaceStarterLibraryHref: string;
  surfaceHrefs?: Partial<Record<WorkflowStudioSurface, string>>;
  runsHref?: string;
  className?: string;
  dataComponent?: string;
};

function resolveWorkflowStudioSidebarHref(
  workflowId: string,
  surface: WorkflowStudioSurface,
  surfaceHrefs?: Partial<Record<WorkflowStudioSurface, string>>
) {
  return surfaceHrefs?.[surface] ?? buildWorkflowStudioSurfaceHref(workflowId, surface);
}

type WorkflowStudioSidebarMenuLinkProps = {
  href: string;
  label: string;
  isActive?: boolean;
  refreshOnClick?: boolean;
};

function WorkflowStudioSidebarMenuLink({
  href,
  label,
  isActive = false,
  refreshOnClick = false
}: WorkflowStudioSidebarMenuLinkProps) {
  const router = useRouter();

  return (
    <Link
      className="workflow-studio-sidebar-link-trigger"
      data-active={isActive ? "true" : "false"}
      href={href}
      onClick={(event) => {
        if (!isActive || !refreshOnClick) {
          return;
        }

        event.preventDefault();
        router.refresh();
      }}
    >
      {label}
    </Link>
  );
}

export function WorkflowStudioSidebar({
  workflowId,
  workflowName,
  workflowSummary = "当前应用的编排、发布与运行入口。",
  activeStudioSurface,
  workspaceStarterLibraryHref,
  surfaceHrefs,
  runsHref = "/runs",
  className,
  dataComponent = "workflow-studio-sidebar"
}: WorkflowStudioSidebarProps) {
  const contentClassName = className?.trim() ? className : undefined;
  const primaryMenuItems: ItemType[] = PRIMARY_WORKFLOW_STUDIO_SURFACES.map((item) => {
    const href = resolveWorkflowStudioSidebarHref(workflowId, item.key, surfaceHrefs);

    return {
      key: item.key,
      label: (
        <WorkflowStudioSidebarMenuLink
          href={href}
          isActive={activeStudioSurface === item.key}
          label={item.label}
          refreshOnClick
        />
      )
    };
  });
  const secondaryMenuItems: ItemType[] = [
    {
      key: "publish",
      label: (
        <WorkflowStudioSidebarMenuLink
          href={resolveWorkflowStudioSidebarHref(workflowId, "publish", surfaceHrefs)}
          isActive={activeStudioSurface === "publish"}
          label="发布治理"
          refreshOnClick
        />
      )
    },
    {
      key: "runs",
      label: <WorkflowStudioSidebarMenuLink href={runsHref} label="运行诊断" />
    },
    {
      key: "starters",
      label: (
        <WorkflowStudioSidebarMenuLink
          href={workspaceStarterLibraryHref}
          label="Starter 模板"
        />
      )
    }
  ];

  return (
    <div className={contentClassName} data-component={dataComponent}>
      <div className="workflow-studio-rail-header">
        <h2 className="workflow-studio-sidebar-title">{workflowName}</h2>
        <p className="workflow-studio-sidebar-description">{workflowSummary}</p>
      </div>

      <Menu
        className="workflow-studio-sidebar-menu"
        items={primaryMenuItems}
        mode="inline"
        selectable
        selectedKeys={PRIMARY_WORKFLOW_STUDIO_SURFACES.some((item) => item.key === activeStudioSurface) ? [activeStudioSurface] : []}
      />

      <Menu
        className="workflow-studio-sidebar-menu workflow-studio-sidebar-menu-secondary"
        items={secondaryMenuItems}
        mode="inline"
        selectable
        selectedKeys={activeStudioSurface === "publish" ? ["publish"] : []}
      />
    </div>
  );
}
