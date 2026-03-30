import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkflowEditorPage from "@/app/workflows/[workflowId]/page";
import { getCredentials } from "@/lib/get-credentials";
import { getPluginRegistrySnapshot } from "@/lib/get-plugin-registry";
import { getServerWorkspaceContext } from "@/lib/server-workspace-access";
import { getSystemOverview } from "@/lib/get-system-overview";
import { getWorkflowLibrarySnapshot } from "@/lib/get-workflow-library";
import { getWorkflowPublishedEndpoints } from "@/lib/get-workflow-publish";
import { getWorkflowPublishGovernanceSnapshot } from "@/lib/get-workflow-publish-governance";
import { getWorkflowRuns } from "@/lib/get-workflow-runs";
import { getWorkflowDetail, getWorkflows } from "@/lib/get-workflows";
import type { WorkspaceContextResponse } from "@/lib/workspace-access";

Object.assign(globalThis, { React });

vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  },
  notFound: () => {
    throw new Error("notFound");
  }
}));

vi.mock("@/components/workspace-shell", () => ({
  WorkspaceShell: ({ children }: { children: ReactNode }) =>
    createElement("div", { "data-component": "workspace-shell" }, children)
}));

vi.mock("@/components/workflow-editor-workbench", () => ({
  WorkflowEditorWorkbench: ({ workflow }: { workflow: { id: string } }) =>
    createElement(
      "div",
      {
        "data-component": "workflow-editor-workbench",
        "data-workflow-id": workflow.id
      },
      workflow.id
    )
}));

vi.mock("@/components/workflow-publish-panel", () => ({
  WorkflowPublishPanel: ({ workflow }: { workflow: { id: string } }) =>
    createElement(
      "div",
      {
        "data-component": "workflow-publish-panel",
        "data-workflow-id": workflow.id
      },
      workflow.id
    )
}));

vi.mock("@/lib/server-workspace-access", () => ({
  getServerWorkspaceContext: vi.fn()
}));

vi.mock("@/lib/get-workflows", () => ({
  getWorkflowDetail: vi.fn(),
  getWorkflows: vi.fn()
}));

vi.mock("@/lib/get-workflow-library", () => ({
  getWorkflowLibrarySnapshot: vi.fn()
}));

vi.mock("@/lib/get-plugin-registry", () => ({
  getPluginRegistrySnapshot: vi.fn()
}));

vi.mock("@/lib/get-system-overview", () => ({
  getSystemOverview: vi.fn()
}));

vi.mock("@/lib/get-workflow-runs", () => ({
  getWorkflowRuns: vi.fn()
}));

vi.mock("@/lib/get-workflow-publish", () => ({
  getWorkflowPublishedEndpoints: vi.fn()
}));

vi.mock("@/lib/get-workflow-publish-governance", () => ({
  getWorkflowPublishGovernanceSnapshot: vi.fn()
}));

vi.mock("@/lib/get-credentials", () => ({
  getCredentials: vi.fn()
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
  vi.mocked(getWorkflowDetail).mockResolvedValue({
    id: "workflow-1",
    name: "Workflow 1"
  } as Awaited<ReturnType<typeof getWorkflowDetail>>);
  vi.mocked(getWorkflows).mockResolvedValue([] as Awaited<ReturnType<typeof getWorkflows>>);
  vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue({
    nodes: [],
    starters: [],
    starterSourceLanes: [],
    nodeSourceLanes: [],
    toolSourceLanes: [],
    tools: []
  } as Awaited<ReturnType<typeof getWorkflowLibrarySnapshot>>);
  vi.mocked(getPluginRegistrySnapshot).mockResolvedValue({
    adapters: [],
    tools: []
  } as Awaited<ReturnType<typeof getPluginRegistrySnapshot>>);
  vi.mocked(getCredentials).mockResolvedValue([] as Awaited<ReturnType<typeof getCredentials>>);
  vi.mocked(getSystemOverview).mockResolvedValue({
    callback_waiting_automation: null,
    sandbox_readiness: null,
    sandbox_backends: [],
    runtime_activity: {
      recent_runs: [],
      recent_events: [],
      summary: {
        recent_run_count: 0,
        recent_event_count: 0,
        run_statuses: {},
        event_types: {}
      }
    }
  } as unknown as Awaited<ReturnType<typeof getSystemOverview>>);
  vi.mocked(getWorkflowRuns).mockResolvedValue([] as Awaited<ReturnType<typeof getWorkflowRuns>>);
  vi.mocked(getWorkflowPublishedEndpoints).mockResolvedValue(
    [] as Awaited<ReturnType<typeof getWorkflowPublishedEndpoints>>
  );
  vi.mocked(getWorkflowPublishGovernanceSnapshot).mockResolvedValue({
    cacheInventories: {},
    apiKeysByBinding: {},
    invocationAuditsByBinding: {},
    invocationDetailsByBinding: {},
    rateLimitWindowAuditsByBinding: {}
  } as Awaited<ReturnType<typeof getWorkflowPublishGovernanceSnapshot>>);
});

describe("WorkflowEditorPage", () => {
  it("renders only the editor surface by default", async () => {
    const html = renderToStaticMarkup(
      await WorkflowEditorPage({
        params: Promise.resolve({ workflowId: "workflow-1" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain('data-component="workspace-shell"');
    expect(html).toContain('data-component="workflow-editor-workbench"');
    expect(html).not.toContain('data-component="workflow-publish-panel"');
    expect(html).toContain('data-workflow-id="workflow-1"');
    expect(html).toContain("workflow-studio-shell-bar workflow-studio-shell-bar-compact");
    expect(html).toContain("Workflow 1");
    expect(html).toContain("draft only");
    expect(html).toContain("xyflow studio");
    expect(html).toContain("运行诊断");
    expect(html).toContain("Starter 模板");
    expect(html).toContain("编排中心");
    expect(html).toContain("?surface=editor");
    expect(html).toContain("?surface=publish");
    expect(vi.mocked(getWorkflows)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getWorkflowLibrarySnapshot)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getWorkflowRuns)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getCredentials)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getWorkflowPublishedEndpoints)).not.toHaveBeenCalled();
    expect(vi.mocked(getWorkflowPublishGovernanceSnapshot)).not.toHaveBeenCalled();
  });

  it("loads only publish data when entering publish governance", async () => {
    const html = renderToStaticMarkup(
      await WorkflowEditorPage({
        params: Promise.resolve({ workflowId: "workflow-1" }),
        searchParams: Promise.resolve({ surface: "publish" })
      })
    );

    expect(html).toContain('data-component="workflow-publish-panel"');
    expect(html).not.toContain('data-component="workflow-editor-workbench"');
    expect(html).toContain("publish governance");
    expect(html).toContain("Workflow 1");
    expect(html).toContain("draft only");
    expect(vi.mocked(getWorkflowPublishedEndpoints)).toHaveBeenCalledWith("workflow-1", {
      includeAllVersions: true
    });
    expect(vi.mocked(getWorkflowPublishGovernanceSnapshot)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getCredentials)).not.toHaveBeenCalled();
    expect(vi.mocked(getWorkflows)).not.toHaveBeenCalled();
    expect(vi.mocked(getWorkflowLibrarySnapshot)).not.toHaveBeenCalled();
    expect(vi.mocked(getWorkflowRuns)).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated users back to login", async () => {
    vi.mocked(getServerWorkspaceContext).mockResolvedValue(null);

    await expect(
      WorkflowEditorPage({
        params: Promise.resolve({ workflowId: "workflow-1" }),
        searchParams: Promise.resolve({})
      })
    ).rejects.toThrowError("redirect:/login?next=/workflows/workflow-1");
  });
});
