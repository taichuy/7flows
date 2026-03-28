import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkflowsPage from "@/app/workflows/page";
import { getSensitiveAccessInboxSnapshot } from "@/lib/get-sensitive-access";
import { getWorkflowLibrarySnapshot } from "@/lib/get-workflow-library";
import { getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/get-workflow-publish";
import { getServerWorkspaceContext } from "@/lib/server-workspace-access";
import { getSystemOverview } from "@/lib/get-system-overview";
import { getWorkflows } from "@/lib/get-workflows";
import type { WorkspaceContextResponse } from "@/lib/workspace-access";
import {
  buildSensitiveAccessInboxSnapshotFixture,
  buildSystemOverviewFixture
} from "@/lib/workbench-page-test-fixtures";

Object.assign(globalThis, { React });

vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  }
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/components/workspace-shell", () => ({
  WorkspaceShell: ({ children }: { children: ReactNode }) =>
    createElement("div", { "data-component": "workspace-shell" }, children)
}));

vi.mock("@/lib/server-workspace-access", () => ({
  getServerWorkspaceContext: vi.fn()
}));

vi.mock("@/lib/get-workflows", () => ({
  getWorkflows: vi.fn()
}));

vi.mock("@/lib/get-system-overview", () => ({
  getSystemOverview: vi.fn()
}));

vi.mock("@/lib/get-sensitive-access", () => ({
  getSensitiveAccessInboxSnapshot: vi.fn()
}));

vi.mock("@/lib/get-workflow-library", () => ({
  getWorkflowLibrarySnapshot: vi.fn()
}));

vi.mock("@/lib/get-workflow-publish", () => ({
  getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot: vi.fn()
}));

function buildWorkspaceContext(): WorkspaceContextResponse {
  return {
    workspace: {
      id: "default",
      name: "7Flows Workspace",
      slug: "sevenflows"
    },
    current_user: {
      id: "user-admin",
      email: "admin@taichuy.com",
      display_name: "7Flows Admin",
      status: "active",
      last_login_at: "2026-03-28T09:00:00Z"
    },
    current_member: {
      id: "member-owner",
      role: "owner",
      user: {
        id: "user-admin",
        email: "admin@taichuy.com",
        display_name: "7Flows Admin",
        status: "active",
        last_login_at: "2026-03-28T09:00:00Z"
      },
      created_at: "2026-03-27T12:00:00Z",
      updated_at: "2026-03-27T12:00:00Z"
    },
    available_roles: ["owner", "admin", "editor", "viewer"],
    can_manage_members: true
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getServerWorkspaceContext).mockResolvedValue(buildWorkspaceContext());
  vi.mocked(getWorkflows).mockResolvedValue([
    {
      id: "workflow-1",
      name: "Alpha workflow",
      version: "1.0.0",
      status: "draft",
      node_count: 4,
      tool_governance: {
        referenced_tool_ids: ["tool-1"],
        missing_tool_ids: ["tool-missing"],
        governed_tool_count: 1,
        strong_isolation_tool_count: 0
      }
    }
  ] as Awaited<ReturnType<typeof getWorkflows>>);
  vi.mocked(getSystemOverview).mockResolvedValue(
    buildSystemOverviewFixture() as Awaited<ReturnType<typeof getSystemOverview>>
  );
  vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
    buildSensitiveAccessInboxSnapshotFixture() as Awaited<
      ReturnType<typeof getSensitiveAccessInboxSnapshot>
    >
  );
  vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue({
    nodes: [],
    starters: [],
    starterSourceLanes: [],
    nodeSourceLanes: [],
    toolSourceLanes: [],
    tools: []
  } as Awaited<ReturnType<typeof getWorkflowLibrarySnapshot>>);
  vi.mocked(getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot).mockResolvedValue({
    bindings: [],
    workflows: [],
    follow_up_count: 0,
    legacy_token_binding_count: 0,
    summary: []
  } as unknown as Awaited<
    ReturnType<typeof getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot>
  >);
});

describe("WorkflowsPage shell", () => {
  it("renders the workflow library inside the workspace shell", async () => {
    const html = renderToStaticMarkup(
      await WorkflowsPage({
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain('data-component="workspace-shell"');
    expect(html).toContain("应用工作台");
    expect(html).toContain('/workflows/new');
    expect(html).toContain('/workflows/workflow-1');
  });

  it("redirects unauthenticated users back to login", async () => {
    vi.mocked(getServerWorkspaceContext).mockResolvedValue(null);

    await expect(
      WorkflowsPage({
        searchParams: Promise.resolve({})
      })
    ).rejects.toThrowError("redirect:/login?next=/workflows");
  });
});
